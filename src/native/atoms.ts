import { AppState, Appearance } from 'react-native';
import type { AppStateStatus, ColorSchemeName } from 'react-native';

import { atom } from '../vanilla/atom';
import type { Atom, PrimitiveAtom } from '../vanilla/atom';

const readAppState = (): AppStateStatus | undefined => {
  const state: unknown = AppState.currentState;
  return typeof state === 'string' ? (state as AppStateStatus) : undefined;
};

const readColorScheme = (): ColorSchemeName | null => {
  const scheme: unknown = Appearance.getColorScheme?.();
  return typeof scheme === 'string' ? (scheme as ColorSchemeName) : null;
};

/** A primitive atom that never mistakes its initial value for a read function. */
const valueAtom = <T>(initialValue: T): PrimitiveAtom<T> => {
  const a = atom<T>(undefined as T);
  (a as { init: T }).init = initialValue;
  return a;
};

/**
 * Current `AppState` ('active' | 'background' | 'inactive' | …), kept in sync
 * while mounted. Pure JS: works in Expo Go on iOS, Android and web.
 *
 * @example
 * const isForeground = atom((get) => get(appStateAtom) === 'active')
 */
export const appStateAtom: Atom<AppStateStatus> = (() => {
  const base = valueAtom<AppStateStatus>(readAppState() ?? 'active');
  base.debugLabel = 'appState';
  base.onMount = (set) => {
    const current = readAppState();
    if (current) {
      set(current);
    }
    const sub = AppState.addEventListener('change', (next) => set(next));
    return () => sub?.remove();
  };
  return atom((get) => get(base));
})();

/**
 * Device color scheme ('light' | 'dark' | 'unspecified', or `null` when
 * unknown), kept in sync while mounted.
 */
export const colorSchemeAtom: Atom<ColorSchemeName | null> = (() => {
  const base = valueAtom<ColorSchemeName | null>(readColorScheme());
  base.debugLabel = 'colorScheme';
  base.onMount = (set) => {
    set(readColorScheme());
    const sub = Appearance.addChangeListener(({ colorScheme }) => set(colorScheme ?? null));
    return () => sub?.remove();
  };
  return atom((get) => get(base));
})();
