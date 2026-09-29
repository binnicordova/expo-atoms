import { atom } from '../atom';
import type { Atom, WritableAtom } from '../atom';
import { isPromiseLike } from '../env';

const memoCache = new WeakMap<object, WeakMap<object, unknown>>();
const memo2 = <T>(create: () => T, a: object, b: object): T => {
  let m = memoCache.get(a);
  if (!m) {
    m = new WeakMap();
    memoCache.set(a, m);
  }
  if (!m.has(b)) {
    m.set(b, create());
  }
  return m.get(b) as T;
};

const defaultFallback = () => undefined;

type PromiseAndValue<Value, PendingValue> = { readonly p?: PromiseLike<unknown> } & (
  | { readonly v: Awaited<Value> }
  | { readonly f: PendingValue; readonly v?: Awaited<Value> }
  | { readonly e: unknown; readonly v?: Awaited<Value> }
);

export function unwrap<Value, Args extends unknown[], Result>(
  anAtom: WritableAtom<Value, Args, Result>
): WritableAtom<Awaited<Value> | undefined, Args, Result>;

export function unwrap<Value, Args extends unknown[], Result, PendingValue>(
  anAtom: WritableAtom<Value, Args, Result>,
  fallback: (prev?: Awaited<Value>) => PendingValue
): WritableAtom<Awaited<Value> | PendingValue, Args, Result>;

export function unwrap<Value>(anAtom: Atom<Value>): Atom<Awaited<Value> | undefined>;

export function unwrap<Value, PendingValue>(
  anAtom: Atom<Value>,
  fallback: (prev?: Awaited<Value>) => PendingValue
): Atom<Awaited<Value> | PendingValue>;

/**
 * Turns an async atom into a sync one: while pending it returns
 * `fallback(prev)` (default `undefined`), so no `<Suspense>` is needed.
 */
export function unwrap<Value, Args extends unknown[], Result, PendingValue>(
  anAtom: WritableAtom<Value, Args, Result> | Atom<Value>,
  fallback: (prev?: Awaited<Value>) => PendingValue = defaultFallback as never
) {
  return memo2(
    () => {
      const promiseErrorCache = new WeakMap<PromiseLike<unknown>, unknown>();
      const promiseResultCache = new WeakMap<PromiseLike<unknown>, Awaited<Value>>();
      const refreshAtom = atom(0);
      const triggerRefreshAtom = atom<[triggerRefresh?: () => void]>([]);
      triggerRefreshAtom.unstable_onInit = (store) => {
        store.set(triggerRefreshAtom, [() => store.set(refreshAtom, (c) => c + 1)]);
      };
      refreshAtom.debugPrivate = true;
      triggerRefreshAtom.debugPrivate = true;

      const promiseAndValueAtom: Atom<PromiseAndValue<Value, PendingValue>> & {
        init?: undefined;
      } = atom((get) => {
        get(refreshAtom);
        let prev: PromiseAndValue<Value, PendingValue> | undefined;
        try {
          prev = get(promiseAndValueAtom) as PromiseAndValue<Value, PendingValue> | undefined;
        } catch {
          // ignore previous errors so we don't get stuck in an error state
        }
        const promise = get(anAtom);
        if (!isPromiseLike(promise)) {
          return { v: promise as Awaited<Value> };
        }
        if (promise !== prev?.p) {
          const refresh = () => {
            const [triggerRefresh] = get(triggerRefreshAtom);
            triggerRefresh?.();
          };
          promise.then(
            (v) => {
              promiseResultCache.set(promise, v as Awaited<Value>);
              refresh();
            },
            (e) => {
              promiseErrorCache.set(promise, e);
              refresh();
            }
          );
        }
        if (promiseErrorCache.has(promise)) {
          if (prev && 'e' in prev && prev.p === promise) {
            return prev;
          }
          const e = promiseErrorCache.get(promise);
          return prev && 'v' in prev ? { p: promise, e, v: prev.v } : { p: promise, e };
        }
        if (promiseResultCache.has(promise)) {
          return { p: promise, v: promiseResultCache.get(promise) as Awaited<Value> };
        }
        if (prev && 'v' in prev) {
          return { p: promise, f: fallback(prev.v), v: prev.v };
        }
        return { p: promise, f: fallback() };
      });
      // allows reading the previous value before first initialization
      promiseAndValueAtom.init = undefined;
      promiseAndValueAtom.debugPrivate = true;

      return atom(
        (get) => {
          const state = get(promiseAndValueAtom);
          if ('e' in state) {
            throw state.e;
          }
          if ('f' in state) {
            return state.f;
          }
          return state.v;
        },
        (_get, set, ...args: unknown[]) =>
          set(anAtom as WritableAtom<Value, unknown[], unknown>, ...args)
      );
    },
    anAtom,
    fallback
  );
}
