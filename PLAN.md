# expo-atoms roadmap

`expo-atoms` is a from-scratch, zero-dependency TypeScript port of [Jotai](https://github.com/pmndrs/jotai)'s atom/store model, positioned for Expo/React Native: **zero native code — runs unmodified in Expo Go, ships via `expo-updates` OTA**, identical on iOS/Android/web.

This roadmap comes from evaluating expo-atoms against what the Jotai/atomic-state community has spent years reporting as missing or painful — sourced from Jotai's own GitHub issues/discussions (ranked by engagement), comparison articles against Zustand/Valtio/Recoil/Legend-State, and React Native–specific threads. Every item below is either **shipped** (v0.1.1) or **planned**. Everything here must preserve Expo Go and `expo-updates` OTA compatibility — no item may require a native module or a custom dev client as a hard dependency of the core package.

## Already strong (no work needed)

Before this release, expo-atoms already beat jotai-core on several points the research flagged as community pain:

- **`atomWithStorage` hydrates async storage without suspending** — Jotai's async-storage atoms force the whole atom to become a Promise/suspend; this is the single most-engaged pain point in Jotai's own GitHub discussions.
- **`atomFamily` already ships `.remove()`, `.setShouldRemove()`, and CREATE/REMOVE `.subscribe()`** — jotai-core has no removal API at all; that's delegated to the separate `jotai-family` package.
- **`withStorageValidator`** protects against shape drift across OTA releases.
- **Single entry point, zero runtime deps** — sidesteps the "install 4-6 separate `jotai-*` packages" fragmentation common in the Jotai ecosystem.
- Diamond-safe batched propagation, dynamic dependency pruning, and `AbortSignal`-based async cancellation.

## Shipped in v0.1.1

**Platform correctness**
- ✅ **Dual CJS+ESM build** with an explicit `react-native` export condition (via tsup) — Jotai is actively broken on Expo SDK 53+/Metro because its ESM build's `import.meta` syntax gets picked up by Metro's now-default `exports` resolution; this ships both formats as plain `.js` (never `.mjs`), disambiguated by a nested `package.json` per format, so that failure class can't happen here.
- ✅ **CI matrix leg for React 18** — exercises the hand-rolled `use()` polyfill in `useAtomValue.ts` that the primary (React 19) CI lane never touches.

**Persistence & hydration** (the single most community-engaged Jotai pain point — persistence/hydration threads dominate Jotai's own top-voted GitHub discussions)
- ✅ **`withStorageMigration({ version, migrate })`** — upgrades old/un-versioned persisted shapes instead of discarding them; Jotai has no migration story at all. Compose with `withStorageValidator` migrate-first.
- ✅ **MMKV documented as a `SyncStorage` recipe** (not a dependency — it's a native module, incompatible with Expo Go) + a test naming the "sync storage is available with no await" invariant it relies on.
- ✅ **`hydrateStorageAtoms(store, atoms)`** — await persisted atoms before first paint (splash screen), instead of the implicit "resolves whenever a component happens to mount it" pattern that causes hydration flicker.

**atomFamily hardening**
- ✅ **Optional `{ maxSize }` LRU eviction** for `atomFamily` — closes the one gap Jotai's own docs admit relative to Recoil's cache-strategy selectors, on top of the removal API expo-atoms already had.

**React Native**
- ✅ **`flushStorageOnBackground(store, storages)`** — best-effort flush hook for storages that batch/debounce writes internally, wired through `appStateAtom`. (`atomWithStorage` itself writes through on every `set()`, so there's nothing to flush by default — this only matters for a storage you compose yourself.)

See the [README](./README.md#utilities) for usage of all of the above.

## Planned

Not yet started. Listed in roughly the order they're likely to land, though nothing here is scheduled.

**Power features jotai-core explicitly declined to build** (a clear differentiation opening for a single-package library)
- **Multi-atom transaction/batch API** (`store.transaction(fn)`) — Jotai's maintainers explicitly declined this (pushed to the community `jotai-transaction` package instead). `store.ts`'s internal `recomputeInvalidatedAtoms()` already does batched propagation within one `set()`; extending it to a public multi-write transaction is a contained extension, not new architecture.
- **`atomEffect`-style side-effect utility** — mirrors `jotai-effect`; watch atoms and run an imperative effect without a component, built on the existing `onMount` lifecycle.
- **Built-in opt-in dev logger** — mirrors `jotai-logger`; `debugLabel` already threads through the store for this purpose.
- **Built-in undo/redo (`atomWithHistory`)** — mirrors `jotai-history`.

**Debugging** (the single most-requested *unsolved* gap, even inside Jotai's own devtools package — years-old, still open)
- **Dev-mode "why did this change" causality trace** — `store.ts` already computes the exact reverse-dependency graph on every `set()`; this data just isn't surfaced yet.
- **Dev-mode circular-dependency detection** — turn a cryptic stack-overflow crash into an error naming the cycle.

**Testing**
- **Official test helpers** (`createTestStore()`, `flushAtoms()`) — "how do I reset atoms between tests" is a recurring, never-officially-answered Jotai question; the community convention (fresh `createStore()` per test) already works here but isn't packaged.

**TypeScript**
- **Per-key generic value types in `atomFamily`** — both jotai-core and expo-atoms currently type it with one value type for all params (open in Jotai as well).

**Expo/RN-specific differentiators** (exploratory, no Jotai equivalent exists anywhere in its ecosystem)
- **Expo Router–synced atom** (`atomWithExpoRouterParams`) — the RN/Expo equivalent of `jotai-location`, built against Expo Router's navigation model instead of `window.location`.
- **Optional Reanimated bridge** (`atomToSharedValue`) — worklet-thread access to atom state, shipped as a strictly opt-in subpath so core users never pay for it.

**Vision, not scoped**
- **Offline-first sync primitives** (mutation queue, optimistic writes) — the clearest structural gap vs Legend-State. This is roughly a new subsystem, not a utility function.

## Explicitly out of scope

- **Bundling `react-native-mmkv` or any native storage adapter as a dependency** — breaks Expo Go's fixed native-module set. Docs recipe only.
- **Flipper/native RN devtools bridge** — Flipper was deprecated as of RN 0.73; no live target to integrate with.
- **Redux DevTools browser bridge** — only benefits the web target of an RN-first library; the planned causality trace and cycle detection solve the same underlying problem (understanding *why* state changed) without a web-only dependency.
