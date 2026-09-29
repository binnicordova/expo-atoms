import { defineConfig } from 'tsup';

const entry = { index: 'src/index.ts', vanilla: 'src/vanilla.ts' };

const shared = {
  entry,
  splitting: false,
  sourcemap: true,
  dts: false,
  clean: false,
  target: 'es2020' as const,
  treeshake: true,
  external: [/^react($|\/)/, /^react-native($|\/)/, /^expo($|\/)/],
  // Force plain `.js` for both formats (never `.mjs`) — a nested
  // `package.json` `{"type": ...}` per outDir disambiguates them instead.
  // Metro doesn't resolve `.mjs`, and a package whose `exports` map points
  // at one crashes Hermes on raw `import`/`export` syntax it never
  // transforms — the exact bug class this build currently avoids.
  outExtension: () => ({ js: '.js' }),
};

// Declarations are emitted separately by `tsc --emitDeclarationOnly` (see
// internal/module_scripts/buildLib.js) — this codebase's overload-heavy,
// `unique symbol`-using types are already correctly handled by `tsc`.
export default defineConfig([
  { ...shared, format: ['cjs'], outDir: 'build/cjs' },
  { ...shared, format: ['esm'], outDir: 'build/esm' },
]);
