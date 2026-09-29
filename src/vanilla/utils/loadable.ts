import { atom } from '../atom';
import type { Atom } from '../atom';
import { unwrap } from './unwrap';

export type Loadable<Value> =
  | { state: 'loading' }
  | { state: 'hasError'; error: unknown }
  | { state: 'hasData'; data: Awaited<Value> };

const LOADING = { state: 'loading' } as const;
const cache = new WeakMap<Atom<unknown>, Atom<Loadable<unknown>>>();

/**
 * Wraps an async atom so it never suspends or throws; instead you get
 * `{ state: 'loading' | 'hasData' | 'hasError' }`.
 */
export function loadable<Value>(anAtom: Atom<Value>): Atom<Loadable<Value>> {
  const cached = cache.get(anAtom);
  if (cached) {
    return cached as Atom<Loadable<Value>>;
  }
  const unwrapped = unwrap(anAtom, () => LOADING as Loadable<Value>);
  const loadableAtom = atom((get): Loadable<Value> => {
    try {
      const value = get(unwrapped);
      if (value === LOADING) {
        return LOADING;
      }
      return { state: 'hasData', data: value as Awaited<Value> };
    } catch (error) {
      return { state: 'hasError', error };
    }
  });
  loadableAtom.debugPrivate = true;
  cache.set(anAtom, loadableAtom as Atom<Loadable<unknown>>);
  return loadableAtom;
}
