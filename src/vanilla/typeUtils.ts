import type { Atom, WritableAtom } from './atom';

export type ExtractAtomValue<AtomType> = AtomType extends Atom<infer Value> ? Value : never;

export type ExtractAtomArgs<AtomType> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AtomType extends WritableAtom<unknown, infer Args, infer _Result> ? Args : never;

export type ExtractAtomResult<AtomType> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AtomType extends WritableAtom<unknown, infer _Args, infer Result> ? Result : never;
