import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const entries = [
  'assets', 'media', 'prompt', 'shared',
  'gate.js', 'hero-options.js', 'index.html', 'light-options.js',
  'publish.css', 'scene.js', 'staging.js', 'theme.css',
];

await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(join(root, entry), join(output, entry), { recursive: true });
}
console.log('Casa Serra static site is ready in dist/.');
