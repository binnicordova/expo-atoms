import { atom } from '../atom';
import type { Atom } from '../atom';

const EMPTY = Symbol();

const memoCache = new WeakMap<object, WeakMap<object, WeakMap<object, unknown>>>();

const memo3 = <T>(create: () => T, a: object, b: object, c: object): T => {
  let m1 = memoCache.get(a);
  if (!m1) {
    m1 = new WeakMap();
    memoCache.set(a, m1);
  }
  let m2 = m1.get(b);
  if (!m2) {
    m2 = new WeakMap();
    m1.set(b, m2);
  }
  if (!m2.has(c)) {
    m2.set(c, create());
  }
  return m2.get(c) as T;
};

/**
 * Derive a slice of another atom. Components reading it only re-render when
 * the selected slice changes according to `equalityFn` (default `Object.is`).
 * Memoized per (atom, selector, equalityFn) so it is safe to call in render,
 * as long as `selector` / `equalityFn` are stable references.
 */
export function selectAtom<Value, Slice>(
  anAtom: Atom<Value>,
  selector: (v: Value, prevSlice?: Slice) => Slice,
  equalityFn: (a: Slice, b: Slice) => boolean = Object.is
): Atom<Slice> {
  return memo3(
    () => {
      const selectValue = ([value, prevSlice]: readonly [Value, Slice | typeof EMPTY]) => {
        if (prevSlice === EMPTY) {
          return selector(value);
        }
        const slice = selector(value, prevSlice);
        return equalityFn(prevSlice, slice) ? prevSlice : slice;
      };
      const derivedAtom: Atom<Slice | typeof EMPTY> & { init?: typeof EMPTY } = atom((get) => {
        const prev = get(derivedAtom);
        const value = get(anAtom);
        return selectValue([value, prev] as const);
      });
      // Lets the atom read its own previous value on first evaluation.
      derivedAtom.init = EMPTY;
      return derivedAtom as Atom<Slice>;
    },
    anAtom,
    selector,
    equalityFn
  );
}
