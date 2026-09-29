import { isPromiseLike } from '../vanilla/env';
import { getStoreInternals } from '../vanilla/store';
import type { Store } from '../vanilla/store';

const continuablePromiseMap = new WeakMap<PromiseLike<unknown>, Promise<unknown>>();

/**
 * Returns a promise that keeps following the atom when its pending promise is
 * replaced (e.g. a dependency changed while loading), so Suspense resolves
 * with the latest value instead of a stale one.
 */
export const createContinuablePromise = <T>(
  store: Store,
  promise: PromiseLike<T>,
  getValue: () => PromiseLike<T> | T
): Promise<unknown> => {
  const internals = getStoreInternals(store);
  let continuablePromise = continuablePromiseMap.get(promise);
  if (!continuablePromise) {
    continuablePromise = new Promise<T>((resolve, reject) => {
      let curr = promise;
      const onFulfilled = (me: PromiseLike<T>) => (v: T) => {
        if (curr === me) {
          resolve(v);
        }
      };
      const onRejected = (me: PromiseLike<T>) => (e: unknown) => {
        if (curr === me) {
          reject(e);
        }
      };
      const onAbort = () => {
        try {
          const nextValue = getValue();
          if (isPromiseLike(nextValue)) {
            continuablePromiseMap.set(nextValue, continuablePromise!);
            curr = nextValue;
            nextValue.then(onFulfilled(nextValue), onRejected(nextValue));
            internals?.registerAbortHandler(nextValue, onAbort);
          } else {
            resolve(nextValue);
          }
        } catch (e) {
          reject(e);
        }
      };
      promise.then(onFulfilled(promise), onRejected(promise));
      internals?.registerAbortHandler(promise, onAbort);
    });
    continuablePromiseMap.set(promise, continuablePromise);
  }
  return continuablePromise;
};
