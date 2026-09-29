import type { Atom } from '../atom';
import type { Store } from '../store';
import { getStorageHydrationPromise } from './storageHydration';

/**
 * Waits for one or more `atomWithStorage` atoms to finish their first
 * hydration read, so app startup (e.g. before `SplashScreen.hideAsync()`)
 * can avoid a flash of `initialValue` before persisted data appears.
 *
 * No-ops for atoms backed by a synchronous storage (there is nothing to
 * await) and for atoms not created by `atomWithStorage`. Never rejects — a
 * failed storage read resolves the same way `atomWithStorage` already falls
 * back to `initialValue` silently.
 *
 * @example
 * await hydrateStorageAtoms(store, [settingsAtom, sessionAtom]);
 * await SplashScreen.hideAsync();
 */
export function hydrateStorageAtoms(store: Store, atoms: Iterable<Atom<unknown>>): Promise<void> {
  const promises: PromiseLike<void>[] = [];
  const unsubs: (() => void)[] = [];
  for (const a of atoms) {
    unsubs.push(store.sub(a, () => {}));
    const pending = getStorageHydrationPromise(a);
    if (pending) {
      promises.push(pending);
    }
  }
  return Promise.all(promises).then(() => {
    unsubs.forEach((unsub) => unsub());
  });
}
