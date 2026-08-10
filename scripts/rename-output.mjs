// vite-plugin-singlefile emette dist/<nome-input>.html; il §4/§5 della spec richiede
// esplicitamente dist/fantasta.html come unico artefatto autoconsistente.
import { renameSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(root, 'dist', 'index.html');
const to = join(root, 'dist', 'fantasta.html');

if (existsSync(from)) {
  renameSync(from, to);
  console.log(`dist/index.html -> dist/fantasta.html`);
} else if (!existsSync(to)) {
  throw new Error(`build output non trovato: ${from}`);
}
