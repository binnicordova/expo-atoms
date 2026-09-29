# expo-atoms

**Primitive and flexible atomic state management for Expo & React Native.**
Built bottom-up from tiny atoms, 100% TypeScript, **zero native code** — so it runs in **Expo Go**, ships inside **`expo-updates` OTA bundles**, and works the same on **iOS, Android and web**.

```sh
npx expo install expo-atoms
# or: bun add expo-atoms · npm i expo-atoms · yarn add expo-atoms
```

| | |
|---|---|
| ✅ Expo Go | No config plugin, no prebuild, no dev client required |
| ✅ OTA updates | Plain JS — any `eas update` can add, change or fix it |
| ✅ iOS · Android · Web | One implementation, tested with Metro on all three |
| ✅ Expo SDK 58+ | React 19 (`use`) and React 18 supported |
| ✅ TypeScript-first | Full inference for atoms, derived atoms and setters |
| ✅ Tiny & tree-shakeable | No dependencies, `sideEffects: false` |

---

## Why atoms?

With the **Atomic State Management Pattern**, state is split into small independent units (*atoms*). Components subscribe only to the atoms they read, and derived atoms recompute only when their dependencies change. No selectors to memoize, no giant store, no context re-render cascades.

```tsx
import { atom, useAtom, useAtomValue } from 'expo-atoms';
import { Pressable, Text } from 'react-native';

const countAtom = atom(0);
const doubledAtom = atom((get) => get(countAtom) * 2);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  const doubled = useAtomValue(doubledAtom);
  return (
    <Pressable onPress={() => setCount((c) => c + 1)}>
      <Text>{count} × 2 = {doubled}</Text>
    </Pressable>
  );
}
```

No `<Provider>` needed — hooks fall back to a default store.

---

## Core API

### `atom`

```ts
// primitive
const nameAtom = atom('Ada');

// read-only derived
const greetingAtom = atom((get) => `Hello, ${get(nameAtom)}!`);

// writable derived
const upperNameAtom = atom(
  (get) => get(nameAtom).toUpperCase(),
  (_get, set, next: string) => set(nameAtom, next.toLowerCase())
);

// write-only "action" atom
const resetNameAtom = atom(null, (_get, set) => set(nameAtom, 'Ada'));

// async derived (suspends, or wrap with loadable/unwrap)
const userAtom = atom(async (get, { signal }) => {
  const res = await fetch(`https://api.example.com/users/${get(userIdAtom)}`, { signal });
  return res.json() as Promise<User>;
});
```

`signal` is aborted when a dependency changes before the request finishes.

`onMount` runs when an atom gets its first subscriber and may return a cleanup:

```ts
const clockAtom = atom(Date.now());
clockAtom.onMount = (set) => {
  const id = setInterval(() => set(Date.now()), 1000);
  return () => clearInterval(id);
};
```

### Hooks

| Hook | Returns | Re-renders on change |
|---|---|---|
| `useAtom(atom)` | `[value, set]` | yes |
| `useAtomValue(atom)` | `value` | yes |
| `useSetAtom(atom)` | stable `set` | **no** |
| `useAtomCallback(fn)` | `(…args) => fn(get, set, …args)` | no |
| `useResetAtom(atom)` | `() => set(RESET)` | no |
| `useReducerAtom(atom, reducer)` | `[value, dispatch]` | yes |
| `useHydrateAtoms([[atom, value]])` | — (sets once per store) | — |
| `useStore()` | current `Store` | — |

Every hook accepts `{ store }` as a last argument to target a specific store.

### Stores & `<Provider>`

```tsx
import { Provider, createStore, getDefaultStore } from 'expo-atoms';

const store = createStore();
store.set(countAtom, 10);
store.get(countAtom); // 10
const unsub = store.sub(countAtom, () => console.log('changed'));

