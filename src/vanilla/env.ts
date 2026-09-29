declare const __DEV__: boolean | undefined;
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * `true` in development builds. Uses React Native's `__DEV__` when present
 * (Expo / Metro, native and web) and falls back to `process.env.NODE_ENV`
 * for plain JS runtimes such as Node or Jest.
 */
export const isDev = (): boolean => {
  if (typeof __DEV__ !== 'undefined') {
    return !!__DEV__;
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
};

export const isPromiseLike = (x: unknown): x is PromiseLike<unknown> =>
  typeof (x as PromiseLike<unknown> | undefined)?.then === 'function';
