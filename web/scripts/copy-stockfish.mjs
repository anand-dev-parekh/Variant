// Copies the browser engine (lite, single-threaded) from node_modules into public/,
// so Vite serves it as a static Web Worker. Single-threaded needs no COOP/COEP headers.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('stockfish/package.json'));
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stockfish');

mkdirSync(outDir, { recursive: true });
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(join(pkgDir, 'bin', file), join(outDir, file));
}
