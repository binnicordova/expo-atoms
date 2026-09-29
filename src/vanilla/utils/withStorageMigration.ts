import { isPromiseLike } from '../env';
import type { AsyncStorage, SyncStorage } from './atomWithStorage';

export type Migrate<Value> = (persistedValue: unknown, persistedVersion: number) => Value;

type Subscribe<Value> = (
  key: string,
  callback: (value: Value) => void,
  initialValue: Value
) => (() => void) | undefined;

const NOTHING = Symbol();

const isEnvelope = (v: unknown): v is { __expoAtomsVersion: number; value: unknown } =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { __expoAtomsVersion?: unknown }).__expoAtomsVersion === 'number' &&
  'value' in v;

/**
 * Wraps a storage so persisted data carries a version envelope, and old or
 * un-versioned (legacy, pre-migration) data is upgraded via `migrate`
 * instead of being silently discarded — unlike `withStorageValidator` alone,
 * which can only fall back to `initialValue`.
 *
 * Compose with `withStorageValidator` migrate-first, then validate the
 * (now current-shape) result — validating pre-migration data against a
 * post-migration validator would always fail:
 * ```ts
 * withStorageValidator(isSettings)(
 *   withStorageMigration({ version: 2, migrate: migrateSettings })(storage)
 * )
 * ```
 *
 * `migrate` must be synchronous, so a migration-wrapped `SyncStorage` (e.g.
 * MMKV) stays fully synchronous end-to-end — no hydration delay introduced.
 *
 * Requires the wrapped storage to return its `initialValue` argument
 * verbatim when nothing is stored (the contract `createJSONStorage` — the
 * documented, recommended adapter for every storage backend — already
 * honors). A storage that doesn't honor this will have `migrate` called on
 * first launch too, when there's nothing to migrate.
 *
 * Caveat: the envelope is detected structurally
 * (`{ __expoAtomsVersion, value }`). If `Value` itself happens to have both
 * of those keys at its top level, migration will misidentify it — the same
 * irreducible trade-off every version-envelope scheme has (redux-persist,
 * zustand's `persist`, …).
 */
export function withStorageMigration<Value>(config: { version: number; migrate: Migrate<Value> }): {
  (storage: AsyncStorage<unknown>): AsyncStorage<Value>;
  (storage: SyncStorage<unknown>): SyncStorage<Value>;
};

export function withStorageMigration<Value>(config: { version: number; migrate: Migrate<Value> }) {
  return (unknownStorage: AsyncStorage<unknown> | SyncStorage<unknown>) => {
    const process = (raw: unknown, initialValue: Value): Value => {
      if (raw === NOTHING) {
        return initialValue;
      }
      const [persistedVersion, persistedValue] = isEnvelope(raw)
        ? [raw.__expoAtomsVersion, raw.value]
        : [0, raw];
      if (persistedVersion === config.version) {
        return persistedValue as Value;
      }
      try {
        return config.migrate(persistedValue, persistedVersion);
      } catch {
        return initialValue;
      }
    };

    const subscribe: Subscribe<Value> = (key, callback, initialValue) =>
      unknownStorage.subscribe?.(key, (v) => callback(process(v, initialValue)), NOTHING);

    // The cast is required, not just convenient: with multiple overridden
    // members whose types independently vary between AsyncStorage/
    // SyncStorage (getItem, setItem, subscribe), TS's overload-vs-
    // implementation checker can't correlate them and rejects this even
    // though it's correctly typed — verified separately that callers still
    // get the right sync/async return type for `getItem` on each branch.
    return {
      ...unknownStorage,
      getItem: (key: string, initialValue: Value) => {
        const raw = unknownStorage.getItem(key, NOTHING);
        return isPromiseLike(raw)
          ? raw.then((v) => process(v, initialValue))
          : process(raw, initialValue);
      },
      setItem: (key: string, newValue: Value) =>
        unknownStorage.setItem(key, { __expoAtomsVersion: config.version, value: newValue }),
      subscribe,
    } as AsyncStorage<Value> | SyncStorage<Value>;
  };
}
