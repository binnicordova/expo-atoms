import { useAtomValue } from './useAtomValue';
import type { UseAtomValueOptions } from './useAtomValue';
import { useSetAtom } from './useSetAtom';
import type { Atom, PrimitiveAtom, SetStateAction, WritableAtom } from '../vanilla/atom';
import type { ExtractAtomArgs, ExtractAtomResult, ExtractAtomValue } from '../vanilla/typeUtils';

type SetAtom<Args extends unknown[], Result> = (...args: Args) => Result;

export function useAtom<Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  options?: UseAtomValueOptions
): [Awaited<Value>, SetAtom<Args, Result>];

export function useAtom<Value>(
  atom: PrimitiveAtom<Value>,
  options?: UseAtomValueOptions
): [Awaited<Value>, SetAtom<[SetStateAction<Value>], void>];

export function useAtom<Value>(
  atom: Atom<Value>,
  options?: UseAtomValueOptions
): [Awaited<Value>, never];

export function useAtom<AtomType extends WritableAtom<unknown, never[], unknown>>(
  atom: AtomType,
  options?: UseAtomValueOptions
): [
  Awaited<ExtractAtomValue<AtomType>>,
  SetAtom<ExtractAtomArgs<AtomType>, ExtractAtomResult<AtomType>>,
];

export function useAtom<AtomType extends Atom<unknown>>(
  atom: AtomType,
  options?: UseAtomValueOptions
): [Awaited<ExtractAtomValue<AtomType>>, never];

/** `useState`-like tuple: `[value, setValue]`. */
export function useAtom<Value, Args extends unknown[], Result>(
  atom: Atom<Value> | WritableAtom<Value, Args, Result>,
  options?: UseAtomValueOptions
) {
  return [
    useAtomValue(atom, options),
    useSetAtom(atom as WritableAtom<Value, Args, Result>, options),
  ];
}
