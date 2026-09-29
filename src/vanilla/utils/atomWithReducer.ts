import { atom } from '../atom';
import type { WritableAtom } from '../atom';

/** A primitive atom whose updates go through a reducer, like `useReducer`. */
export function atomWithReducer<Value, Action>(
  initialValue: Value,
  reducer: (value: Value, action: Action) => Value
): WritableAtom<Value, [Action], void> & { init: Value } {
  return atom(
    initialValue,
    function (this: WritableAtom<Value, [Action], void>, get, set, action: Action) {
      set(this as never, reducer(get(this), action) as never);
    }
  );
}
