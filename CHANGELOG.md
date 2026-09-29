# Changelog

## 0.1.0 — Unreleased

### 🎉 New features

- Core atomic state: `atom`, `createStore`, `getDefaultStore`, dependency tracking with epoch-based caching, `onMount`/`onUnmount`, async atoms with `AbortSignal` cancellation.
- React bindings: `Provider`, `useStore`, `useAtom`, `useAtomValue` (Suspense via `React.use`), `useSetAtom`, `useAtomCallback`, `useResetAtom`, `useReducerAtom`, `useHydrateAtoms`.
- Utilities: `atomWithStorage` (non-suspending async hydration), `createJSONStorage`, `withStorageValidator`, `atomWithReset`, `RESET`, `atomWithReducer`, `atomWithDefault`, `atomWithRefresh`, `atomWithLazy`, `selectAtom`, `splitAtom`, `atomFamily`, `loadable`, `unwrap`, `freezeAtom`, `freezeAtomCreator`.
- React Native atoms: `appStateAtom`, `colorSchemeAtom`.
- Framework-free entry point: `expo-atoms/vanilla`.
- Pure TypeScript — compatible with Expo Go, `expo-updates` OTA and iOS / Android / web on Expo SDK 58+.
