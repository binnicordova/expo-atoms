import { useCallback, useMemo } from 'react';

import { useStore } from './Provider';
import type { StoreOptions } from './Provider';
import { useAtom } from './useAtom';
import { useSetAtom } from './useSetAtom';
import { atom } from '../vanilla/atom';
import type { Getter, Setter, WritableAtom } from '../vanilla/atom';
import type { Store } from '../vanilla/store';
import { RESET } from '../vanilla/utils/constants';

/**
 * Returns a stable function that can read and write any atom imperatively,
 * without subscribing. Handy for event handlers.
 */
export function useAtomCallback<Result, Args extends unknown[]>(
  callback: (get: Getter, set: Setter, ...args: Args) => Result,
  options?: StoreOptions
): (...args: Args) => Result {
  const anAtom = useMemo(
    () => atom(null, (get, set, ...args: Args) => callback(get, set, ...args)),
    [callback]
  );
  return useSetAtom(anAtom, options);
}

/** Returns a function that sets a resettable atom to `RESET`. */
export function useResetAtom<T>(
  anAtom: WritableAtom<unknown, [typeof RESET], T>,
  options?: StoreOptions
): () => T {
  const setAtom = useSetAtom(anAtom, options);
  return useCallback(() => setAtom(RESET), [setAtom]);
}

/** `useReducer` over a primitive atom. */
export function useReducerAtom<Value, Action>(
  anAtom: WritableAtom<Value, [Value], void>,
  reducer: (v: Value, a: Action) => Value,
  options?: StoreOptions
): [Awaited<Value>, (action: Action) => void] {
  const [state, setState] = useAtom(anAtom, options);
  const dispatch = useCallback(
    (action: Action) => {
      setState(reducer(state as Value, action));
    },
    [setState, reducer, state]
  );
  return [state, dispatch];
}

type AnyWritableAtom = WritableAtom<any, any[], any>;

const hydratedMap = new WeakMap<Store, WeakSet<AnyWritableAtom>>();

/**
 * Sets initial values for atoms once per store (e.g. values from route
 * params, a server response, or a deep link). Later renders are no-ops
 * unless `dangerouslyForceHydrate` is set.
 */
export function useHydrateAtoms(
  values: Iterable<readonly [AnyWritableAtom, ...unknown[]]>,
  options?: StoreOptions & { dangerouslyForceHydrate?: boolean }
): void {
  const store = useStore(options);
  let hydratedSet = hydratedMap.get(store);
  if (!hydratedSet) {
    hydratedSet = new WeakSet();
    hydratedMap.set(store, hydratedSet);
  }
  for (const [anAtom, ...args] of values) {
    if (!hydratedSet.has(anAtom) || options?.dangerouslyForceHydrate) {
      hydratedSet.add(anAtom);
      store.set(anAtom, ...args);
    }
  }
}
