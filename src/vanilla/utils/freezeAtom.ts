import type { Atom, WritableAtom } from '../atom';

const frozenAtoms = new WeakSet<Atom<unknown>>();

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
};

/**
 * Deep-freezes every value the atom produces, so accidental mutations throw
 * in strict mode. Great during development to catch mutation bugs.
 */
export function freezeAtom<AtomType extends Atom<unknown>>(anAtom: AtomType): AtomType {
  if (frozenAtoms.has(anAtom)) {
    return anAtom;
  }
  frozenAtoms.add(anAtom);
  const origRead = anAtom.read;
  anAtom.read = function (get, options) {
    return deepFreeze(origRead.call(this, get, options));
  };
  if ('write' in anAtom) {
    const writable = anAtom as unknown as WritableAtom<unknown, unknown[], unknown>;
    const origWrite = writable.write;
    writable.write = function (get, set, ...args) {
      return origWrite.call(
        this,
        get,
        ((...setArgs: unknown[]) => {
          if (setArgs[0] === writable) {
            setArgs[1] = deepFreeze(setArgs[1]);
          }
          return (set as (...a: unknown[]) => unknown)(...setArgs);
        }) as typeof set,
        ...args
      ) as never;
    };
  }
  return anAtom;
}

/** Wraps an atom creator so every atom it creates is frozen. */
export function freezeAtomCreator<CreateAtom extends (...args: never[]) => Atom<unknown>>(
  createAtom: CreateAtom
): CreateAtom {
  return ((...args: Parameters<CreateAtom>) => freezeAtom(createAtom(...args))) as CreateAtom;
}
