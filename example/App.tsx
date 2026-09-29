import { StatusBar } from 'expo-status-bar';
import {
  Provider,
  RESET,
  appStateAtom,
  atom,
  colorSchemeAtom,
  useAtom,
  useAtomValue,
  useSetAtom,
} from 'expo-atoms';
import type { PrimitiveAtom } from 'expo-atoms';
import { memo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  addTodoAtom,
  countAtom,
  doubledAtom,
  likesFamily,
  parityAtom,
  quoteAtom,
  quoteLoadableAtom,
  remainingAtom,
  todoAtomsAtom,
  type Todo,
} from './atoms';

// ─── Theme derived from the device color scheme ──────────────────────────────
const palette = {
  light: { bg: '#F4F2EE', card: '#FFFFFF', text: '#1B1A17', muted: '#6E6A62', accent: '#3A5BD9', line: '#E4E0D8' },
  dark: { bg: '#121212', card: '#1E1E1E', text: '#F1EFEA', muted: '#A09C94', accent: '#8FA6FF', line: '#2C2C2C' },
};
const themeAtom = atom((get) => palette[get(colorSchemeAtom) === 'dark' ? 'dark' : 'light']);

// ─── Small building blocks ───────────────────────────────────────────────────
function useRenderCount() {
  const renders = useRef(0);
  renders.current += 1;
  return renders.current;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const t = useAtomValue(themeAtom);
  return (
    <View style={[styles.card, { backgroundColor: t.card, borderColor: t.line }]}>
      <Text style={[styles.cardTitle, { color: t.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.cardSubtitle, { color: t.muted }]}>{subtitle}</Text> : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Button({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const t = useAtomValue(themeAtom);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: t.accent, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

function Renders() {
  const t = useAtomValue(themeAtom);
  const n = useRenderCount();
  return <Text style={[styles.renders, { color: t.muted }]}>renders: {n}</Text>;
}

// ─── 1. Counter ──────────────────────────────────────────────────────────────
function CounterValue() {
  const t = useAtomValue(themeAtom);
  const count = useAtomValue(countAtom);
  return (
    <View style={styles.row}>
      <Text testID="count" style={[styles.big, { color: t.text }]}>
        {count}
      </Text>
      <Renders />
    </View>
  );
}

function DerivedValues() {
  const t = useAtomValue(themeAtom);
  const doubled = useAtomValue(doubledAtom);
  const parity = useAtomValue(parityAtom);
  return (
    <View style={styles.row}>
      <Text style={{ color: t.text }}>
        doubled {doubled} · {parity}
      </Text>
      <Renders />
    </View>
  );
}

function CounterControls() {
  // write-only: this component never re-renders when the count changes
  const setCount = useSetAtom(countAtom);
  return (
    <View style={styles.row}>
      <Button testID="dec" label="−1" onPress={() => setCount((c) => c - 1)} />
      <Button testID="inc" label="+1" onPress={() => setCount((c) => c + 1)} />
      <Button label="Reset" onPress={() => setCount(RESET)} />
      <Renders />
    </View>
  );
}

// ─── 2. Todos ────────────────────────────────────────────────────────────────
// Each row subscribes only to its own item atom; toggling one todo re-renders one row.
const TodoRow = memo(function TodoRow({ todoAtom }: { todoAtom: PrimitiveAtom<Todo> }) {
  const t = useAtomValue(themeAtom);
  const [todo, setTodo] = useAtom(todoAtom);
  const dispatch = useSetAtom(todoAtomsAtom);
  return (
    <View style={[styles.todoRow, { borderColor: t.line }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: todo.done }}
        onPress={() => setTodo((prev) => ({ ...prev, done: !prev.done }))}
        style={styles.todoMain}>
        <Text style={{ color: t.accent, fontSize: 18 }}>{todo.done ? '●' : '○'}</Text>
        <Text
          style={[
            styles.todoTitle,
            { color: todo.done ? t.muted : t.text },
            todo.done && styles.strike,
          ]}>
          {todo.title}
        </Text>
      </Pressable>
      <Renders />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${todo.title}`}
        onPress={() => dispatch({ type: 'remove', atom: todoAtom })}
        hitSlop={8}>
        <Text style={{ color: t.muted, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
});

function TodoList() {
  const todoAtoms = useAtomValue(todoAtomsAtom);
  return (
    <>
      {todoAtoms.map((todoAtom) => (
        <TodoRow key={`${todoAtom}`} todoAtom={todoAtom} />
      ))}
    </>
  );
}

function AddTodo() {
  const t = useAtomValue(themeAtom);
  const addTodo = useSetAtom(addTodoAtom);
  const [draft, setDraft] = useState('');
  const submit = () => {
    if (draft.trim()) {
      addTodo(draft.trim());
      setDraft('');
    }
  };
  return (
    <View style={[styles.row, { marginTop: 8 }]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        placeholder="New todo"
        placeholderTextColor={t.muted}
        style={[styles.input, { color: t.text, borderColor: t.line }]}
      />
      <Button label="Add" onPress={submit} />
    </View>
  );
}

function Remaining() {
  const t = useAtomValue(themeAtom);
  const remaining = useAtomValue(remainingAtom);
  return (
    <Text style={{ color: t.muted, marginTop: 8 }}>
      {remaining} remaining · saved to AsyncStorage
    </Text>
  );
}

function Todos() {
  return (
    <>
      <TodoList />
      <AddTodo />
      <Remaining />
    </>
  );
}

// ─── 3. Async ────────────────────────────────────────────────────────────────
function Quote() {
  const t = useAtomValue(themeAtom);
  const quote = useAtomValue(quoteLoadableAtom);
  const refresh = useSetAtom(quoteAtom);
  return (
    <>
      <Text style={[styles.quote, { color: quote.state === 'hasData' ? t.text : t.muted }]}>
        {quote.state === 'loading' && 'Loading…'}
        {quote.state === 'hasError' && 'Something went wrong'}
        {quote.state === 'hasData' && `“${quote.data}”`}
      </Text>
      <Button label="Refresh" onPress={() => refresh()} />
    </>
  );
}

// ─── 4. Families + scoped Providers ──────────────────────────────────────────
function LikeButton({ id }: { id: string }) {
  const t = useAtomValue(themeAtom);
  const [likes, setLikes] = useAtom(likesFamily(id));
  return (
    <Pressable onPress={() => setLikes((n) => n + 1)} style={[styles.pill, { borderColor: t.line }]}>
      <Text style={{ color: t.text }}>
        ♥ {id} · {likes}
      </Text>
    </Pressable>
  );
}

function Scoped({ label }: { label: string }) {
  const t = useAtomValue(themeAtom);
  return (
    <View style={styles.scope}>
      <Text style={{ color: t.muted, marginBottom: 6 }}>{label}</Text>
      <View style={styles.row}>
        <LikeButton id="a" />
        <LikeButton id="b" />
      </View>
    </View>
  );
}

// ─── 5. Device ───────────────────────────────────────────────────────────────
function Device() {
  const t = useAtomValue(themeAtom);
  const appState = useAtomValue(appStateAtom);
  const scheme = useAtomValue(colorSchemeAtom);
  return (
    <Text style={{ color: t.text }}>
      {Platform.OS} · AppState: {appState} · scheme: {scheme ?? 'unknown'}
    </Text>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────
function Screen() {
  const t = useAtomValue(themeAtom);
  const scheme = useAtomValue(colorSchemeAtom);
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { color: t.text }]}>expo-atoms</Text>
        <Text style={[styles.lead, { color: t.muted }]}>
          Atomic state in pure TypeScript — running in Expo Go, no native code.
        </Text>

        <Card title="Primitive & derived atoms" subtitle="Only components that read a changed atom re-render.">
          <CounterValue />
          <DerivedValues />
          <CounterControls />
        </Card>

        <Card title="splitAtom + atomWithStorage" subtitle="Each row subscribes to its own item atom.">
          <Todos />
        </Card>

        <Card title="Async with loadable" subtitle="No Suspense boundary; stale requests are aborted.">
          <Quote />
        </Card>

        <Card title="atomFamily + Provider scopes" subtitle="Same atoms, independent stores.">
          <Provider>
            <Scoped label="Provider A" />
          </Provider>
          <Provider>
            <Scoped label="Provider B" />
          </Provider>
        </Card>

        <Card title="React Native atoms" subtitle="appStateAtom & colorSchemeAtom">
          <Device />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Screen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5, marginTop: 8 },
  lead: { fontSize: 15, lineHeight: 21, marginBottom: 4 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  cardSubtitle: { fontSize: 13, marginTop: 2 },
  cardBody: { marginTop: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  big: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  button: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  buttonLabel: { color: '#FFFFFF', fontWeight: '700' },
  renders: { fontSize: 11, fontVariant: ['tabular-nums'], marginLeft: 'auto' },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  todoMain: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  todoTitle: { fontSize: 15, flexShrink: 1 },
  strike: { textDecorationLine: 'line-through' },
  input: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  quote: { fontSize: 17, fontStyle: 'italic', lineHeight: 24 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  scope: { marginBottom: 4 },
});
