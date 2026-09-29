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
| `atomFamily((param) => atom, eq?)` | Memoized atom per param (e.g. per id) |
| `loadable(asyncAtom)` | `{ state: 'loading' \| 'hasData' \| 'hasError' }`, never suspends |
| `unwrap(asyncAtom, fallback?)` | Sync view of an async atom |
| `freezeAtom(atom)` | Deep-freeze values to catch mutations |
| `appStateAtom` | Live `AppState` (`active`, `background`, …) |
| `colorSchemeAtom` | Live device color scheme |

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

Guard against persisted shapes that changed between releases or OTA updates:

```ts
import { withStorageValidator } from 'expo-atoms';
const isSettings = (v: unknown): v is Settings => typeof v === 'object' && v !== null && 'units' in v;
const settingsAtom = atomWithStorage('settings', defaults, withStorageValidator(isSettings)(storage));
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

## Migrating from Jotai

The API intentionally mirrors [Jotai](https://github.com/pmndrs/jotai): replace `from 'jotai'`, `'jotai/utils'` and `'jotai/vanilla'` with `from 'expo-atoms'` (or `'expo-atoms/vanilla'`). Differences:

- Everything (core + utils) is exported from one entry point.
- `atomFamily` and `loadable` are included.
- `atomWithStorage` with async storage hydrates without suspending.
- Includes React Native–aware atoms (`appStateAtom`, `colorSchemeAtom`).
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
bun run test        # jest (jest-expo preset)
bun run lint
bun run typecheck
bun run build       # emits ./build
```

## Credits

The store algorithm and API design are derived from [Jotai](https://github.com/pmndrs/jotai) by Daishi Kato and Poimandres (MIT). See [LICENSE](./LICENSE).

## License

MIT © Binni Cordova
