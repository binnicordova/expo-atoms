import { atom } from '../atom';
import type { Atom, Getter, Setter } from '../atom';
import type { Store } from '../store';

type Cleanup = () => void;

type EffectRef = {
  readonly store: Store;
  cleanup?: Cleanup;
};

/**
 * Runs an imperative side effect that tracks whatever atoms `get()` reads
 * inside `effect` — the same natural dependency tracking any derived atom's
 * `read` gets. Mount it like any atom (`useAtom(theEffect)`, or
 * `store.sub(theEffect, () => {})` outside React) to start it: it re-runs
 * (calling any previous cleanup first) whenever a tracked atom changes, and
 * cleans up on unmount. Useful for side effects that don't need a component
 * to read a value — syncing state to an external system, logging, analytics.
 *
 * Mirrors the third-party `jotai-effect` package's `atomEffect`.
 *
 * ```ts
 * const logCountEffect = atomEffect((get) => {
 *   console.log('count is now', get(countAtom));
 * });
 * useAtom(logCountEffect); // starts the effect for as long as this component is mounted
 *
 * // effects can also write other atoms:
 * const syncTitleEffect = atomEffect((get, set) => {
 *   set(documentTitleAtom, `(${get(unreadCountAtom)}) Inbox`);
 * });
 * ```
 */
export function atomEffect(effect: (get: Getter, set: Setter) => void | Cleanup): Atom<null> {
  // `unstable_onInit` is the only hook that ever hands us the owning
  // `Store` — and only once, the first time a store references an atom.
  // `refAtom` has no dependencies (its `read` never calls `get`), so per
  // the same "compute once per store" rule `atomWithLazy` relies on, it
  // computes exactly once per store — right there, it captures whichever
  // store's `onInit` most recently ran. That capture is race-free: `onInit`
  // always fires synchronously, immediately before that same store's first
  // `read()` of this atom, with nothing async in between (see `store.ts`'s
  // `ensureAtomState` -> `readAtomState`) — so by the time `read()` runs,
  // `lastInitStore` can only hold the store that's actually reading right
  // now. Every read after that (for that store) reuses the same cached ref
  // object, via the store's own per-atom caching — `lastInitStore` is never
  // consulted again for it.
  let lastInitStore: Store | undefined;
  const refAtom = atom<EffectRef>(() => ({ store: lastInitStore! }));
  refAtom.debugPrivate = true;
  refAtom.unstable_onInit = (store) => {
    lastInitStore = store;
  };

  const effectAtom = atom<null, [], void>(
    (get) => {
      const ref = get(refAtom);
      ref.cleanup?.();
      ref.cleanup = undefined;
      const set: Setter = (a, ...args) => ref.store.set(a, ...args);
      ref.cleanup = effect(get, set) || undefined;
      return null;
    },
    // Only ever invoked internally (see `onMount` below) to run the final
    // cleanup on unmount — never part of the public `Atom<null>` surface.
    (get) => {
      get(refAtom).cleanup?.();
    }
  );
  effectAtom.debugPrivate = true;
  effectAtom.onMount = (setAtom) => () => setAtom();
  return effectAtom;
}
