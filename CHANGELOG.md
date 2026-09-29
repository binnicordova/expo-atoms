# Changelog

## 0.1.1

### 🎉 New features

- `withStorageMigration({ version, migrate })`: upgrade old or un-versioned persisted shapes on read instead of discarding them. Compose migrate-first with `withStorageValidator`.
- `hydrateStorageAtoms(store, atoms)`: await one or more `atomWithStorage` atoms' first hydration read before first paint (e.g. before hiding a splash screen); no-ops for sync-backed atoms.
- `flushStorageOnBackground(store, storages)`: best-effort hook to flush storages that batch/debounce writes internally when the app backgrounds, wired through `appStateAtom`.
- `atomFamily`: optional third `{ maxSize }` argument for automatic LRU eviction, on top of the existing `.remove()` / `.setShouldRemove()`.
- `withStorageValidator`'s wrapped storage now also validates values delivered through `subscribe` (cross-tab/external updates), not just the initial read.

### 🛠 Build & CI

- Publishable output is now a dual CJS+ESM build (via tsup) with an explicit `react-native` export condition, guarding against the Metro/Hermes `import.meta` resolution failures that (as of Expo SDK 53+/RN 0.79+) hit other ESM-publishing packages.
- Added a CI matrix leg pinning React 18 / Expo SDK 52, so the hand-rolled `use()` Suspense polyfill in `useAtomValue.ts` is actually exercised in CI (previously only React 19 ran there).
- New `bun run verify-build` smoke-tests `build/cjs` and `build/esm` after every build.

### 📚 Docs

- README: MMKV wired as a `SyncStorage` (documented as requiring a custom dev client, never a library dependency — it's incompatible with Expo Go), plus recipes for `withStorageMigration`, `hydrateStorageAtoms` and `flushStorageOnBackground`.
- Added [PLAN.md](./PLAN.md): the full, sourced improvement roadmap this release came from, with what's shipped and what's planned next.

## 0.1.0

_Never published separately — folded into the 0.1.1 initial release._

### 🎉 New features

- Core atomic state: `atom`, `createStore`, `getDefaultStore`, dependency tracking with epoch-based caching, `onMount`/`onUnmount`, async atoms with `AbortSignal` cancellation.
- React bindings: `Provider`, `useStore`, `useAtom`, `useAtomValue` (Suspense via `React.use`), `useSetAtom`, `useAtomCallback`, `useResetAtom`, `useReducerAtom`, `useHydrateAtoms`.
- Utilities: `atomWithStorage` (non-suspending async hydration), `createJSONStorage`, `withStorageValidator`, `atomWithReset`, `RESET`, `atomWithReducer`, `atomWithDefault`, `atomWithRefresh`, `atomWithLazy`, `selectAtom`, `splitAtom`, `atomFamily`, `loadable`, `unwrap`, `freezeAtom`, `freezeAtomCreator`.
- React Native atoms: `appStateAtom`, `colorSchemeAtom`.
- Framework-free entry point: `expo-atoms/vanilla`.
- Pure TypeScript — compatible with Expo Go, `expo-updates` OTA and iOS / Android / web on Expo SDK 58+.
