import { atom } from '../atom';
import type { WritableAtom } from '../atom';
import { isPromiseLike } from '../env';
import { RESET } from './constants';

type Unsubscribe = () => void;

type Subscribe<Value> = (
  key: string,
  callback: (value: Value) => void,
  initialValue: Value
) => Unsubscribe | undefined;

type StringSubscribe = (
  key: string,
  callback: (value: string | null) => void
) => Unsubscribe | undefined;

type SetStateActionWithReset<Value> =
  Value | typeof RESET | ((prev: Value) => Value | typeof RESET);

export interface AsyncStorage<Value> {
  getItem: (key: string, initialValue: Value) => PromiseLike<Value>;
  setItem: (key: string, newValue: Value) => PromiseLike<void>;
  removeItem: (key: string) => PromiseLike<void>;
  subscribe?: Subscribe<Value>;
}

export interface SyncStorage<Value> {
  getItem: (key: string, initialValue: Value) => Value;
  setItem: (key: string, newValue: Value) => void;
  removeItem: (key: string) => void;
  subscribe?: Subscribe<Value>;
}

/** Shape of `@react-native-async-storage/async-storage` and similar. */
export interface AsyncStringStorage {
  getItem: (key: string) => PromiseLike<string | null>;
  setItem: (key: string, newValue: string) => PromiseLike<void>;
  removeItem: (key: string) => PromiseLike<void>;
  subscribe?: StringSubscribe;
}

/** Shape of `localStorage`, `expo-sqlite/kv-store` sync API, MMKV wrappers, etc. */
export interface SyncStringStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, newValue: string) => void;
  removeItem: (key: string) => void;
  subscribe?: StringSubscribe;
}

type JsonStorageOptions = {
  reviver?: (key: string, value: unknown) => unknown;
  replacer?: (key: string, value: unknown) => unknown;
};

export function createJSONStorage<Value>(): SyncStorage<Value>;

export function createJSONStorage<Value>(
  getStringStorage: () => AsyncStringStorage,
  options?: JsonStorageOptions
): AsyncStorage<Value>;

export function createJSONStorage<Value>(
  getStringStorage: () => SyncStringStorage,
  options?: JsonStorageOptions
): SyncStorage<Value>;

/**
 * Adapts a string key/value storage (AsyncStorage, localStorage,
 * expo-sqlite kv-store, …) into a JSON storage for `atomWithStorage`.
 * The default uses `globalThis.localStorage` when available (web, or native
 * after `import 'expo-sqlite/localStorage/install'`).
 */
export function createJSONStorage<Value>(
  getStringStorage: () => AsyncStringStorage | SyncStringStorage | undefined = () => {
    try {
      return (globalThis as { localStorage?: SyncStringStorage }).localStorage;
    } catch {
      return undefined;
    }
  },
  options?: JsonStorageOptions
): AsyncStorage<Value> | SyncStorage<Value> {
  let lastStr: string | undefined;
  let lastValue: Value;
  const parse = (str: string | null, initialValue: Value): Value => {
    str = str || '';
    if (lastStr !== str) {
      try {
        lastValue = JSON.parse(str, options?.reviver);
      } catch {
        return initialValue;
      }
      lastStr = str;
    }
    return lastValue;
  };

  const storage: AsyncStorage<Value> | SyncStorage<Value> = {
    getItem: (key: string, initialValue: Value) => {
      const str = getStringStorage()?.getItem(key) ?? null;
      if (isPromiseLike(str)) {
        return str.then((v) => parse(v, initialValue)) as never;
      }
      return parse(str as string | null, initialValue) as never;
    },
    setItem: (key: string, newValue: Value) =>
      getStringStorage()?.setItem(key, JSON.stringify(newValue, options?.replacer)) as never,
    removeItem: (key: string) => getStringStorage()?.removeItem(key) as never,
  };

  const createHandleSubscribe =
    (subscriber: StringSubscribe): Subscribe<Value> =>
    (key, callback, initialValue) =>
      subscriber(key, (v) => {
        callback(parse(v, initialValue));
      });

  let subscriber: StringSubscribe | undefined;
  try {
    subscriber = getStringStorage()?.subscribe;
  } catch {
    // ignore
  }
  const w = globalThis as {
    addEventListener?: (type: string, cb: (e: unknown) => void) => void;
    removeEventListener?: (type: string, cb: (e: unknown) => void) => void;
    localStorage?: unknown;
  };
  if (
    !subscriber &&
    typeof w.addEventListener === 'function' &&
    typeof w.removeEventListener === 'function'
  ) {
    // Web: keep tabs in sync through the `storage` event.
    subscriber = (key, callback) => {
      let stringStorage: unknown;
      try {
        stringStorage = getStringStorage();
      } catch {
        return undefined;
      }
      if (!stringStorage || stringStorage !== w.localStorage) {
        return undefined;
      }
      const listener = (e: unknown) => {
        const ev = e as { storageArea?: unknown; key?: string; newValue?: string | null };
        if (ev.storageArea === stringStorage && ev.key === key) {
          callback(ev.newValue ?? null);
        }
      };
      w.addEventListener!('storage', listener);
      return () => w.removeEventListener!('storage', listener);
    };
  }
  if (subscriber) {
    storage.subscribe = createHandleSubscribe(subscriber);
  }
  return storage;
}

