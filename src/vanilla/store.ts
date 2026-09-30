import type { Atom, Getter, Setter, WritableAtom } from './atom';
import { isDev, isPromiseLike } from './env';

/**
 * A store holds atom values. Atoms are only configs; reading or writing them
 * always happens through a store (explicitly, or via React hooks that pick
 * the nearest `<Provider>` store or the default store).
 */
export type Store = {
  /** Read the current value of an atom. Throws if the atom's read throws. */
  get: <Value>(atom: Atom<Value>) => Value;
  /** Write to an atom (calls its `write`). Returns whatever `write` returns. */
  set: <Value, Args extends unknown[], Result>(
    atom: WritableAtom<Value, Args, Result>,
    ...args: Args
  ) => Result;
  /** Subscribe to changes of an atom. Mounts it (and its dependencies). */
  sub: (atom: Atom<unknown>, listener: () => void) => () => void;
  /**
   * Runs `fn`, deferring recompute + listener notification until it
   * returns, so every `set()` call made inside it behaves like part of one
   * atomic write: listeners fire once with the final combined state, and a
   * downstream atom that depends on several of the writes recomputes once
   * (not once per write) — the same diamond-safe batching a single `set()`
   * call already does within itself, extended across multiple calls.
   * Nestable: an inner `transaction()` just extends the outer one.
   *
   * `fn` must be synchronous (like `withStorageMigration`'s `migrate`) —
   * writes made after an `await` inside `fn` happen outside the
   * transaction and are not covered by this batching.
   */
  transaction: <Result>(fn: () => Result) => Result;
};

type AnyValue = unknown;
type AnyAtom = Atom<AnyValue>;
type AnyWritableAtom = WritableAtom<AnyValue, unknown[], unknown>;
type EpochNumber = number;

/**
 * Per-store state of one atom.
 * - `d`: dependencies and the epoch they had when this atom last read them
 * - `p`: dependents whose value is a pending promise that reads this atom
 * - `n`: epoch number, incremented every time the value changes
 * - `m`: store epoch at which this state was last validated
 * - `v` / `e`: value or error
 */
type AtomState<Value = AnyValue> = {
  readonly d: Map<AnyAtom, EpochNumber>;
  readonly p: Set<AnyAtom>;
  n: EpochNumber;
  m?: EpochNumber;
  v?: Value;
  e?: unknown;
};

/**
 * Mount info, present only while an atom is subscribed (directly or through
 * a dependent).
 * - `l`: listeners
 * - `d`: mounted dependencies
 * - `t`: mounted dependents
 * - `u`: onUnmount cleanup
 */
type Mounted = {
  readonly l: Set<() => void>;
  readonly d: Set<AnyAtom>;
  readonly t: Set<AnyAtom>;
  u?: () => void;
};

/** A single `store.set()` call's cause and every atom recomputed downstream of it. */
type TraceEvent = { cause: AnyAtom; effects: AnyAtom[] };
type TraceHandler = (event: TraceEvent) => void;

type StoreInternals = {
  registerAbortHandler: (promise: PromiseLike<unknown>, handler: () => void) => void;
  /**
   * @internal Used by `traceAtomUpdates` (dev-mode "why did this change"
   * causality trace). Fires once per top-level `store.set()` call, with the
   * atom passed to `set()` and every atom `recomputeInvalidatedAtoms`
   * recomputed as a downstream effect of that write — multi-hop and
   * diamond-shaped graphs included, each atom listed exactly once. A
   * nested/re-entrant `store.set()` call (e.g. a listener that writes a
   * different atom) is its own, separate event.
   */
  registerTraceHandler: (handler: TraceHandler) => () => void;
};

const storeInternalsMap = new WeakMap<Store, StoreInternals>();

/** @internal Used by the React bindings to follow promises that get replaced. */
export const getStoreInternals = (store: Store): StoreInternals | undefined =>
  storeInternalsMap.get(store);

const hasInitialValue = <T extends AnyAtom>(atom: T): atom is T & { init: AnyValue } =>
  'init' in atom;

const isActuallyWritableAtom = (atom: AnyAtom): atom is AnyWritableAtom =>
  !!(atom as AnyWritableAtom).write;

