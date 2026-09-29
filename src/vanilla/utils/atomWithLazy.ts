import { atom } from '../atom';
import type { PrimitiveAtom } from '../atom';

/**
 * A primitive atom whose initial value is computed lazily, once per store,
 * the first time the atom is read.
 */
export function atomWithLazy<Value>(makeInitial: () => Value): PrimitiveAtom<Value> {
  const a = atom(undefined as unknown as Value);
  delete (a as { init?: Value }).init;
  Object.defineProperty(a, 'init', {
    get() {
      return makeInitial();
    },
    enumerable: true,
  });
  return a;
}
