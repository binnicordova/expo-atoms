import type { Atom } from '../atom';
import { getStoreInternals } from '../store';
import type { Store } from '../store';

export type AtomTraceEvent = {
  /** The atom passed directly to the `store.set()` (or `store.transaction()`-nested `set()`) call that triggered this event. */
  cause: Atom<unknown>;
  /**
   * Every atom recomputed as a downstream effect of that write — multi-hop
   * (A causes B causes C) and diamond-shaped (one write, several
   * independent downstream branches) graphs included, each atom listed
   * exactly once, in the order it was recomputed. Empty when the write
   * changed nothing downstream (e.g. a leaf atom nobody depends on).
   */
  effects: Atom<unknown>[];
};

/**
 * Dev-mode "why did this change" causality trace. `store.ts` already
 * computes the exact reverse-dependency graph on every `store.set()` (to
 * batch, diamond-safe, recompute each affected atom exactly once) — this
 * just surfaces that data instead of throwing it away.
 *
 * Calls `onTrace` once per top-level `store.set()` call, reporting the atom
 * that was written (`cause`) and every atom that ended up being recomputed
 * because of it (`effects`). A `store.transaction(fn)` batch reports one
 * event per `set()` call made inside it, once the transaction commits, each
 * sharing the transaction's combined `effects` (recompute is genuinely
 * shared across the batch, so individual attribution isn't meaningful).
 * A nested/re-entrant `store.set()` call made from a listener in response
 * to a change is its own, separate event with its own cause.
 *
 * Use `debugLabel` on your atoms so the trace prints readable names
 * (`String(atom)` includes it automatically in dev).
 *
 * Zero-cost when not enabled — the store only tracks recomputes while at
 * least one trace handler is registered; call the returned function to stop.
 *
 * ```ts
 * const stopTrace = traceAtomUpdates(store, ({ cause, effects }) => {
 *   console.log(`[trace] set(${cause}) recomputed:`, effects.map(String));
 * });
 * store.set(countAtom, 1);
 * // [trace] set(atom1:count) recomputed: ['atom2:doubled']
 * stopTrace();
 * ```
 */
export function traceAtomUpdates(
  store: Store,
  onTrace: (event: AtomTraceEvent) => void
): () => void {
  const internals = getStoreInternals(store);
  if (!internals) {
    return () => {};
  }
  return internals.registerTraceHandler(onTrace);
}
