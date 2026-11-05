import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('vercel.json builds and serves the static dist artifact', () => {
  const cfg = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.equal(cfg.outputDirectory, 'dist');
  assert.equal(cfg.buildCommand, 'npm run build');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(pkg.scripts.build.includes('build-static'));
});

test('static build copies all runtime modules/assets and excludes dev/test files', () => {
  execFileSync(process.execPath, ['scripts/build-static.mjs'], { stdio: 'pipe' });
  for (const f of [
    'dist/index.html', 'dist/manifest.webmanifest', 'dist/sw.js',
    'dist/src/ui/app.js', 'dist/src/ui/styles.css', 'dist/src/ui/components.js',
    'dist/src/analysis/design-column.js', 'dist/assets/icons/app-icon.svg',
    'dist/vendor/jspdf.umd.min.js',
  ]) assert.ok(existsSync(f), `missing ${f}`);
  for (const f of ['dist/node_modules', 'dist/tests', 'dist/test-results', 'dist/scripts', 'dist/package.json']) {
    assert.ok(!existsSync(f), `should not ship ${f}`);
  }
  const html = readFileSync('dist/index.html', 'utf8');
  assert.ok(html.includes('./src/ui/app.js'));
  assert.ok(html.includes('./src/ui/styles.css'));
});
