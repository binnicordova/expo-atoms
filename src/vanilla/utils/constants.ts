/** Pass to a resettable atom's setter to restore its initial/default value. */
export const RESET: unique symbol = Symbol(
  typeof __DEV__ !== 'undefined' && __DEV__ ? 'RESET' : ''
);

declare const __DEV__: boolean | undefined;
