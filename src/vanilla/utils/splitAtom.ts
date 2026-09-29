import { atom } from '../atom';
import type { Atom, PrimitiveAtom, SetStateAction, WritableAtom } from '../atom';

type SplitAtomAction<Item> =
  | { type: 'remove'; atom: PrimitiveAtom<Item> }
  | { type: 'insert'; value: Item; before?: PrimitiveAtom<Item> }
  | { type: 'move'; atom: PrimitiveAtom<Item>; before?: PrimitiveAtom<Item> };

type Mapping<Item, Key> = {
  arr: readonly Item[];
  keyList: Key[];
  atomList: PrimitiveAtom<Item>[];
};

const cache = new WeakMap<object, WeakMap<object, unknown>>();
const DEFAULT_KEY = {};

export function splitAtom<Item, Key>(
  arrAtom: WritableAtom<Item[], [Item[]], void>,
  keyExtractor?: (item: Item) => Key
): WritableAtom<PrimitiveAtom<Item>[], [SplitAtomAction<Item>], void>;

export function splitAtom<Item, Key>(
  arrAtom: Atom<Item[]>,
  keyExtractor?: (item: Item) => Key
): Atom<Atom<Item>[]>;

/**
 * Splits an array atom into an array of item atoms, so each row of a list
 * can subscribe to (and update) only its own item. Pass `keyExtractor` to
 * keep item atoms stable across reorders.
 */
export function splitAtom<Item, Key>(
  arrAtom: WritableAtom<Item[], [Item[]], void> | Atom<Item[]>,
  keyExtractor?: (item: Item) => Key
) {
  let byKey = cache.get(arrAtom);
  if (!byKey) {
    byKey = new WeakMap();
    cache.set(arrAtom, byKey);
  }
  const cacheKey = keyExtractor ?? DEFAULT_KEY;
  if (byKey.has(cacheKey)) {
    return byKey.get(cacheKey);
  }

  const itemAtoms = new Map<unknown, PrimitiveAtom<Item>>();
  const lastValues = new Map<unknown, Item>();
  let prevMapping: Mapping<Item, unknown> | undefined;
  const isWritable = 'write' in arrAtom;

  const getMapping = (arr: readonly Item[]): Mapping<Item, unknown> => {
    if (prevMapping && prevMapping.arr === arr) {
      return prevMapping;
    }
    const keyList: unknown[] = arr.map((item, index) =>
      keyExtractor ? keyExtractor(item) : index
    );
    const atomList = keyList.map((key, index) => {
      lastValues.set(key, arr[index]!);
      let itemAtom = itemAtoms.get(key);
      if (!itemAtom) {
        itemAtom = createItemAtom(key);
        itemAtoms.set(key, itemAtom);
      }
      return itemAtom;
    });
    // forget atoms for keys that disappeared
    const alive = new Set(keyList);
    for (const key of itemAtoms.keys()) {
      if (!alive.has(key)) {
        itemAtoms.delete(key);
      }
    }
    // Keep the same array identity when only item contents changed, so lists
    // don't re-render when a single row updates.
    const prevAtomList = prevMapping?.atomList;
    const sameAtoms =
      !!prevAtomList &&
      prevAtomList.length === atomList.length &&
      prevAtomList.every((a, i) => a === atomList[i]);
    prevMapping = { arr, keyList, atomList: sameAtoms ? prevAtomList! : atomList };
    return prevMapping;
  };

  const mappingAtom = atom((get) => getMapping(get(arrAtom)));
  mappingAtom.debugPrivate = true;

  const createItemAtom = (key: unknown): PrimitiveAtom<Item> => {
    const read = (get: <V>(a: Atom<V>) => V) => {
      const mapping = get(mappingAtom);
      const index = mapping.keyList.indexOf(key);
      if (index < 0) {
        // Item was removed; keep returning its last value so unmounting rows don't crash.
        return lastValues.get(key) as Item;
      }
      return mapping.arr[index]!;
    };
    const write = (
      get: <V>(a: Atom<V>) => V,
      set: (a: WritableAtom<Item[], [Item[]], void>, v: Item[]) => void,
      update: SetStateAction<Item>
    ) => {
      if (!isWritable) {
        throw new Error('[expo-atoms] splitAtom: source atom is read-only');
      }
      const mapping = get(mappingAtom);
      const index = mapping.keyList.indexOf(key);
      if (index < 0) {
        return;
      }
      const prev = mapping.arr[index]!;
      const next = typeof update === 'function' ? (update as (p: Item) => Item)(prev) : update;
      if (Object.is(prev, next)) {
        return;
      }
      set(arrAtom as WritableAtom<Item[], [Item[]], void>, [
        ...mapping.arr.slice(0, index),
        next,
        ...mapping.arr.slice(index + 1),
      ]);
    };
    return atom(read, write as never) as unknown as PrimitiveAtom<Item>;
  };

  const splittedAtom = isWritable
    ? atom(
        (get) => get(mappingAtom).atomList,
        (get, set, action: SplitAtomAction<Item>) => {
          const { arr, atomList } = get(mappingAtom);
          const target = arrAtom as WritableAtom<Item[], [Item[]], void>;
          switch (action.type) {
            case 'remove': {
              const index = atomList.indexOf(action.atom);
              if (index >= 0) {
                set(target, [...arr.slice(0, index), ...arr.slice(index + 1)]);
              }
              break;
            }
            case 'insert': {
              const index = action.before ? atomList.indexOf(action.before) : arr.length;
              if (index >= 0) {
                set(target, [...arr.slice(0, index), action.value, ...arr.slice(index)]);
              }
              break;
            }
            case 'move': {
              const index1 = atomList.indexOf(action.atom);
              const index2 = action.before ? atomList.indexOf(action.before) : arr.length;
              if (index1 >= 0 && index2 >= 0) {
                const next = [...arr];
                const [moved] = next.splice(index1, 1);
                next.splice(index1 < index2 ? index2 - 1 : index2, 0, moved!);
                set(target, next);
              }
              break;
            }
          }
        }
      )
    : atom((get) => get(mappingAtom).atomList);

  byKey.set(cacheKey, splittedAtom);
  return splittedAtom;
}
