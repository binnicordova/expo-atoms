# Changelog

## 0.2.0

### 🎉 New features

- `store.transaction(fn)`: defers recompute + listener notification across multiple `set()` calls inside `fn` until it returns, so listeners fire once with the final combined state and a downstream atom that depends on several of the writes recomputes once instead of once per write. Nestable; `fn` must be synchronous. Jotai's maintainers explicitly declined this for jotai-core (pushed to the third-party `jotai-transaction` package).
- `atomEffect((get, set) => cleanup?)`: runs an imperative side effect that tracks whatever atoms it reads and re-runs (cleaning up first) when a tracked atom changes; mount it via `useAtom`/`store.sub` to start it, unmount to stop it. Mirrors the third-party `jotai-effect` package.
- `traceAtomUpdates(store, onTrace)`: dev-mode "why did this change" causality trace — reports, for each `store.set()` call, the atom written and every atom recomputed downstream of it (multi-hop and diamond-shaped graphs included, each listed once). Zero overhead while no handler is registered.
- New `expo-atoms/test-utils` entry point: `createTestStore()`, `flushMicrotasks()` and `waitFor(store, atom, predicate, { timeout? })`, packaging the "fresh store per test" / manual flush conventions every test suite ends up hand-rolling. Never bundled into `expo-atoms` or `expo-atoms/vanilla`.

### 🛠 Build & CI

- `tsup.config.ts` and `package.json`'s `exports`/`typesVersions` gained a third entry point (`./test-utils`), wired identically to `./vanilla`; `verify-build` now round-trips it under both CJS and ESM too.

### 📚 Docs

- README: usage sections for transactions, `atomEffect`, `traceAtomUpdates`, and `expo-atoms/test-utils`, plus new rows in the Utilities table.
- PLAN.md: added a `## Shipped in v0.2.0` section; removed these four items from `## Planned` and made its sort order explicit (Expo Go/OTA compatibility first, then evidenced developer demand), reordering the rest to match.

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
