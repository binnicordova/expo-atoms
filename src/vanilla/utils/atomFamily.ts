import type { Atom } from '../atom';

const NOT_FOUND = Symbol();

type ShouldRemove<Param> = (createdAt: number, param: Param) => boolean;

export type AtomFamilyEvent<Param, AtomType> =
  | { type: 'CREATE'; param: Param; atom: AtomType }
  | { type: 'REMOVE'; param: Param; atom: AtomType };

export interface AtomFamily<Param, AtomType> {
  (param: Param): AtomType;
  /** All params currently cached. */
  getParams(): Iterable<Param>;
  /** Drop a param from the cache (the atom's value in stores is not reset). */
  remove(param: Param): void;
  /** Evict cached entries on access when this returns true. `null` disables it. */
  setShouldRemove(shouldRemove: ShouldRemove<Param> | null): void;
  /** Listen to CREATE / REMOVE events. */
  subscribe(callback: (event: AtomFamilyEvent<Param, AtomType>) => void): () => void;
}

/**
 * Creates a function that returns the same atom for the same param
 * (compared with `areEqual`, default reference equality). Ideal for
 * per-id state such as `todoAtomFamily(id)`.
 */
export function atomFamily<Param, AtomType extends Atom<unknown>>(
  initializeAtom: (param: Param) => AtomType,
  areEqual?: (a: Param, b: Param) => boolean
): AtomFamily<Param, AtomType> {
  let shouldRemove: ShouldRemove<Param> | null = null;
  const atoms = new Map<Param, [AtomType, number]>();
  const listeners = new Set<(event: AtomFamilyEvent<Param, AtomType>) => void>();

  const notify = (event: AtomFamilyEvent<Param, AtomType>) => listeners.forEach((l) => l(event));

  const findKey = (param: Param): Param | typeof NOT_FOUND => {
    if (atoms.has(param)) {
      return param;
    }
    if (areEqual) {
      for (const key of atoms.keys()) {
        if (areEqual(key, param)) {
          return key;
        }
      }
    }
    return NOT_FOUND;
  };

  const createAtom = ((param: Param) => {
    const key = findKey(param);
    if (key !== NOT_FOUND) {
      const [cachedAtom, createdAt] = atoms.get(key)!;
      if (!shouldRemove?.(createdAt, key)) {
        return cachedAtom;
      }
      createAtom.remove(key);
    }
    const newAtom = initializeAtom(param);
    atoms.set(param, [newAtom, Date.now()]);
    notify({ type: 'CREATE', param, atom: newAtom });
    return newAtom;
  }) as AtomFamily<Param, AtomType>;

  createAtom.getParams = () => atoms.keys();

  createAtom.remove = (param: Param) => {
    const key = findKey(param);
    if (key === NOT_FOUND) {
      return;
    }
    const [removedAtom] = atoms.get(key)!;
    atoms.delete(key);
    notify({ type: 'REMOVE', param: key, atom: removedAtom });
  };

  createAtom.setShouldRemove = (fn) => {
    shouldRemove = fn;
    if (!shouldRemove) {
      return;
    }
    for (const [key, [, createdAt]] of [...atoms]) {
      if (shouldRemove(createdAt, key)) {
        createAtom.remove(key);
      }
    }
  };

  createAtom.subscribe = (callback) => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  };

  return createAtom;
}
