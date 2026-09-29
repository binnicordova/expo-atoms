import { isDev } from './env';
import type { Store } from './store';

export type Getter = <Value>(atom: Atom<Value>) => Value;

export type Setter = <Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  ...args: Args
) => Result;

export type SetAtom<Args extends unknown[], Result> = <A extends Args>(...args: A) => Result;

export type ReadOptions = {
  /** Aborted when the atom is re-evaluated before a pending read resolves. */
  readonly signal: AbortSignal;
};

export type Read<Value> = (get: Getter, options: ReadOptions) => Value;

export type Write<Args extends unknown[], Result> = (
  get: Getter,
  set: Setter,
  ...args: Args
) => Result;

export type OnUnmount = () => void;

export type OnMount<Args extends unknown[], Result> = <S extends SetAtom<Args, Result>>(
  setAtom: S
) => OnUnmount | void;

export type WithInitialValue<Value> = {
  init: Value;
};

export interface Atom<Value> {
  toString: () => string;
  read: Read<Value>;
  /** Human friendly name shown by `toString()` in development. */
  debugLabel?: string;
  /** Marks atoms created internally by utilities. */
  debugPrivate?: boolean;
  /**
   * Called once per store, the first time the store references the atom.
   * Used by utilities; subject to change.
   */
  unstable_onInit?: (store: Store) => void;
}

export interface WritableAtom<Value, Args extends unknown[], Result> extends Atom<Value> {
  write: Write<Args, Result>;
  /** Called when the atom gets its first subscriber in a store. May return a cleanup. */
  onMount?: OnMount<Args, Result>;
}

export type SetStateAction<Value> = Value | ((prev: Value) => Value);

export type PrimitiveAtom<Value> = WritableAtom<Value, [SetStateAction<Value>], void>;

let keyCount = 0;

// writable derived atom
export function atom<Value, Args extends unknown[], Result>(
  read: Read<Value>,
  write: Write<Args, Result>
): WritableAtom<Value, Args, Result>;

// read-only derived atom
export function atom<Value>(read: Read<Value>): Atom<Value>;

// write-only derived atom
export function atom<Value, Args extends unknown[], Result>(
  initialValue: Value,
  write: Write<Args, Result>
): WritableAtom<Value, Args, Result> & WithInitialValue<Value>;

// primitive atom without initial value
export function atom<Value>(): PrimitiveAtom<Value | undefined> &
  WithInitialValue<Value | undefined>;

// primitive atom
export function atom<Value>(initialValue: Value): PrimitiveAtom<Value> & WithInitialValue<Value>;

/**
 * Creates an atom config. An atom config is an immutable definition; the
 * actual value lives in a {@link Store}, so the same atom can hold different
 * values in different stores (e.g. per `<Provider>`).
 */
export function atom<Value, Args extends unknown[], Result>(
  read?: Value | Read<Value>,
  write?: Write<Args, Result>
) {
  const key = `atom${++keyCount}`;
  const config = {
    toString() {
      return isDev() && this.debugLabel ? `${key}:${this.debugLabel}` : key;
    },
  } as WritableAtom<Value, Args, Result> & { init?: Value };
  if (typeof read === 'function') {
    config.read = read as Read<Value>;
  } else {
    config.init = read;
    config.read = defaultRead;
    config.write = defaultWrite as unknown as Write<Args, Result>;
  }
  if (write) {
    config.write = write;
  }
  return config;
}

function defaultRead<Value>(this: Atom<Value>, get: Getter) {
  return get(this);
}

function defaultWrite<Value>(
  this: PrimitiveAtom<Value>,
  get: Getter,
  set: Setter,
  arg: SetStateAction<Value>
) {
  return set(this, typeof arg === 'function' ? (arg as (prev: Value) => Value)(get(this)) : arg);
}
