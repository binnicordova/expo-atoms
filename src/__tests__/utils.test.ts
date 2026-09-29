import {
  RESET,
  atom,
  atomFamily,
  atomWithDefault,
  atomWithLazy,
  atomWithReducer,
  atomWithRefresh,
  atomWithReset,
  atomWithStorage,
  createJSONStorage,
  createStore,
  freezeAtom,
  loadable,
  selectAtom,
  splitAtom,
  unwrap,
  withStorageValidator,
} from '../vanilla';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('utils', () => {
  it('atomWithReset', () => {
    const store = createStore();
    const a = atomWithReset(5);
    store.set(a, 9);
    store.set(a, RESET);
    expect(store.get(a)).toBe(5);
  });

  it('atomWithReducer', () => {
    const store = createStore();
    const a = atomWithReducer(0, (v, action: 'inc' | 'dec') => (action === 'inc' ? v + 1 : v - 1));
    store.set(a, 'inc');
    store.set(a, 'inc');
    store.set(a, 'dec');
    expect(store.get(a)).toBe(1);
  });

  it('atomWithDefault follows default until written, then RESET', () => {
    const store = createStore();
    const base = atom(1);
    const a = atomWithDefault((get) => get(base) * 2);
    expect(store.get(a)).toBe(2);
    store.set(a, 10);
    store.set(base, 5);
    expect(store.get(a)).toBe(10);
    store.set(a, RESET);
    expect(store.get(a)).toBe(10); // 5 * 2
    store.set(base, 6);
    expect(store.get(a)).toBe(12);
  });

  it('atomWithRefresh re-runs read', () => {
    const store = createStore();
    let n = 0;
    const a = atomWithRefresh(() => ++n);
    store.sub(a, () => {});
    expect(store.get(a)).toBe(1);
    store.set(a);
    expect(store.get(a)).toBe(2);
  });

  it('atomWithLazy initializes once per store', () => {
    const init = jest.fn(() => ({ big: true }));
    const a = atomWithLazy(init);
    expect(init).not.toHaveBeenCalled();
    const s1 = createStore();
    s1.get(a);
    s1.get(a);
    expect(init).toHaveBeenCalledTimes(1);
    createStore().get(a);
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('selectAtom only notifies when the slice changes', () => {
    const store = createStore();
    const person = atom({ name: 'Ada', age: 36 });
    const name = selectAtom(person, (p) => p.name);
    expect(selectAtom(person, (p) => p.name)).not.toBe(name); // new selector fn
    const listener = jest.fn();
    store.sub(name, listener);
    store.set(person, (p) => ({ ...p, age: 37 }));
    expect(listener).not.toHaveBeenCalled();
    store.set(person, (p) => ({ ...p, name: 'Grace' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get(name)).toBe('Grace');
  });

  it('selectAtom with custom equality keeps previous reference', () => {
    const store = createStore();
    const list = atom([1, 2, 3]);
    const shallow = (a: number[], b: number[]) =>
      a.length === b.length && a.every((x, i) => x === b[i]);
    const evens = selectAtom(list, (l) => l.filter((x) => x % 2 === 0), shallow);
    const first = store.get(evens);
    store.set(list, [1, 2, 3, 5]);
    expect(store.get(evens)).toBe(first);
  });

  it('freezeAtom freezes values', () => {
    const store = createStore();
    const a = freezeAtom(atom({ nested: { x: 1 } }));
    store.set(a, { nested: { x: 2 } });
    const value = store.get(a);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
  });

  it('splitAtom splits, updates, inserts, moves and removes', () => {
    const store = createStore();
    const todos = atom([
      { id: 'a', done: false },
      { id: 'b', done: false },
    ]);
    const todoAtoms = splitAtom(todos, (t) => t.id);
    const [aAtom, bAtom] = store.get(todoAtoms);
    store.set(aAtom!, (t) => ({ ...t, done: true }));
    expect(store.get(todos)[0]!.done).toBe(true);

    // updating one item keeps the list of item atoms referentially stable
    const listListener = jest.fn();
    const unsubList = store.sub(todoAtoms, listListener);
    const before = store.get(todoAtoms);
    store.set(bAtom!, (t) => ({ ...t, done: true }));
    expect(store.get(todoAtoms)).toBe(before);
    expect(listListener).not.toHaveBeenCalled();
    unsubList();

    store.set(todoAtoms, { type: 'insert', value: { id: 'c', done: false } });
    expect(store.get(todos).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    // keyed atoms are stable
    expect(store.get(todoAtoms)[0]).toBe(aAtom);

    store.set(todoAtoms, { type: 'move', atom: bAtom!, before: aAtom });
    expect(store.get(todos).map((t) => t.id)).toEqual(['b', 'a', 'c']);

    store.set(todoAtoms, { type: 'remove', atom: aAtom! });
    expect(store.get(todos).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('unwrap and loadable handle async atoms without suspending', async () => {
    const store = createStore();
    let resolve!: (v: number) => void;
    const asyncAtom = atom(() => new Promise<number>((r) => (resolve = r)));
    const unwrapped = unwrap(asyncAtom, () => -1);
    const l = loadable(asyncAtom);
    store.sub(unwrapped, () => {});
    store.sub(l, () => {});
    expect(store.get(unwrapped)).toBe(-1);
    expect(store.get(l)).toEqual({ state: 'loading' });
    resolve(7);
    await flush();
    expect(store.get(unwrapped)).toBe(7);
    expect(store.get(l)).toEqual({ state: 'hasData', data: 7 });
  });

  it('loadable reports errors', async () => {
    const store = createStore();
    const failing = atom(async () => {
      throw new Error('nope');
    });
    const l = loadable(failing);
    store.sub(l, () => {});
    await flush();
    const value = store.get(l);
    expect(value.state).toBe('hasError');
  });

  it('atomFamily caches by param and supports remove/areEqual', () => {
    const fam = atomFamily(
      ({ id }: { id: number }) => atom(id),
      (a, b) => a.id === b.id
    );
    const a1 = fam({ id: 1 });
    expect(fam({ id: 1 })).toBe(a1);
    const events: string[] = [];
    fam.subscribe((e) => events.push(e.type));
    fam.remove({ id: 1 });
    expect(fam({ id: 1 })).not.toBe(a1);
    expect(events).toEqual(['REMOVE', 'CREATE']);
    expect([...fam.getParams()]).toHaveLength(1);
  });

  describe('atomWithStorage', () => {
    const makeSyncStorage = () => {
      const data = new Map<string, string>();
      return {
        data,
        storage: {
          getItem: (k: string) => data.get(k) ?? null,
          setItem: (k: string, v: string) => {
            data.set(k, v);
          },
          removeItem: (k: string) => {
            data.delete(k);
          },
        },
      };
    };

    it('persists with a sync string storage', () => {
      const { data, storage } = makeSyncStorage();
      data.set('theme', JSON.stringify('dark'));
      const store = createStore();
      const theme = atomWithStorage(
        'theme',
        'light',
        createJSONStorage<string>(() => storage)
      );
      store.sub(theme, () => {});
      expect(store.get(theme)).toBe('dark');
      store.set(theme, 'system');
      expect(data.get('theme')).toBe('"system"');
      store.set(theme, RESET);
      expect(store.get(theme)).toBe('light');
      expect(data.has('theme')).toBe(false);
    });

    it('hydrates from AsyncStorage-like storage without suspending', async () => {
      const data = new Map<string, string>([['count', '3']]);
      const asyncStorage = {
        getItem: async (k: string) => data.get(k) ?? null,
        setItem: async (k: string, v: string) => {
          data.set(k, v);
        },
        removeItem: async (k: string) => {
          data.delete(k);
        },
      };
      const store = createStore();
      const count = atomWithStorage(
        'count',
        0,
        createJSONStorage<number>(() => asyncStorage)
      );
      store.sub(count, () => {});
      expect(store.get(count)).toBe(0); // initial value, not a promise
      await flush();
      expect(store.get(count)).toBe(3);
      await store.set(count, (c) => c + 1);
      expect(data.get('count')).toBe('4');
    });

    it('does not let a late load overwrite a user write', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const asyncStorage = {
        getItem: async () => {
          await gate;
          return '"from-disk"';
        },
        setItem: async () => {},
        removeItem: async () => {},
      };
      const store = createStore();
      const a = atomWithStorage(
        'k',
        'init',
        createJSONStorage<string>(() => asyncStorage)
      );
      store.sub(a, () => {});
      store.set(a, 'typed');
      release();
      await flush();
      expect(store.get(a)).toBe('typed');
    });

    it('validates stored values', () => {
      const { data, storage } = makeSyncStorage();
      data.set('n', JSON.stringify('not-a-number'));
      const isNumber = (v: unknown): v is number => typeof v === 'number';
      const store = createStore();
      const n = atomWithStorage(
        'n',
        1,
        withStorageValidator(isNumber)(createJSONStorage(() => storage))
      );
      store.sub(n, () => {});
      expect(store.get(n)).toBe(1);
    });

    it('getOnInit loads without mounting', async () => {
      const { data, storage } = makeSyncStorage();
      data.set('flag', 'true');
      const store = createStore();
      const flag = atomWithStorage(
        'flag',
        false,
        createJSONStorage<boolean>(() => storage),
        {
          getOnInit: true,
        }
      );
      expect(store.get(flag)).toBe(true);
    });
  });
});
