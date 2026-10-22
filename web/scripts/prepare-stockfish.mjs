// Copies the lite single-threaded Stockfish build (≈1.8MB) into public/stockfish/ so Vite serves
// it as a Web Worker for live, in-browser analysis. Single-threaded needs no COOP/COEP headers.
// Runs on install, dev and build. Server-side analysis uses the native engine service (engine/).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = 'stockfish-19-lite-single';
const require = createRequire(import.meta.url);
const binDir = join(dirname(require.resolve('stockfish/package.json')), 'bin');
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'stockfish');

mkdirSync(publicDir, { recursive: true });
for (const ext of ['.js', '.wasm']) {
  copyFileSync(join(binDir, ENGINE + ext), join(publicDir, ENGINE + ext));
}
