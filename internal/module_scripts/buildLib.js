#!/usr/bin/env node
const { spawnSyncWithAutoShell } = require('./util');
const fs = require('fs');
const path = require('path');

function run(cmd, args) {
  const result = spawnSyncWithAutoShell(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Builds the publishable `build/` output: a dual CJS+ESM bundle (via tsup,
 * so Metro/Node/bundlers each resolve a real `.js` file with a matching
 * nested `package.json` `type`, never a bare `.mjs`), plus `.d.ts` files
 * emitted separately by `tsc` (its overload-heavy declaration output is
 * more reliable than tsup's bundled dts generation for this codebase).
 */
function buildLib() {
  run('tsup', []);
  run('tsc', ['--emitDeclarationOnly']);
  fs.writeFileSync(
    path.join(process.cwd(), 'build/cjs/package.json'),
    JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(process.cwd(), 'build/esm/package.json'),
    JSON.stringify({ type: 'module' }, null, 2) + '\n'
  );
}

module.exports = { buildLib };

if (require.main === module) {
  buildLib();
}
