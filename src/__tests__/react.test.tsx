import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React, { Suspense } from 'react';
import { Pressable, Text } from 'react-native';

import {
  Provider,
  RESET,
  atom,
  atomWithReset,
  createStore,
  useAtom,
  useAtomCallback,
  useAtomValue,
  useHydrateAtoms,
  useResetAtom,
  useSetAtom,
} from '..';

describe('react bindings', () => {
  it('useAtom reads and updates', async () => {
    const countAtom = atom(0);
    function Counter() {
      const [count, setCount] = useAtom(countAtom);
      return (
        <Pressable onPress={() => setCount((c) => c + 1)}>
          <Text>count:{count}</Text>
        </Pressable>
      );
    }
    await render(
      <Provider>
        <Counter />
      </Provider>
    );
    await fireEvent.press(screen.getByText('count:0'));
    expect(screen.getByText('count:1')).toBeTruthy();
  });

  it('shares state across components and re-renders only subscribers', async () => {
    const textAtom = atom('hi');
    const upper = atom((get) => get(textAtom).toUpperCase());
    let setterRenders = 0;
    function Display() {
      return <Text>{useAtomValue(upper)}</Text>;
    }
    function Setter() {
      setterRenders++;
      const set = useSetAtom(textAtom);
      return (
        <Pressable onPress={() => set('hello')}>
          <Text>set</Text>
        </Pressable>
      );
    }
    await render(
      <Provider>
        <Display />
        <Setter />
      </Provider>
    );
    await fireEvent.press(screen.getByText('set'));
    expect(screen.getByText('HELLO')).toBeTruthy();
    expect(setterRenders).toBe(1);
  });

  it('Provider scopes state and accepts an external store', async () => {
    const a = atom('default');
    const store = createStore();
    store.set(a, 'external');
    function Show({ testID }: { testID: string }) {
      return <Text testID={testID}>{useAtomValue(a)}</Text>;
    }
    await render(
      <>
        <Provider store={store}>
          <Show testID="ext" />
        </Provider>
        <Provider>
          <Show testID="own" />
        </Provider>
      </>
    );
    expect(screen.getByTestId('ext').props.children).toBe('external');
    expect(screen.getByTestId('own').props.children).toBe('default');
  });

  it('reacts to store updates made outside React', async () => {
    const a = atom(1);
    const store = createStore();
    function Show() {
      return <Text>v:{useAtomValue(a)}</Text>;
    }
    await render(
      <Provider store={store}>
        <Show />
      </Provider>
    );
    await act(() => store.set(a, 2));
    expect(screen.getByText('v:2')).toBeTruthy();
  });

  it('suspends on async atoms', async () => {
    const asyncAtom = atom(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 'loaded';
    });
    function Show() {
      return <Text>{useAtomValue(asyncAtom)}</Text>;
    }
    await render(
      <Provider>
        <Suspense fallback={<Text>loading</Text>}>
          <Show />
        </Suspense>
      </Provider>
    );
    expect(screen.getByText('loading')).toBeTruthy();
    expect(await screen.findByText('loaded')).toBeTruthy();
  });

  it('useResetAtom, useAtomCallback and useHydrateAtoms', async () => {
    const name = atomWithReset('anon');
    const count = atom(0);
    let read: () => number = () => -1;
    function Comp() {
      useHydrateAtoms([[count, 10]]);
      const value = useAtomValue(name);
      const reset = useResetAtom(name);
      const setName = useSetAtom(name);
      read = useAtomCallback(React.useCallback((get) => get(count), []));
      return (
        <>
          <Text>name:{value}</Text>
          <Pressable onPress={() => setName('ada')}>
            <Text>rename</Text>
          </Pressable>
          <Pressable onPress={reset}>
            <Text>reset</Text>
          </Pressable>
        </>
      );
    }
    await render(
      <Provider>
        <Comp />
      </Provider>
    );
    expect(read()).toBe(10);
    await fireEvent.press(screen.getByText('rename'));
    expect(screen.getByText('name:ada')).toBeTruthy();
    await fireEvent.press(screen.getByText('reset'));
    expect(screen.getByText('name:anon')).toBeTruthy();
    expect(RESET).toBeDefined();
  });
});
