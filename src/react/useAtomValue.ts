import React, { useDebugValue, useEffect, useReducer } from 'react';

import { useStore } from './Provider';
import type { StoreOptions } from './Provider';
import { createContinuablePromise } from './continuablePromise';
import type { Atom } from '../vanilla/atom';
import { isPromiseLike } from '../vanilla/env';
import type { Store } from '../vanilla/store';
import type { ExtractAtomValue } from '../vanilla/typeUtils';

type TrackedPromise<T> = PromiseLike<T> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: T;
  reason?: unknown;
};

const attachPromiseStatus = <T>(promise: TrackedPromise<T>) => {
  if (!promise.status) {
    promise.status = 'pending';
    promise.then(
      (v) => {
        promise.status = 'fulfilled';
        promise.value = v;
      },
      (e) => {
        promise.status = 'rejected';
        promise.reason = e;
      }
    );
  }
};

// React 19 ships `use`; keep a shim for React 18.
const use: <T>(promise: TrackedPromise<T>) => T =
  (React as unknown as { use?: <T>(p: PromiseLike<T>) => T }).use ||
  (<T>(promise: TrackedPromise<T>): T => {
    if (promise.status === 'pending') {
      throw promise;
    } else if (promise.status === 'fulfilled') {
      return promise.value as T;
    } else if (promise.status === 'rejected') {
      throw promise.reason;
    }
    attachPromiseStatus(promise);
    throw promise;
  });

export type UseAtomValueOptions = StoreOptions;

export function useAtomValue<Value>(
  atom: Atom<Value>,
  options?: UseAtomValueOptions
): Awaited<Value>;

export function useAtomValue<AtomType extends Atom<unknown>>(
  atom: AtomType,
  options?: UseAtomValueOptions
): Awaited<ExtractAtomValue<AtomType>>;

/**
 * Subscribe to an atom and return its value. Async atoms suspend (wrap in
 * `<Suspense>`), or use `loadable` / `unwrap` to avoid suspending.
 */
export function useAtomValue<Value>(atom: Atom<Value>, options?: UseAtomValueOptions) {
  const store = useStore(options);
  const [[valueFromReducer, storeFromReducer, atomFromReducer], rerender] = useReducer<
    readonly [Value, Store, typeof atom],
    undefined,
    []
  >(
    (prev) => {
      const nextValue = store.get(atom);
      if (Object.is(prev[0], nextValue) && prev[1] === store && prev[2] === atom) {
        return prev;
      }
      return [nextValue, store, atom];
    },
    undefined,
    () => [store.get(atom), store, atom]
  );

  let value = valueFromReducer;
  if (storeFromReducer !== store || atomFromReducer !== atom) {
    rerender();
    value = store.get(atom);
  }

  useEffect(() => {
    const unsub = store.sub(atom, rerender);
    // catch updates that happened between render and subscription
    rerender();
    return unsub;
  }, [store, atom]);

  useDebugValue(value);

  if (isPromiseLike(value)) {
    const promise = createContinuablePromise(store, value, () => store.get(atom));
    attachPromiseStatus(promise);
    return use(promise);
  }
  return value as Awaited<Value>;
}
