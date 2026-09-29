import { atom, createStore, getDefaultStore, traceAtomUpdates } from '../vanilla';

describe('atom + store', () => {
  it('reads and writes a primitive atom', () => {
    const store = createStore();
    const countAtom = atom(0);
    expect(store.get(countAtom)).toBe(0);
    store.set(countAtom, 1);
    expect(store.get(countAtom)).toBe(1);
    store.set(countAtom, (c) => c + 1);
    expect(store.get(countAtom)).toBe(2);
  });

  it('isolates values per store', () => {
    const a = atom('x');
    const s1 = createStore();
    const s2 = createStore();
    s1.set(a, 'y');
    expect(s1.get(a)).toBe('y');
    expect(s2.get(a)).toBe('x');
  });

  it('has a lazily created default store', () => {
    expect(getDefaultStore()).toBe(getDefaultStore());
  });

  it('derives read-only atoms and recomputes on change', () => {
    const store = createStore();
    const priceAtom = atom(10);
    const qtyAtom = atom(2);
    const totalAtom = atom((get) => get(priceAtom) * get(qtyAtom));
    expect(store.get(totalAtom)).toBe(20);
    store.set(qtyAtom, 3);
    expect(store.get(totalAtom)).toBe(30);
  });

  it('supports writable derived and write-only atoms', () => {
    const store = createStore();
    const celsiusAtom = atom(0);
    const fahrenheitAtom = atom(
      (get) => (get(celsiusAtom) * 9) / 5 + 32,
      (_get, set, f: number) => set(celsiusAtom, ((f - 32) * 5) / 9)
    );
    const resetAtom = atom(null, (_get, set) => set(celsiusAtom, 0));
    store.set(fahrenheitAtom, 212);
    expect(store.get(celsiusAtom)).toBe(100);
    store.set(resetAtom);
    expect(store.get(fahrenheitAtom)).toBe(32);
  });

  it('notifies subscribers only when the value changes', () => {
    const store = createStore();
    const a = atom(1);
    const doubled = atom((get) => get(a) * 2);
    const listener = jest.fn();
    const unsub = store.sub(doubled, listener);
    store.set(a, 1); // same value
    expect(listener).not.toHaveBeenCalled();
    store.set(a, 2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get(doubled)).toBe(4);
    unsub();
    store.set(a, 3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when a derived value stays equal', () => {
    const store = createStore();
    const n = atom(1);
    const isEven = atom((get) => get(n) % 2 === 0);
    const listener = jest.fn();
    store.sub(isEven, listener);
    store.set(n, 3);
    expect(listener).not.toHaveBeenCalled();
    store.set(n, 4);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('computes each dependent once per update (diamond)', () => {
    const store = createStore();
    const base = atom(1);
    const left = atom((get) => get(base) + 1);
    const right = atom((get) => get(base) * 10);
    const reads = jest.fn();
    const sum = atom((get) => {
      reads();
      return get(left) + get(right);
    });
    store.sub(sum, () => {});
    reads.mockClear();
    store.set(base, 2);
    expect(store.get(sum)).toBe(3 + 20);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('tracks dynamic dependencies', () => {
    const store = createStore();
    const useA = atom(true);
    const a = atom('a');
    const b = atom('b');
    const pick = atom((get) => (get(useA) ? get(a) : get(b)));
    const listener = jest.fn();
    store.sub(pick, listener);
    store.set(useA, false);
    expect(store.get(pick)).toBe('b');
    listener.mockClear();
    store.set(a, 'A'); // no longer a dependency
    expect(listener).not.toHaveBeenCalled();
    store.set(b, 'B');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('runs onMount / onUnmount', () => {
    const store = createStore();
    const onUnmount = jest.fn();
    const a = atom(0);
    a.onMount = (set) => {
      set(42);
      return onUnmount;
    };
    const derived = atom((get) => get(a));
    const unsub = store.sub(derived, () => {});
    expect(store.get(a)).toBe(42);
    unsub();
    expect(onUnmount).toHaveBeenCalledTimes(1);
  });

  it('stores errors thrown by read and rethrows them on get', () => {
    const store = createStore();
    const boom = atom(() => {
      throw new Error('boom');
    });
    expect(() => store.get(boom)).toThrow('boom');
  });

  it('handles async atoms and aborts stale reads', async () => {
    const store = createStore();
    const idAtom = atom(1);
    const aborted = jest.fn();
    const userAtom = atom(async (get, { signal }) => {
      const id = get(idAtom);
      signal.addEventListener('abort', aborted);
      await new Promise((r) => setTimeout(r, 10));
      return `user-${id}`;
    });
    store.sub(userAtom, () => {});
    const first = store.get(userAtom);
    store.set(idAtom, 2);
    expect(aborted).toHaveBeenCalledTimes(1);
    const second = store.get(userAtom);
    expect(first).not.toBe(second);
    await expect(second).resolves.toBe('user-2');
  });

  it('supports async writes that flush after await', async () => {
    const store = createStore();
    const a = atom(0);
    const asyncInc = atom(null, async (get, set) => {
      await Promise.resolve();
      set(a, get(a) + 1);
    });
    const listener = jest.fn();
    store.sub(a, listener);
    await store.set(asyncInc);
    expect(store.get(a)).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('uses debugLabel in toString', () => {
    const a = atom(0);
    a.debugLabel = 'count';
    expect(String(a)).toMatch(/^atom\d+:count$/);
  });
});

describe('traceAtomUpdates', () => {
  it('reports the cause and its direct downstream effect', () => {
    const store = createStore();
    const a = atom(1);
    const doubled = atom((get) => get(a) * 2);
    store.sub(doubled, () => {});
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.set(a, 2);
    expect(events).toEqual([{ cause: a, effects: [doubled] }]);
  });

  it('reports an empty effects list when nothing depends on the written atom', () => {
    const store = createStore();
    const a = atom(1);
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.set(a, 2);
    expect(events).toEqual([{ cause: a, effects: [] }]);
  });

  it('does not fire when the write does not actually change the value', () => {
    const store = createStore();
    const a = atom(1);
    store.get(a); // establish a's cached value, so the next same-value set() is a genuine no-op
    const events: unknown[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.set(a, 1);
    expect(events).toEqual([]);
  });

  it('reports multi-hop causality (A causes B causes C)', () => {
    const store = createStore();
    const a = atom(1);
    const b = atom((get) => get(a) + 1);
    const c = atom((get) => get(b) + 1);
    store.sub(c, () => {});
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.set(a, 2);
    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(a);
    expect(events[0]!.effects).toEqual([b, c]);
  });

  it('reports a diamond-shaped effect set without duplicate or missing entries', () => {
    const store = createStore();
    const base = atom(1);
    const left = atom((get) => get(base) + 1);
    const right = atom((get) => get(base) * 10);
    const sum = atom((get) => get(left) + get(right));
    store.sub(sum, () => {});
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.set(base, 2);
    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(base);
    expect(events[0]!.effects).toHaveLength(3);
    expect(new Set(events[0]!.effects)).toEqual(new Set([left, right, sum]));
  });

  it('reports a nested/re-entrant set() (from a listener) as its own separate event', () => {
    const store = createStore();
    const a = atom(1);
    const b = atom(10);
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.sub(a, () => {
      store.set(b, (v) => v + 1);
    });
    store.set(a, 2);
    // The nested `set(b)` call (made from a's listener) fully completes —
    // and reports its own trace event — before control returns to the
    // outer `set(a)` call's own finally block, so b's event is observed
    // first even though a was written first.
    expect(events).toEqual([
      { cause: b, effects: [] },
      { cause: a, effects: [] },
    ]);
  });

  it('stops tracing once the returned unsubscribe is called', () => {
    const store = createStore();
    const a = atom(1);
    const events: unknown[] = [];
    const stop = traceAtomUpdates(store, (e) => events.push(e));
    store.set(a, 2);
    stop();
    store.set(a, 3);
    expect(events).toHaveLength(1);
  });

  it('has zero effect on ordinary reads/writes when no handler is registered', () => {
    const store = createStore();
    const a = atom(1);
    const doubled = atom((get) => get(a) * 2);
    store.sub(doubled, () => {});
    store.set(a, 5);
    expect(store.get(doubled)).toBe(10);
  });
});

describe('store.transaction', () => {
  it('batches multiple set() calls: dependents recompute once, listeners fire once', () => {
    const store = createStore();
    const a = atom(1);
    const b = atom(10);
    const reads = jest.fn();
    const sum = atom((get) => {
      reads();
      return get(a) + get(b);
    });
    const listener = jest.fn();
    store.sub(sum, listener);
    reads.mockClear();
    store.transaction(() => {
      store.set(a, 2);
      store.set(b, 20);
    });
    expect(store.get(sum)).toBe(22);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not recompute or flush until the transaction returns', () => {
    const store = createStore();
    const a = atom(1);
    const listener = jest.fn();
    store.sub(a, listener);
    store.transaction(() => {
      store.set(a, 2);
      // Still inside the transaction: no flush has happened yet.
      expect(listener).not.toHaveBeenCalled();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('returns the value fn() returns', () => {
    const store = createStore();
    const a = atom(1);
    const result = store.transaction(() => {
      store.set(a, 2);
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('nests: an inner transaction defers to the outermost one', () => {
    const store = createStore();
    const a = atom(1);
    const b = atom(10);
    const listener = jest.fn();
    store.sub(a, listener);
    store.sub(b, listener);
    store.transaction(() => {
      store.set(a, 2);
      store.transaction(() => {
        store.set(b, 20);
      });
      expect(listener).not.toHaveBeenCalled();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still commits writes made before a synchronous throw, and propagates the error', () => {
    const store = createStore();
    const a = atom(1);
    const listener = jest.fn();
    store.sub(a, listener);
    expect(() =>
      store.transaction(() => {
        store.set(a, 2);
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(store.get(a)).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('preserves diamond-safety across writes to dynamically-tracked dependencies', () => {
    const store = createStore();
    const useA = atom(true);
    const a = atom('a');
    const b = atom('b');
    const pick = atom((get) => (get(useA) ? get(a) : get(b)));
    const listener = jest.fn();
    store.sub(pick, listener);
    store.transaction(() => {
      store.set(useA, false);
      store.set(b, 'B');
    });
    expect(store.get(pick)).toBe('B');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('preserves onMount/onUnmount ordering when the mounting subscribe happens inside a transaction', () => {
    const store = createStore();
    const onUnmount = jest.fn();
    const a = atom(0);
    a.onMount = (set) => {
      set(42);
      return onUnmount;
    };
    const derived = atom((get) => get(a));
    let unsub!: () => void;
    store.transaction(() => {
      unsub = store.sub(derived, () => {});
    });
    expect(store.get(a)).toBe(42);
    unsub();
    expect(onUnmount).toHaveBeenCalledTimes(1);
  });

  it('combined with traceAtomUpdates, reports one event per cause sharing the transaction effects', () => {
    const store = createStore();
    const a = atom(1);
    const b = atom(10);
    const sum = atom((get) => get(a) + get(b));
    store.sub(sum, () => {});
    const events: { cause: unknown; effects: unknown[] }[] = [];
    traceAtomUpdates(store, (e) => events.push(e));
    store.transaction(() => {
      store.set(a, 2);
      store.set(b, 20);
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ cause: a, effects: [sum] });
    expect(events[1]).toEqual({ cause: b, effects: [sum] });
  });
});
