/**
 * expo-atoms — primitive and flexible atomic state for Expo & React Native.
 *
 * 100% TypeScript / JavaScript: no native code, so it runs in Expo Go on
 * iOS, Android and web, and ships inside `expo-updates` OTA bundles.
 */
export * from './vanilla/index';
export * from './vanilla/utils';
export * from './react/index';
export { appStateAtom, colorSchemeAtom } from './native/index';
