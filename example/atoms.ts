import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  atom,
  atomFamily,
  atomWithReset,
  atomWithRefresh,
  atomWithStorage,
  createJSONStorage,
  loadable,
  selectAtom,
  splitAtom,
} from 'expo-atoms';

// ─── Counter: primitive + derived ────────────────────────────────────────────
export const countAtom = atomWithReset(0);
countAtom.debugLabel = 'count';

export const doubledAtom = atom((get) => get(countAtom) * 2);
export const parityAtom = atom((get) => (get(countAtom) % 2 === 0 ? 'even' : 'odd'));

// ─── Todos: persisted with AsyncStorage (bundled in Expo Go) ─────────────────
export type Todo = { id: string; title: string; done: boolean };

const storage = createJSONStorage<Todo[]>(() => AsyncStorage);

export const todosAtom = atomWithStorage<Todo[]>(
  'expo-atoms-example:todos',
  [
    { id: '1', title: 'Create an atom', done: true },
    { id: '2', title: 'Derive another atom from it', done: false },
    { id: '3', title: 'Ship it with an OTA update', done: false },
  ],
  storage
);

export const todoAtomsAtom = splitAtom(todosAtom, (todo) => todo.id);

export const remainingAtom = selectAtom(todosAtom, (todos) => todos.filter((t) => !t.done).length);

export const addTodoAtom = atom(null, (_get, set, title: string) => {
  set(todosAtom, (todos) => [...todos, { id: String(Date.now()), title, done: false }]);
});

// ─── Async: refreshable fetch + loadable (no Suspense needed) ────────────────
const QUOTES = [
  'Small pieces, loosely joined.',
  'State is just atoms, all the way down.',
  'Derive, do not duplicate.',
  'Update only what changed.',
  'Ship JavaScript, not native code.',
];

export const quoteAtom = atomWithRefresh(async (_get, { signal }) => {
  // simulated network request that respects cancellation
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, 700);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });
  return QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
});

export const quoteLoadableAtom = loadable(quoteAtom);

// ─── Families: one atom per id ───────────────────────────────────────────────
export const likesFamily = atomFamily((_id: string) => atom(0));