const isAtomStateInitialized = (atomState: AtomState): boolean =>
  'v' in atomState || 'e' in atomState;

const returnAtomValue = <Value>(atomState: AtomState<Value>): Value => {
  if ('e' in atomState) {
    throw atomState.e;
  }
  if (isDev() && !('v' in atomState)) {
    throw new Error('[expo-atoms] Bug: atom state is not initialized');
  }
  return atomState.v as Value;
};

const shouldThrowSynchronously = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    (error.name === 'RangeError' || error.name === 'InternalError') &&
    (message.includes('call stack') ||
      message.includes('too much recursion') ||
      message.includes('stack overflow'))
  );
};

const addPendingPromiseToDependency = (
  atom: AnyAtom,
  promise: PromiseLike<AnyValue>,
  dependencyAtomState: AtomState
) => {
  if (!dependencyAtomState.p.has(atom)) {
    dependencyAtomState.p.add(atom);
    const cleanup = () => dependencyAtomState.p.delete(atom);
    promise.then(cleanup, cleanup);
  }
};

/** Create an isolated store. */
export function createStore(): Store {
  const atomStateMap = new WeakMap<AnyAtom, AtomState>();
  const mountedMap = new WeakMap<AnyAtom, Mounted>();
  const invalidatedAtoms = new WeakMap<AnyAtom, EpochNumber>();
  const changedAtoms = new Set<AnyAtom>();
  const mountCallbacks = new Set<() => void>();
  const unmountCallbacks = new Set<() => void>();
  const abortHandlersMap = new WeakMap<PromiseLike<unknown>, Set<() => void>>();
  let storeEpoch: EpochNumber = 0;
  // assigned right below; referenced lazily by onInit
  let store: Store;

  // --- dev-mode causality trace (traceAtomUpdates) ---
  // Empty whenever no trace handler is registered, so the hot path only
  // ever pays for a `.length` check (see the `hasChangedDeps` branch in
  // `recomputeInvalidatedAtoms` and `set`/`transaction` below) — no Set
  // allocation, no extra work, when tracing isn't in use. The two stacks
  // are parallel: `traceEffectsStack`'s top Set accumulates every atom
  // recomputed for the batch currently committing (one `set()` call, or one
  // whole `transaction()`); `traceCausesStack`'s top array accumulates the
  // atom(s) passed to `set()` for that same batch — one for a plain `set()`
  // call, possibly several for a `transaction()`. Only the outermost `set`/
  // `transaction` call for a given batch pushes a frame; a `set()` nested
  // inside an open transaction just appends itself to the existing top
  // frame's causes instead of starting its own (its effects aren't known
  // yet — recompute is deferred to the transaction's commit).
  const traceHandlers = new Set<TraceHandler>();
  const traceEffectsStack: Set<AnyAtom>[] = [];
  const traceCausesStack: AnyAtom[][] = [];

  // --- transactions (store.transaction) ---
  // >0 while inside a `transaction()` call (nestable); `set()` accumulates
  // into `changedAtoms` as usual but skips its own recompute + flush while
  // this is nonzero, deferring both to the outermost `transaction()` call.
  let transactionDepth = 0;

  const registerAbortHandler = (promise: PromiseLike<unknown>, handler: () => void) => {
    let handlers = abortHandlersMap.get(promise);
    if (!handlers) {
      handlers = new Set();
      abortHandlersMap.set(promise, handlers);
      const cleanup = () => abortHandlersMap.delete(promise);
      promise.then(cleanup, cleanup);
    }
    handlers.add(handler);
  };

  const registerTraceHandler = (handler: TraceHandler) => {
    traceHandlers.add(handler);
    return () => {
      traceHandlers.delete(handler);
    };
  };

  const abortPromise = (promise: PromiseLike<unknown>) => {
    abortHandlersMap.get(promise)?.forEach((fn) => fn());
  };

  const ensureAtomState = <Value>(atom: Atom<Value>): AtomState<Value> => {
    let atomState = atomStateMap.get(atom);
    if (!atomState) {
      atomState = { d: new Map(), p: new Set(), n: 0 };
      atomStateMap.set(atom, atomState);
      atom.unstable_onInit?.(store);
    }
    return atomState as AtomState<Value>;
  };

  const getMountedOrPendingDependents = (
    atom: AnyAtom,
    atomState: AtomState
  ): Iterable<AnyAtom> => {
    const mountedDependents = mountedMap.get(atom)?.t;
    const pendingDependents = atomState.p;
    if (!mountedDependents?.size) {
      return pendingDependents;
    }
    if (!pendingDependents.size) {
      return mountedDependents;
    }
    const dependents = new Set<AnyAtom>(mountedDependents);
    pendingDependents.forEach((a) => dependents.add(a));
    return dependents;
  };

  const setAtomStateValueOrPromise = (atom: AnyAtom, valueOrPromise: unknown) => {
    const atomState = ensureAtomState(atom);
    const hasPrevValue = 'v' in atomState;
    const prevValue = atomState.v;
    if (isPromiseLike(valueOrPromise)) {
      for (const a of atomState.d.keys()) {
        addPendingPromiseToDependency(atom, valueOrPromise, ensureAtomState(a));
      }
    }
    atomState.v = valueOrPromise;
    delete atomState.e;
    if (!hasPrevValue || !Object.is(prevValue, atomState.v)) {
      ++atomState.n;
      if (isPromiseLike(prevValue)) {
        abortPromise(prevValue);
      }
    }
  };

  const flushCallbacks = () => {
    if (!changedAtoms.size && !mountCallbacks.size && !unmountCallbacks.size) {
      return;
    }
    const errors: unknown[] = [];
    const call = (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        errors.push(e);
      }
    };
    do {
      const callbacks = new Set<() => void>();
      changedAtoms.forEach((atom) => {
        mountedMap.get(atom)?.l.forEach((listener) => callbacks.add(listener));
      });
      changedAtoms.clear();
      unmountCallbacks.forEach((fn) => callbacks.add(fn));
      unmountCallbacks.clear();
      mountCallbacks.forEach((fn) => callbacks.add(fn));
      mountCallbacks.clear();
      callbacks.forEach(call);
      if (changedAtoms.size) {
        recomputeInvalidatedAtoms();
      }
    } while (changedAtoms.size || unmountCallbacks.size || mountCallbacks.size);
    if (errors.length) {
      if (typeof AggregateError === 'function') {
        throw new AggregateError(errors);
      }
      throw Object.assign(new Error('[expo-atoms] Errors in listeners'), { errors });
    }
  };

  const recomputeInvalidatedAtoms = () => {
    if (!changedAtoms.size) {
      return;
    }
    // Step 1: topological sort (reversed) of every dependent of the changed atoms.
    const sortedReversedAtoms: AnyAtom[] = [];
    const sortedReversedStates: AtomState[] = [];
    const visiting = new WeakSet<AnyAtom>();
    const visited = new WeakSet<AnyAtom>();
    const stackAtoms: AnyAtom[] = [];
    const stackStates: AtomState[] = [];
    changedAtoms.forEach((atom) => {
      stackAtoms.push(atom);
      stackStates.push(ensureAtomState(atom));
    });
    while (stackAtoms.length) {
      const top = stackAtoms.length - 1;
      const a = stackAtoms[top]!;
      const aState = stackStates[top]!;
      if (visited.has(a)) {
        stackAtoms.pop();
        stackStates.pop();
        continue;
      }
      if (visiting.has(a)) {
        if (invalidatedAtoms.get(a) === aState.n) {
          sortedReversedAtoms.push(a);
          sortedReversedStates.push(aState);
        }
        visited.add(a);
        stackAtoms.pop();
        stackStates.pop();
        continue;
      }
      visiting.add(a);
      for (const d of getMountedOrPendingDependents(a, aState)) {
        if (!visiting.has(d)) {
          stackAtoms.push(d);
          stackStates.push(ensureAtomState(d));
        }
      }
    }
    // Step 2: recompute in topological order, skipping atoms whose deps didn't change.
    for (let i = sortedReversedAtoms.length - 1; i >= 0; --i) {
      const a = sortedReversedAtoms[i]!;
      const aState = sortedReversedStates[i]!;
      let hasChangedDeps = false;
      for (const dep of aState.d.keys()) {
        if (dep !== a && changedAtoms.has(dep)) {
          hasChangedDeps = true;
          break;
        }
      }
      if (hasChangedDeps) {
        invalidatedAtoms.set(a, aState.n);
        readAtomState(a);
        mountDependencies(a);
        if (traceEffectsStack.length) {
          traceEffectsStack[traceEffectsStack.length - 1]!.add(a);
        }
      }
      invalidatedAtoms.delete(a);
    }
  };

  const readAtomState = <Value>(atom: Atom<Value>): AtomState<Value> => {
    const atomState = ensureAtomState(atom);
    const currentStoreEpoch = storeEpoch;
    // Try to reuse the cached value.
    if (isAtomStateInitialized(atomState)) {
      if (
        // Mounted atoms are kept fresh by their dependencies, unless invalidated.
        (mountedMap.has(atom) && invalidatedAtoms.get(atom) !== atomState.n) ||
        // Unmounted atoms are fresh if nothing was written since last validation.
        atomState.m === currentStoreEpoch
      ) {
        atomState.m = currentStoreEpoch;
        return atomState;
      }
      let hasChangedDeps = false;
      for (const [a, n] of atomState.d) {
        if (readAtomState(a).n !== n) {
          hasChangedDeps = true;
          break;
        }
      }
      if (!hasChangedDeps) {
        atomState.m = currentStoreEpoch;
        return atomState;
      }
    }
    // Compute a new value.
    let isSync = true;
    const prevDeps = new Set<AnyAtom>(atomState.d.keys());
    const pruneDependencies = () => {
      prevDeps.forEach((a) => atomState.d.delete(a));
    };
    const mountDependenciesIfAsync = () => {
      if (mountedMap.has(atom)) {
        const shouldRecompute = !changedAtoms.size;
        mountDependencies(atom);
        if (shouldRecompute) {
          recomputeInvalidatedAtoms();
          flushCallbacks();
        }
      }
    };
    const getter: Getter = <V>(a: Atom<V>) => {
      if ((a as AnyAtom) === (atom as AnyAtom)) {
        const aState = ensureAtomState(a);
        if (!isAtomStateInitialized(aState)) {
          if (hasInitialValue(a)) {
            setAtomStateValueOrPromise(a, a.init);
          } else {
            throw new Error('[expo-atoms] No initial value for self-referencing atom');
          }
        }
        return returnAtomValue(aState);
      }
      const aState = readAtomState(a);
      try {
        return returnAtomValue(aState);
      } finally {
        prevDeps.delete(a);
        atomState.d.set(a, aState.n);
        if (isPromiseLike(atomState.v)) {
          addPendingPromiseToDependency(atom, atomState.v, aState);
        }
        if (mountedMap.has(atom)) {
          mountedMap.get(a)?.t.add(atom);
        }
        if (!isSync) {
          mountDependenciesIfAsync();
        }
      }
    };
    let controller: AbortController | undefined;
    const options = {
      get signal() {
        if (!controller) {
          controller = new AbortController();
        }
        return controller.signal;
      },
    };
    const prevEpochNumber = atomState.n;
    const prevInvalidated = invalidatedAtoms.get(atom) === prevEpochNumber;
    try {
      const valueOrPromise = atom.read(getter, options);
      setAtomStateValueOrPromise(atom, valueOrPromise);
      if (isPromiseLike(valueOrPromise)) {
        registerAbortHandler(valueOrPromise, () => controller?.abort());
        const settle = () => {
          pruneDependencies();
          mountDependenciesIfAsync();
        };
        valueOrPromise.then(settle, settle);
      } else {
        pruneDependencies();
      }
      atomState.m = currentStoreEpoch;
      return atomState;
    } catch (error) {
      if (shouldThrowSynchronously(error)) {
        throw error;
      }
      delete atomState.v;
      atomState.e = error;
      ++atomState.n;
      atomState.m = currentStoreEpoch;
      return atomState;
    } finally {
      isSync = false;
      if (atomState.n !== prevEpochNumber && prevInvalidated) {
        invalidatedAtoms.set(atom, atomState.n);
        changedAtoms.add(atom);
      }
    }
  };

  const invalidateDependents = (atom: AnyAtom) => {
    const stack: AnyAtom[] = [atom];
    while (stack.length) {
      const a = stack.pop()!;
      const aState = ensureAtomState(a);
      for (const d of getMountedOrPendingDependents(a, aState)) {
        const dState = ensureAtomState(d);
        if (invalidatedAtoms.get(d) !== dState.n) {
          invalidatedAtoms.set(d, dState.n);
          stack.push(d);
        }
      }
    }
  };

  const writeAtomState = <Value, Args extends unknown[], Result>(
    atom: WritableAtom<Value, Args, Result>,
    args: Args
  ): Result => {
    let isSync = true;
    const getter: Getter = <V>(a: Atom<V>) => returnAtomValue(readAtomState(a));
    const setter: Setter = <V, As extends unknown[], R>(
      a: WritableAtom<V, As, R>,
      ...setArgs: As
    ) => {
      const aState = ensureAtomState(a);
      try {
        if ((a as AnyAtom) === (atom as AnyAtom)) {
          if (!hasInitialValue(a)) {
            throw new Error('[expo-atoms] Atom not writable: derived atoms cannot set themselves');
          }
          const prevEpochNumber = aState.n;
          setAtomStateValueOrPromise(a, setArgs[0]);
          mountDependencies(a);
          if (prevEpochNumber !== aState.n) {
            ++storeEpoch;
            changedAtoms.add(a);
            invalidateDependents(a);
          }
          return undefined as R;
        }
        return writeAtomState(a, setArgs);
      } finally {
        // Writes that happen asynchronously (after `await` in a write) flush on their own.
        if (!isSync) {
          recomputeInvalidatedAtoms();
          flushCallbacks();
        }
      }
    };
    try {
      return atom.write(getter, setter, ...args);
    } finally {
      isSync = false;
    }
  };

  const mountDependencies = (atom: AnyAtom) => {
    const atomState = ensureAtomState(atom);
    const mounted = mountedMap.get(atom);
    if (mounted && atomState.d.size > 0) {
      for (const [a, n] of atomState.d) {
        if (!mounted.d.has(a)) {
          const aState = ensureAtomState(a);
          const aMounted = mountAtom(a);
          aMounted.t.add(atom);
          mounted.d.add(a);
          if (n !== aState.n) {
            changedAtoms.add(a);
            invalidateDependents(a);
          }
        }
      }
      for (const a of mounted.d) {
        if (!atomState.d.has(a)) {
          mounted.d.delete(a);
          unmountAtom(a)?.t.delete(atom);
        }
      }
    }
  };

  const mountAtom = (atom: AnyAtom): Mounted => {
    const atomState = ensureAtomState(atom);
    let mounted = mountedMap.get(atom);
    if (!mounted) {
      readAtomState(atom);
      for (const a of atomState.d.keys()) {
        mountAtom(a).t.add(atom);
      }
      mounted = { l: new Set(), d: new Set(atomState.d.keys()), t: new Set() };
      mountedMap.set(atom, mounted);
      if (isActuallyWritableAtom(atom) && atom.onMount) {
        const onMount = atom.onMount;
        const currentMounted = mounted;
        mountCallbacks.add(() => {
          let isSync = true;
          const setAtom = (...args: unknown[]) => {
            try {
              return writeAtomState(atom, args);
            } finally {
              if (!isSync) {
                recomputeInvalidatedAtoms();
                flushCallbacks();
              }
            }
          };
          try {
            const onUnmount = onMount(setAtom);
            if (onUnmount) {
              currentMounted.u = () => {
                isSync = true;
                try {
                  onUnmount();
                } finally {
                  isSync = false;
                }
              };
            }
          } finally {
            isSync = false;
          }
        });
      }
    }
    return mounted;
  };

  const unmountAtom = (atom: AnyAtom): Mounted | undefined => {
    const atomState = ensureAtomState(atom);
    const mounted = mountedMap.get(atom);
    if (!mounted || mounted.l.size) {
      return mounted;
    }
    let isDependent = false;
    for (const a of mounted.t) {
      if (mountedMap.get(a)?.d.has(atom)) {
        isDependent = true;
        break;
      }
    }
    if (isDependent) {
      return mounted;
    }
    if (mounted.u) {
      unmountCallbacks.add(mounted.u);
    }
    mountedMap.delete(atom);
    for (const a of atomState.d.keys()) {
      unmountAtom(a)?.t.delete(atom);
    }
    return undefined;
  };

  store = {
    get: (atom) => returnAtomValue(readAtomState(atom)),
    set: (atom, ...args) => {
      const prevChangedAtomsSize = changedAtoms.size;
      // `isOutermost`: are we the boundary responsible for committing (not
      // nested inside an open `transaction()`)? Only the outermost call
      // recomputes/flushes and owns a trace frame; a `set()` nested inside
      // a transaction just contributes its atom as an extra cause to the
      // transaction's frame (if one is open) and otherwise defers entirely.
      const isOutermost = transactionDepth === 0;
      const tracing = isOutermost && traceHandlers.size > 0;
      if (tracing) {
        traceEffectsStack.push(new Set<AnyAtom>());
        traceCausesStack.push([]);
      }
      try {
        return writeAtomState(atom, args);
      } finally {
        // A write that doesn't actually change anything (e.g. setting the
        // same value) reports no trace event — nothing changed, nothing to
        // explain — and doesn't count as a "cause" contributed to an
        // enclosing transaction either.
        const changed = changedAtoms.size !== prevChangedAtomsSize;
        if (!isOutermost && changed && traceCausesStack.length) {
          traceCausesStack[traceCausesStack.length - 1]!.push(atom);
        }
        if (isOutermost && changed) {
          recomputeInvalidatedAtoms();
          flushCallbacks();
        }
        if (tracing) {
          const effects = traceEffectsStack.pop()!;
          const causes = traceCausesStack.pop()!;
          if (changed) {
            causes.push(atom);
          }
          causes.forEach((cause) => {
            const effectsForCause = [...effects].filter((effect) => effect !== cause);
            traceHandlers.forEach((handler) => handler({ cause, effects: effectsForCause }));
          });
        }
      }
    },
    transaction: (fn) => {
      const isOutermost = transactionDepth === 0;
      const tracing = isOutermost && traceHandlers.size > 0;
      if (tracing) {
        traceEffectsStack.push(new Set<AnyAtom>());
        traceCausesStack.push([]);
      }
      transactionDepth++;
      try {
        return fn();
      } finally {
        transactionDepth--;
        if (transactionDepth === 0) {
          recomputeInvalidatedAtoms();
          flushCallbacks();
        }
        if (tracing) {
          const effects = traceEffectsStack.pop()!;
          const causes = traceCausesStack.pop()!;
          causes.forEach((cause) => {
            const effectsForCause = [...effects].filter((effect) => effect !== cause);
            traceHandlers.forEach((handler) => handler({ cause, effects: effectsForCause }));
          });
        }
      }
    },
    sub: (atom, listener) => {
      const mounted = mountAtom(atom);
      mounted.l.add(listener);
      recomputeInvalidatedAtoms();
      flushCallbacks();
      return () => {
        mounted.l.delete(listener);
        unmountAtom(atom);
        recomputeInvalidatedAtoms();
        flushCallbacks();
      };
    },
  };
  storeInternalsMap.set(store, { registerAbortHandler, registerTraceHandler });
  return store;
}

const DEFAULT_STORE_KEY = '__EXPO_ATOMS_DEFAULT_STORE__';
let defaultStore: Store | undefined;

/**
 * The store used by hooks outside of any `<Provider>`. It is created lazily
 * and shared across the whole JS runtime (it lives until the JS bundle is
 * reloaded, e.g. by an `expo-updates` reload).
 */
export function getDefaultStore(): Store {
  if (!defaultStore) {
    defaultStore = createStore();
    if (isDev()) {
      const g = globalThis as { [DEFAULT_STORE_KEY]?: Store };
      g[DEFAULT_STORE_KEY] ||= defaultStore;
      if (g[DEFAULT_STORE_KEY] !== defaultStore) {
        console.warn(
          '[expo-atoms] Detected multiple copies of expo-atoms. The default store is not shared between them; dedupe the dependency.'
        );
      }
    }
  }
  return defaultStore;
}