const defaultStorage = createJSONStorage();

export function atomWithStorage<Value>(
  key: string,
  initialValue: Value,
  storage: AsyncStorage<Value>,
  options?: { getOnInit?: boolean }
): WritableAtom<Value, [SetStateActionWithReset<Value>], Promise<void>>;

export function atomWithStorage<Value>(
  key: string,
  initialValue: Value,
  storage?: SyncStorage<Value>,
  options?: { getOnInit?: boolean }
): WritableAtom<Value, [SetStateActionWithReset<Value>], void>;

/**
 * A primitive atom persisted to storage.
 *
 * - The atom starts at `initialValue` and hydrates from storage when first
 *   mounted (or as soon as a store references it, with `getOnInit: true`).
 * - Async storages (AsyncStorage, SecureStore wrappers, …) never suspend:
 *   the stored value simply replaces `initialValue` once it resolves, and a
 *   late load never overwrites a value the user already wrote.
 * - `set(atom, RESET)` removes the key and restores `initialValue`.
 */
export function atomWithStorage<Value>(
  key: string,
  initialValue: Value,
  storage: SyncStorage<Value> | AsyncStorage<Value> = defaultStorage as SyncStorage<Value>,
  options?: { getOnInit?: boolean }
) {
  type Internal = { value: Value; written: boolean };
  type Message =
    | { type: 'load'; value: Value }
    | { type: 'external'; value: Value }
    | { type: 'write'; value: Value };

  const load = (apply: (value: Value) => void) => {
    let value: Value | PromiseLike<Value>;
    try {
      value = storage.getItem(key, initialValue);
    } catch {
      return;
    }
    if (isPromiseLike(value)) {
      value.then(apply, () => {});
    } else {
      apply(value);
    }
  };

  const internalAtom = atom<Internal, [Message], void>(
    { value: initialValue, written: false },
    (get, set, message) => {
      const current = get(internalAtom);
      if (message.type === 'load' && current.written) {
        return;
      }
      if (
        Object.is(current.value, message.value) &&
        (current.written || message.type !== 'write')
      ) {
        return;
      }
      // a primitive atom with a custom write stores the raw value when it sets itself
      (set as unknown as (a: typeof internalAtom, v: Internal) => void)(internalAtom, {
        value: message.value,
        written: current.written || message.type === 'write',
      });
    }
  );
  internalAtom.debugPrivate = true;

  if (options?.getOnInit) {
    internalAtom.unstable_onInit = (store) => {
      load((value) => store.set(internalAtom, { type: 'load', value }));
    };
  }

  internalAtom.onMount = (setAtom) => {
    load((value) => setAtom({ type: 'load', value }));
    return storage.subscribe?.(key, (value) => setAtom({ type: 'external', value }), initialValue);
  };

  const anAtom = atom(
    (get) => get(internalAtom).value,
    (get, set, update: SetStateActionWithReset<Value>) => {
      const nextValue =
        typeof update === 'function'
          ? (update as (prev: Value) => Value | typeof RESET)(get(internalAtom).value)
          : update;
      if (nextValue === RESET) {
        set(internalAtom, { type: 'write', value: initialValue });
        return storage.removeItem(key);
      }
      set(internalAtom, { type: 'write', value: nextValue });
      return storage.setItem(key, nextValue);
    }
  );

  return anAtom;
}

/**
 * Wraps a storage so values that fail `validator` fall back to the initial
 * value (useful when a persisted shape changes between app versions / OTA updates).
 */
export function withStorageValidator<Value>(validator: (value: unknown) => value is Value): {
  (storage: AsyncStorage<unknown>): AsyncStorage<Value>;
  (storage: SyncStorage<unknown>): SyncStorage<Value>;
};

export function withStorageValidator<Value>(validator: (value: unknown) => value is Value) {
  return (unknownStorage: AsyncStorage<unknown> | SyncStorage<unknown>) => ({
    ...unknownStorage,
    getItem: (key: string, initialValue: Value) => {
      const validate = (value: unknown) => (validator(value) ? value : initialValue);
      const value = unknownStorage.getItem(key, initialValue);
      return isPromiseLike(value) ? value.then(validate) : validate(value);
    },
  });
}
