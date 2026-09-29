#!/usr/bin/env node
/**
 * Smoke-tests the published `build/` output for both module formats. Nothing
 * else exercises this: the example app resolves `expo-atoms` straight to
 * `src/` for hot-reload (see example/metro.config.js), so a broken `exports`
 * map or a stale/mis-extensioned bundle would otherwise ship undetected.
 *
 * The `./vanilla` entry (no react-native import) is fully executed under
 * plain Node for both formats — real coverage of the bundled store/atom
 * engine. The main `.` entry re-exports react-native APIs (`native/index.ts`),
 * and react-native's own entry point uses Flow syntax that only Metro's
 * transformer strips — it cannot run under plain Node at all, with or
 * without expo-atoms in the picture (jest-expo's `native.test.ts` already
 * exercises those atoms under a proper RN test environment). So the main
 * entry is checked for syntax validity and export shape only.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function checkVanillaRoundtrip(label, mod) {
  assert.strictEqual(typeof mod.atom, 'function', `${label}: atom export`);
  assert.strictEqual(typeof mod.createStore, 'function', `${label}: createStore export`);
  const store = mod.createStore();
  const a = mod.atom(1);
  assert.strictEqual(store.get(a), 1, `${label}: initial value`);
  store.set(a, 2);
  assert.strictEqual(store.get(a), 2, `${label}: set/get roundtrip`);
}

function checkSyntax(label, file) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  console.log(`ok - ${label}: syntax valid`);
}

function checkExportsPresent(label, file, format) {
  const text = fs.readFileSync(file, 'utf8');
  const expected = ['atom', 'createStore', 'appStateAtom', 'colorSchemeAtom', 'useAtom'];
  const pattern =
    format === 'cjs'
      ? (name) => new RegExp(`exports\\.${name}\\s*=`).test(text)
      : (name) => new RegExp(`\\b${name}\\b`).test(text.slice(text.lastIndexOf('export')));
  for (const name of expected) {
    assert.ok(pattern(name), `${label}: missing expected export "${name}"`);
  }
  console.log(`ok - ${label}: expected exports present`);
}

async function main() {
  const cjsVanilla = require(path.join(process.cwd(), 'build/cjs/vanilla.js'));
  await checkVanillaRoundtrip('cjs/vanilla (require)', cjsVanilla);
  console.log('ok - cjs/vanilla (require): functional roundtrip');

  const esmVanilla = await import(
    'file://' + path.join(process.cwd(), 'build/esm/vanilla.js')
  );
  await checkVanillaRoundtrip('esm/vanilla (import)', esmVanilla);
  console.log('ok - esm/vanilla (import): functional roundtrip');

  checkSyntax('cjs/index', path.join(process.cwd(), 'build/cjs/index.js'));
  checkSyntax('esm/index', path.join(process.cwd(), 'build/esm/index.js'));
  checkExportsPresent('cjs/index', path.join(process.cwd(), 'build/cjs/index.js'), 'cjs');
  checkExportsPresent('esm/index', path.join(process.cwd(), 'build/esm/index.js'), 'esm');

  const cjsPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'build/cjs/package.json'), 'utf8'));
  const esmPkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'build/esm/package.json'), 'utf8'));
  assert.strictEqual(cjsPkg.type, 'commonjs', 'build/cjs/package.json type');
  assert.strictEqual(esmPkg.type, 'module', 'build/esm/package.json type');
  console.log('ok - nested package.json type markers correct');

  console.log('\nverify-build passed.');
}

main().catch((error) => {
  console.error('verify-build failed:', error);
  process.exit(1);
});
