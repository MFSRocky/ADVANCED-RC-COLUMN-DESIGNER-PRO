/** Build a self-contained static deployment artifact in dist/ for Vercel/Netlify/GitHub Pages. */
import { cp, mkdir, rm, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const out = join(root, 'dist');
const files = ['index.html', 'manifest.webmanifest', 'sw.js'];
const dirs = ['src', 'assets', 'vendor'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const f of files) await cp(join(root, f), join(out, f));
for (const d of dirs) await cp(join(root, d), join(out, d), { recursive: true });

async function count(dir) {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += await count(join(dir, e.name));
    else n++;
  }
  return n;
}
console.log(`Static build complete: dist/ (${await count(out)} files)`);
