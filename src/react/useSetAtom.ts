import { useCallback } from 'react';

import { useStore } from './Provider';
import type { StoreOptions } from './Provider';
import type { WritableAtom } from '../vanilla/atom';
import { isDev } from '../vanilla/env';
import type { ExtractAtomArgs, ExtractAtomResult } from '../vanilla/typeUtils';

type SetAtom<Args extends unknown[], Result> = (...args: Args) => Result;

export function useSetAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options?: StoreOptions
): SetAtom<Args, Result>;

export function useSetAtom<AtomType extends WritableAtom<unknown, never[], unknown>>(
  atom: AtomType,
  options?: StoreOptions
): SetAtom<ExtractAtomArgs<AtomType>, ExtractAtomResult<AtomType>>;

/** Returns a stable setter for an atom without subscribing to its value (no re-renders). */
export function useSetAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options?: StoreOptions
) {
  const store = useStore(options);
  return useCallback(
    (...args: Args) => {
      if (isDev() && !('write' in atom)) {
        throw new Error('[expo-atoms] Atom is not writable');
      }
      return store.set(atom, ...args);
    },
    [store, atom]
  );
}