<Provider store={store}>{/* uses `store` */}</Provider>
<Provider>{/* gets its own fresh store */}</Provider>
```

Use a `Provider` per screen/modal to scope state, or a shared store to read and write atoms outside React (push-notification handlers, background tasks, deep-link handlers).

### Multi-atom transactions

`store.set()` already batches propagation *within* one write (diamond-safe, each dependent recomputed once). `store.transaction(fn)` extends that same batching *across* multiple `set()` calls: listeners fire once with the final combined state, and a downstream atom that depends on several of the writes recomputes once, not once per write. Jotai's maintainers explicitly declined to add this to core (pushed to the third-party `jotai-transaction` package instead) — here it's a small, contained extension of the existing batching, not new architecture.

```ts
store.transaction(() => {
  store.set(firstNameAtom, 'Ada');
  store.set(lastNameAtom, 'Lovelace'); // fullNameAtom depends on both —
});                                    // it recomputes once, not twice
```

Nestable (an inner `transaction()` just extends the outer one). `fn` must be synchronous — writes made after an `await` inside it happen outside the transaction.

---

## Utilities

All exported from `expo-atoms` (and framework-free from `expo-atoms/vanilla`).

| Utility | What it does |
|---|---|
| `atomWithStorage(key, init, storage?)` | Persisted atom (AsyncStorage, localStorage, kv-store…) |
| `atomWithReset(init)` + `RESET` | Resettable primitive |
| `atomWithReducer(init, reducer)` | Reducer-driven primitive |
| `atomWithDefault((get) => …)` | Derived default, overridable, `RESET` to follow again |
| `atomWithRefresh(read)` | Call setter with no args to re-run (pull-to-refresh) |
| `atomWithLazy(() => init)` | Lazily computed initial value, once per store |
| `selectAtom(atom, selector, eq?)` | Subscribe to a slice |
| `splitAtom(arrayAtom, keyOf?)` | One atom per list item — rows re-render independently |
| `atomFamily((param) => atom, eq?, { maxSize? })` | Memoized atom per param (e.g. per id), optional LRU eviction |
| `loadable(asyncAtom)` | `{ state: 'loading' \| 'hasData' \| 'hasError' }`, never suspends |
| `unwrap(asyncAtom, fallback?)` | Sync view of an async atom |
| `freezeAtom(atom)` | Deep-freeze values to catch mutations |
| `withStorageMigration({ version, migrate })` | Upgrade old persisted shapes instead of discarding them |
| `hydrateStorageAtoms(store, atoms)` | Await persisted atoms before first paint (splash screen) |
| `appStateAtom` | Live `AppState` (`active`, `background`, …) |
| `colorSchemeAtom` | Live device color scheme |
| `flushStorageOnBackground(store, storages)` | Best-effort flush for storages that batch writes internally |
| `atomEffect((get, set) => cleanup?)` | Imperative side effect that tracks atoms and re-runs on change, without a component |
| `traceAtomUpdates(store, onTrace)` | Dev-mode "why did this change" causality trace |

### Persistence with AsyncStorage

`@react-native-async-storage/async-storage` is included in Expo Go.

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { atomWithStorage, createJSONStorage } from 'expo-atoms';

const storage = createJSONStorage<Settings>(() => AsyncStorage);

export const settingsAtom = atomWithStorage<Settings>(
  'settings',
  { haptics: true, units: 'metric' },
  storage
);
```

Unlike many persistence helpers, **async storage never suspends**: the atom renders `initialValue` immediately, hydrates once storage resolves, and a late load never overwrites something the user already changed. `set(settingsAtom, RESET)` removes the key.

Other storages work the same way — anything with `getItem / setItem / removeItem`:

```ts
// Synchronous localStorage on every platform (Expo SDK 53+, in Expo Go)
import 'expo-sqlite/localStorage/install';
const themeAtom = atomWithStorage('theme', 'system'); // default storage = localStorage
```

**MMKV (custom dev client only).** `react-native-mmkv` ships native code, so it
requires `expo-dev-client` / an EAS dev build — it does **not** run in Expo Go,
and `expo-atoms` never adds it as a dependency. If your app already has a dev
client, it's a drop-in synchronous storage:

```ts
import { MMKV } from 'react-native-mmkv'; // requires a custom dev client, not Expo Go
import { atomWithStorage, createJSONStorage } from 'expo-atoms';

const mmkv = new MMKV();
const storage = createJSONStorage<Settings>(() => ({
  getItem: (key) => mmkv.getString(key) ?? null,
  setItem: (key, value) => mmkv.set(key, value),
  removeItem: (key) => mmkv.delete(key),
}));
export const settingsAtom = atomWithStorage('settings', defaults, storage);
```

Wired as a sync storage, reads are genuinely synchronous end-to-end — no
hydration delay, unlike an `AsyncStorage`-backed atom.

Guard against persisted shapes that changed between releases or OTA updates:

```ts
import { withStorageValidator } from 'expo-atoms';
const isSettings = (v: unknown): v is Settings => typeof v === 'object' && v !== null && 'units' in v;
const settingsAtom = atomWithStorage('settings', defaults, withStorageValidator(isSettings)(storage));
```

Need to actually *upgrade* an old persisted shape instead of discarding it? `withStorageMigration` wraps a version envelope around stored data and calls `migrate` on anything older (un-versioned/legacy data is always version `0`). Compose it migrate-first, validator-outermost:

