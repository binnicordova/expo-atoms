/**
 * Official test helpers for `expo-atoms`. A separate entry point —
 * `import { createTestStore, flushMicrotasks, waitFor } from 'expo-atoms/test-utils'`
 * — so none of this ever ends up in a production bundle (it isn't
 * re-exported from `expo-atoms` or `expo-atoms/vanilla`).
 *
 * "How do I reset atoms between tests" is a recurring, never-officially-
 * answered question in the Jotai ecosystem: every team ends up inventing
 * the "fresh `createStore()` per test" convention for itself, and hand-
 * rolling a `flush()`-style microtask-wait helper for async atom tests.
 * This packages both, plus a small `waitFor` poller, under an obvious,
 * discoverable name.
 */
import type { Atom, Store } from './vanilla/index';
import { createStore } from './vanilla/store';

/**
 * Creates a fresh, isolated `Store` for a single test. A thin, documented
 * wrapper around `createStore` — same behavior, just an obvious name to
 * reach for in a `beforeEach`, instead of every test suite reinventing the
 * "one store per test" convention for itself.
 *
 * ```ts
 * let store: ReturnType<typeof createTestStore>;
 * beforeEach(() => {
 *   store = createTestStore();
 * });
 * ```
 */
export function createTestStore(): Store {
  return createStore();
}

/**
 * Waits one macrotask turn — enough for any microtasks queued so far
 * (promise `.then()` chains, `atomWithStorage`'s async hydration, etc.) to
 * settle. Packages the inline `flush()` helper most `expo-atoms` test
 * suites (and this library's own) end up hand-rolling:
 * `const flush = () => new Promise((r) => setTimeout(r, 0))`.
 *
 * ```ts
 * store.set(asyncAtom, 'go');
 * await flushMicrotasks();
 * expect(store.get(asyncAtom)).toBe(/* settled value *\/);
 * ```
 */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Subscribes to `atom` and polls `store.get(atom)` against `predicate`,
 * resolving with the first value that satisfies it — or rejecting after
 * `timeout` ms (default 1000). Useful for async atom tests instead of
 * hand-rolling a wait loop; subscribing (rather than a bare `store.get`)
 * ensures an async atom actually progresses.
 *
 * `store.get(atom)` on an async atom returns the pending `Promise` itself
 * (this library never implicitly unwraps it — see the main README); wrap
 * with `loadable`/`unwrap` first if you want `predicate` to see a plain
 * settled value instead.
 *
 * ```ts
 * store.set(userIdAtom, 2);
 * const user = await waitFor(store, userAtom, (u) => u.id === 2);
 * ```
 */
export function waitFor<Value>(
  store: Store,
  atom: Atom<Value>,
  predicate: (value: Value) => boolean,
  options?: { timeout?: number }
): Promise<Value> {
  const timeout = options?.timeout ?? 1000;
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    let unsub: () => void;
    const finish = (run: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsub();
      run();
    };
    const check = () => {
      let value: Value;
      try {
        value = store.get(atom);
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      if (predicate(value)) {
        finish(() => resolve(value));
      }
    };
    unsub = store.sub(atom, check);
    timer = setTimeout(
      () => finish(() => reject(new Error('[expo-atoms] waitFor: timed out waiting for atom'))),
      timeout
    );
    check();
  });
}
