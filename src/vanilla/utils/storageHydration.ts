import type { Atom } from '../atom';

const hydrationMap = new WeakMap<Atom<unknown>, PromiseLike<void>>();

/**
 * @internal Registers the settle-promise of an `atomWithStorage` atom's most
 * recent async storage read, so `hydrateStorageAtoms` can await it. Never
 * populated for sync storage — `load()` only calls this from its async
 * branch, which is exactly how "no-op for sync atoms" falls out for free.
 */
export const registerStorageHydration = (atom: Atom<unknown>, promise: PromiseLike<void>): void => {
  hydrationMap.set(atom, promise);
};

/** @internal */
export const getStorageHydrationPromise = (atom: Atom<unknown>): PromiseLike<void> | undefined =>
  hydrationMap.get(atom);