```ts
import { withStorageMigration, withStorageValidator } from 'expo-atoms';

const settingsAtom = atomWithStorage(
  'settings',
  defaults,
  withStorageValidator(isSettings)(
    withStorageMigration<Settings>({
      version: 2,
      migrate: (persisted, version) =>
        version === 0 ? { ...defaults, units: (persisted as { units: string }).units } : defaults,
    })(storage)
  )
);
```

`migrate` must be synchronous, so a migration-wrapped sync storage (e.g. MMKV) stays fully synchronous — no hydration delay introduced.

### Bootstrapping before first paint

Async storage never suspends, but a splash screen still needs to know *when* persisted data has arrived. `hydrateStorageAtoms` awaits one or more `atomWithStorage` atoms (no-op for sync-backed atoms — there's nothing to await):

```ts
import { hydrateStorageAtoms, getDefaultStore } from 'expo-atoms';
import * as SplashScreen from 'expo-splash-screen';

await hydrateStorageAtoms(getDefaultStore(), [settingsAtom, sessionAtom]);
await SplashScreen.hideAsync();
```

### Lists with `splitAtom`

```tsx
const todosAtom = atom<Todo[]>([]);
const todoAtomsAtom = splitAtom(todosAtom, (t) => t.id);

function TodoList() {
  const todoAtoms = useAtomValue(todoAtomsAtom);
  return todoAtoms.map((a) => <TodoRow key={`${a}`} todoAtom={a} />);
}

const TodoRow = memo(({ todoAtom }: { todoAtom: PrimitiveAtom<Todo> }) => {
  const [todo, setTodo] = useAtom(todoAtom); // only this row re-renders
  const dispatch = useSetAtom(todoAtomsAtom); // { type: 'remove' | 'insert' | 'move' }
  // …
});
```

The array of item atoms keeps its identity when only item contents change, so the list itself doesn't re-render when one row updates. Works great as `FlatList` `data`.

### Async without Suspense

```tsx
const quoteAtom = atomWithRefresh(async (_get, { signal }) => {
  const res = await fetch('https://api.example.com/quote', { signal });
  return (await res.json()).text as string;
});
const quoteLoadable = loadable(quoteAtom);

function Quote() {
  const q = useAtomValue(quoteLoadable);
  const refresh = useSetAtom(quoteAtom);
  if (q.state === 'loading') return <ActivityIndicator />;
  if (q.state === 'hasError') return <Text>Failed</Text>;
  return <Text onPress={() => refresh()}>{q.data}</Text>;
}
```

Prefer Suspense? Just `useAtomValue(quoteAtom)` inside `<Suspense fallback={…}>`.

### React Native atoms

```ts
import { appStateAtom, colorSchemeAtom, atom } from 'expo-atoms';

const isForegroundAtom = atom((get) => get(appStateAtom) === 'active');
const themeAtom = atom((get) => (get(colorSchemeAtom) === 'dark' ? darkTheme : lightTheme));
```

`atomWithStorage` already writes through on every `set()`, so there's nothing to flush by default. If you compose a storage that batches or debounces writes itself, give it an optional `flush()` method and call `flushStorageOnBackground` once at startup so it runs when the app backgrounds:

```ts
import { flushStorageOnBackground, getDefaultStore } from 'expo-atoms';

flushStorageOnBackground(getDefaultStore(), [myBatchingStorage]);
```

This is best-effort, not a guarantee — `AppState`'s background event doesn't grant extra execution time, so there's no pure-JS way to guarantee an in-flight write completes before the OS terminates the process.

### Side effects with `atomEffect`

Mirrors the popular third-party `jotai-effect` package's `atomEffect`: run an imperative side effect that watches one or more atoms and re-runs when they change, without needing a component to read a value — syncing state to an external system, logging, analytics.

```ts
import { atomEffect } from 'expo-atoms';

const syncTitleEffect = atomEffect((get, set) => {
  const count = get(unreadCountAtom); // tracked, like any derived atom's read
  document.title = count > 0 ? `(${count}) Inbox` : 'Inbox';
  set(lastSyncedAtAtom, Date.now()); // effects can write other atoms too

  return () => {
    // optional cleanup, called before the next run and on unmount
  };
});

useAtom(syncTitleEffect); // mount it to start; unmount stops it and runs the last cleanup
```

Outside React, `store.sub(syncTitleEffect, () => {})` starts it the same way.

### Dev-mode causality trace

The single most-requested, still-unsolved debugging gap in the Jotai ecosystem (`pmndrs/jotai#931` — years old, still open, not solved even by the official `jotai-devtools` package) is "which atom write caused this downstream atom to recompute?" `traceAtomUpdates` surfaces exactly that, using the reverse-dependency graph the store already computes internally on every `set()`:

```ts
import { traceAtomUpdates, getDefaultStore } from 'expo-atoms';

if (__DEV__) {
  traceAtomUpdates(getDefaultStore(), ({ cause, effects }) => {
    console.log(`[trace] set(${cause}) recomputed:`, effects.map(String));
  });
}
```

Reports multi-hop causality (A causes B causes C) and diamond-shaped graphs (one write, several independent downstream effects), each atom listed once. Set `atom.debugLabel` so the trace prints readable names. Zero overhead when no handler is registered — the store only tracks recomputes while at least one is.

### Testing

`expo-atoms/test-utils` is a separate entry point (not re-exported from `expo-atoms` or `expo-atoms/vanilla`) so test-only code never bloats a production bundle:

```ts
import { createTestStore, flushMicrotasks, waitFor } from 'expo-atoms/test-utils';

let store: ReturnType<typeof createTestStore>;
beforeEach(() => {
  store = createTestStore(); // the "fresh createStore() per test" convention, packaged
});

test('increments', () => {
  store.set(countAtom, (c) => c + 1);
  expect(store.get(countAtom)).toBe(1);
});

test('settles an async atom', async () => {
  store.set(userIdAtom, 2);
  const user = await waitFor(store, userAtom, (u) => u.id === 2);
  expect(user.name).toBe('Ada');
  // or, for a bare microtask flush: await flushMicrotasks();
});
```

---

## Expo Go & `expo-updates`

`expo-atoms` contains no `ios/`, `android/`, config plugin or `expo-module.config.json`. It only imports `react` and (for `appStateAtom` / `colorSchemeAtom`) `react-native` core APIs, which exist in every Expo runtime including `react-native-web`. That means:

- It works in **Expo Go** out of the box.
- Adding, upgrading or removing it **never changes the native runtime version**, so it can ship via `eas update` to existing binaries.
- The default store lives in the JS context: `Updates.reloadAsync()` starts from a clean state; use `atomWithStorage` for anything that should survive reloads.

## TypeScript

```ts
import type { Atom, PrimitiveAtom, WritableAtom, ExtractAtomValue } from 'expo-atoms';

type Count = ExtractAtomValue<typeof countAtom>; // number
```

Tip: set `atom.debugLabel = 'count'` to get readable names in `String(atom)` while debugging.

## Roadmap

See [PLAN.md](./PLAN.md) for the full, sourced improvement roadmap this release came from — what's shipped, and what's planned next (undo/redo, circular-dependency detection, per-key `atomFamily` generics, an Expo Router–synced atom, a Reanimated bridge, offline-first sync, and more).

## Migrating from Jotai

The API intentionally mirrors [Jotai](https://github.com/pmndrs/jotai): replace `from 'jotai'`, `'jotai/utils'` and `'jotai/vanilla'` with `from 'expo-atoms'` (or `'expo-atoms/vanilla'`). Differences:

- Everything (core + utils) is exported from one entry point.
- `atomFamily` (with optional `maxSize` LRU eviction) and `loadable` are included.
- `atomWithStorage` with async storage hydrates without suspending.
- `withStorageMigration` upgrades old persisted shapes instead of discarding them; `hydrateStorageAtoms` awaits persisted atoms before first paint.
- Includes React Native–aware atoms (`appStateAtom`, `colorSchemeAtom`) and `flushStorageOnBackground`.
- `store.transaction(fn)` batches multiple `set()` calls — jotai-core declined this, delegating to the third-party `jotai-transaction` package.
- `atomEffect` (mirrors the third-party `jotai-effect` package) and `traceAtomUpdates` (a dev-mode causality trace, still unsolved even in `jotai-devtools`) are built in.
- Official test helpers ship from `expo-atoms/test-utils`.
- Ships a dual CJS/ESM build with an explicit `react-native` export condition.
- The internal `INTERNAL_*` / store-hook APIs are not exposed.

## Example app

```sh
git clone https://github.com/binnicordova/expo-atoms && cd expo-atoms
bun install
cd example && bun install
bunx expo start          # press i (iOS simulator), a (Android) or w (web)
```

The example resolves `expo-atoms` to `../src`, so edits to the library hot-reload in Expo Go.

## Contributing

```sh
bun install
bun run test          # jest (jest-expo preset)
bun run lint
bun run typecheck
bun run build          # emits ./build (dual CJS/ESM via tsup + tsc declarations)
bun run verify-build   # smoke-tests build/cjs and build/esm after a build
```

## Credits

The store algorithm and API design are derived from [Jotai](https://github.com/pmndrs/jotai) by Daishi Kato and Poimandres (MIT). See [LICENSE](./LICENSE).

## License

MIT © Binni Cordova
