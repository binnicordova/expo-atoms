import { atom } from '../atom';
import type { Getter, ReadOptions, SetStateAction, WritableAtom } from '../atom';
import { RESET } from './constants';

const EMPTY = Symbol();

type Read<Value> = (get: Getter, options: ReadOptions) => Value;

/**
 * A writable atom whose default value is derived from other atoms. Once
 * written, it holds the written value until reset with `RESET`, at which
 * point it follows the derived default again.
 */
export function atomWithDefault<Value>(
  getDefault: Read<Value>
): WritableAtom<Value, [SetStateAction<Awaited<Value>> | typeof RESET], void> {
  const overwrittenAtom = atom<Value | typeof EMPTY>(EMPTY);
  overwrittenAtom.debugPrivate = true;
  const anAtom: WritableAtom<Value, [SetStateAction<Awaited<Value>> | typeof RESET], void> = atom(
    (get, options) => {
      const overwritten = get(overwrittenAtom);
      if (overwritten !== EMPTY) {
        return overwritten;
      }
      return getDefault(get, options);
    },
    (get, set, update) => {
      if (update === RESET) {
        set(overwrittenAtom, EMPTY);
      } else if (typeof update === 'function') {
        const value = get(anAtom) as Awaited<Value>;
        set(overwrittenAtom, (update as (prev: Awaited<Value>) => Value)(value));
      } else {
        set(overwrittenAtom, update as Value);
      }
    }
  );
  return anAtom;
}
