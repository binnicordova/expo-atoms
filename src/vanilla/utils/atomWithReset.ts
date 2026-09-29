import { atom } from '../atom';
import type { WritableAtom } from '../atom';
import { RESET } from './constants';

type SetStateActionWithReset<Value> =
  Value | typeof RESET | ((prev: Value) => Value | typeof RESET);

/** A primitive atom that can be reset to its initial value with `RESET`. */
export function atomWithReset<Value>(
  initialValue: Value
): WritableAtom<Value, [SetStateActionWithReset<Value>], void> & { init: Value } {
  const anAtom = atom(initialValue, (get, set, update: SetStateActionWithReset<Value>) => {
    const nextValue =
      typeof update === 'function'
        ? (update as (prev: Value) => Value | typeof RESET)(get(anAtom))
        : update;
    set(anAtom, nextValue === RESET ? initialValue : nextValue);
  });
  return anAtom;
}
