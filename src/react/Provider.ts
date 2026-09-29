import { createContext, createElement, useContext, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import { createStore, getDefaultStore } from '../vanilla/store';
import type { Store } from '../vanilla/store';

const StoreContext = createContext<Store | undefined>(undefined);

export type StoreOptions = {
  /** Use this store instead of the nearest `<Provider>` / default store. */
  store?: Store;
};

/** Returns the store hooks will use: `options.store` → nearest `<Provider>` → default store. */
export function useStore(options?: StoreOptions): Store {
  const store = useContext(StoreContext);
  return options?.store || store || getDefaultStore();
}

/**
 * Scopes atom values to a subtree. Without a `store` prop, a fresh store is
 * created once for the lifetime of the Provider. Optional — without any
 * Provider, hooks use the default store ("provider-less mode").
 */
export function Provider({
  children,
  store,
}: {
  children?: ReactNode;
  store?: Store;
}): ReactElement {
  const [ownStore] = useState(() => (store ? undefined : createStore()));
  return createElement(StoreContext.Provider, { value: store ?? ownStore }, children);
}
