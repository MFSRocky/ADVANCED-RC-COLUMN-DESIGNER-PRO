import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designColumn } from '../src/analysis/design-column.js';
import * as store from '../src/storage/project-manager.js';
import { createDefaultProject } from '../src/storage/default-project.js';
import { newId } from '../src/core/id.js';

test('index.html ships critical CSS, boot watchdog and loading placeholder', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="critical-css"'));
  assert.ok(html.includes('.app-shell{display:flex'));
  assert.ok(html.includes('__RCDP_BOOTED'));
  assert.ok(html.includes('id="bootError"'));
  assert.ok(html.includes('Loading workspace…'));
  assert.ok(html.includes('noscript'));
});

test('service worker cache is versioned and navigation is network-first', () => {
  const sw = readFileSync('sw.js', 'utf8');
  assert.match(sw, /rcdp-v\d+/);
  assert.ok(sw.includes("req.mode === 'navigate'"));
});

test('storage falls back without IndexedDB/localStorage and never blocks boot', async () => {
  const p = createDefaultProject();
  const saved = await store.saveProject(p);
  assert.equal(saved.id, p.id);
  const list = await store.listProjects();
  assert.ok(list.some(x => x.id === p.id));
  const got = await store.getProject(p.id);
  assert.equal(got.name, p.name);
  await store.deleteProject(p.id);
  const status = store.getStorageStatus();
  assert.ok(['indexeddb', 'local'].includes(status.mode));
});

test('safe id generation works without crypto.randomUUID', () => {
  const id = newId();
  assert.ok(typeof id === 'string' && id.length > 8);
});

test('required steel estimate is produced for a feasible default column', () => {
  const p = createDefaultProject();
  const r = designColumn(p.columns[0].input, { angles: 24 });
  assert.equal(r.status, 'PASS');
  assert.ok(r.requiredAs != null && r.requiredAs > 0, `requiredAs=${r.requiredAs}`);
  assert.ok(r.requiredAs <= r.section.As * 1.001);
});
