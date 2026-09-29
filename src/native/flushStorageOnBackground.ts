import { appStateAtom } from './atoms';
import { isPromiseLike } from '../vanilla/env';
import type { Store } from '../vanilla/store';
import type { AsyncStorage, SyncStorage } from '../vanilla/utils/atomWithStorage';

/**
 * Calls `storage.flush()` (if present) on every given storage when the app
 * transitions from `'active'` to `'background'`/`'inactive'`, for storages
 * that batch or debounce writes internally.
 *
 * `atomWithStorage`'s own write path calls `storage.setItem` on every
 * `set()` — there is nothing to flush there by default. This only matters
 * if you compose a storage that batches writes itself. It's best-effort,
 * not a guarantee: `AppState`'s background event doesn't grant extra
 * execution time, so there is no pure-JS way to guarantee an in-flight
 * write completes before the OS terminates the process.
 */
export function flushStorageOnBackground(
  store: Store,
  storages: Iterable<AsyncStorage<unknown> | SyncStorage<unknown>>,
  options?: { onError?: (error: unknown) => void }
): () => void {
  const list = [...storages];
  let prev = store.get(appStateAtom);
  return store.sub(appStateAtom, () => {
    const next = store.get(appStateAtom);
    if (prev === 'active' && (next === 'background' || next === 'inactive')) {
      for (const s of list) {
        try {
          const result = s.flush?.();
          if (isPromiseLike(result)) {
            result.then(undefined, (error) => options?.onError?.(error));
          }
        } catch (error) {
          options?.onError?.(error);
        }
      }
    }
    prev = next;
  });
}
