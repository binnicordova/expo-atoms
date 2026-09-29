import { atom } from '../atom';
import type { Getter, ReadOptions, WritableAtom } from '../atom';

type Read<Value> = (get: Getter, options: ReadOptions) => Value;
type Write<Args extends unknown[], Result> = WritableAtom<unknown, Args, Result>['write'];

/**
 * A derived atom that can be forced to re-evaluate by calling its setter with
 * no arguments. Useful for re-fetching async data (pull-to-refresh).
 */
export function atomWithRefresh<Value, Args extends unknown[], Result>(
  read: Read<Value>,
  write: Write<Args, Result>
): WritableAtom<Value, Args | [], Result | void>;

export function atomWithRefresh<Value>(read: Read<Value>): WritableAtom<Value, [], void>;

export function atomWithRefresh<Value, Args extends unknown[], Result>(
  read: Read<Value>,
  write?: Write<Args, Result>
) {
  const refreshAtom = atom(0);
  refreshAtom.debugPrivate = true;
  return atom(
    (get, options) => {
      get(refreshAtom);
      return read(get, options);
    },
    (get, set, ...args: Args) => {
      if (args.length === 0) {
        set(refreshAtom, (c) => c + 1);
        return undefined;
      } else if (write) {
        return write(get, set, ...args);
      } else {
        throw new Error('[expo-atoms] atomWithRefresh: not writable');
      }
    }
  );
}
