import { AppState, Appearance } from 'react-native';

import { appStateAtom, atom, colorSchemeAtom, createStore, flushStorageOnBackground } from '..';

describe('react-native helper atoms', () => {
  it('appStateAtom follows AppState change events', () => {
    const listeners: ((s: string) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      listeners.push(cb as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
    const store = createStore();
    const isForeground = atom((get) => get(appStateAtom) === 'active');
    store.sub(isForeground, () => {});
    listeners.forEach((l) => l('background'));
    expect(store.get(appStateAtom)).toBe('background');
    expect(store.get(isForeground)).toBe(false);
    spy.mockRestore();
  });

  it('colorSchemeAtom follows Appearance changes', () => {
    let emit: (p: { colorScheme: 'light' | 'dark' }) => void = () => {};
    const spy = jest.spyOn(Appearance, 'addChangeListener').mockImplementation((cb) => {
      emit = cb as typeof emit;
      return { remove: jest.fn() } as never;
    });
    const store = createStore();
    store.sub(colorSchemeAtom, () => {});
    emit({ colorScheme: 'dark' });
    expect(store.get(colorSchemeAtom)).toBe('dark');
    spy.mockRestore();
  });

  describe('flushStorageOnBackground', () => {
    const mockAppState = () => {
      const listeners: ((s: string) => void)[] = [];
      const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
        listeners.push(cb as (s: string) => void);
        return { remove: jest.fn() } as never;
      });
      return { emit: (s: string) => listeners.forEach((l) => l(s)), spy };
    };

    it('flushes on active -> background', () => {
      const { emit, spy } = mockAppState();
      const store = createStore();
      const flush = jest.fn();
      flushStorageOnBackground(store, [
        { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush },
      ]);
      emit('background');
      expect(flush).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('flushes on active -> inactive', () => {
      const { emit, spy } = mockAppState();
      const store = createStore();
      const flush = jest.fn();
      flushStorageOnBackground(store, [
        { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush },
      ]);
      emit('inactive');
      expect(flush).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('does not flush on background -> active or repeated background events', () => {
      const { emit, spy } = mockAppState();
      const store = createStore();
      const flush = jest.fn();
      flushStorageOnBackground(store, [
        { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush },
      ]);
      emit('background');
      expect(flush).toHaveBeenCalledTimes(1);
      emit('active');
      emit('background');
      expect(flush).toHaveBeenCalledTimes(2); // the second active->background transition
      emit('background'); // no active in between -> no new flush
      expect(flush).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('reports errors via onError and skips storages without flush', () => {
      const { emit, spy } = mockAppState();
      const store = createStore();
      const onError = jest.fn();
      const throwing = jest.fn(() => {
        throw new Error('nope');
      });
      const rejecting = jest.fn(() => Promise.reject(new Error('async nope')));
      flushStorageOnBackground(
        store,
        [
          { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush: throwing },
          { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush: rejecting },
          { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }, // no flush
        ],
        { onError }
      );
      emit('background');
      expect(throwing).toHaveBeenCalledTimes(1);
      expect(rejecting).toHaveBeenCalledTimes(1);
      return Promise.resolve().then(() => {
        expect(onError).toHaveBeenCalledTimes(2);
        spy.mockRestore();
      });
    });

    it('unsubscribing stops future flushes', () => {
      const { emit, spy } = mockAppState();
      const store = createStore();
      const flush = jest.fn();
      const unsub = flushStorageOnBackground(store, [
        { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), flush },
      ]);
      unsub();
      emit('background');
      expect(flush).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
