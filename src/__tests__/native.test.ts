import { AppState, Appearance } from 'react-native';

import { appStateAtom, atom, colorSchemeAtom, createStore } from '..';

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
});
