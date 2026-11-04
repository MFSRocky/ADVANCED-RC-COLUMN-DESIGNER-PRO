import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as UI from '../src/ui/components.js';
import { sampleProject } from '../src/storage/default-project.js';
import { designColumn } from '../src/analysis/design-column.js';

const project = sampleProject();
const col = project.columns[0];
const result = designColumn(col.input, { angles: 24 });
const state = { project, column: col, projects: [project], results: new Map([[col.id, result]]), prefs: {}, activeTab: 'column' };

test('all UI renderers produce non-empty HTML without throwing', () => {
  const renderers = [UI.renderProjects, UI.renderColumn, UI.renderLoads, UI.renderAnalysis, UI.renderOptimize, UI.renderDrawings, UI.renderBatch, UI.renderReport, UI.renderValidation, UI.renderSettings, UI.renderHelp];
  for (const fn of renderers) {
    const html = fn(state);
    assert.ok(typeof html === 'string' && html.length > 20, `${fn.name} returned empty`);
    assert.ok(!html.includes('undefined</'), `${fn.name} leaked undefined`);
  }
});

test('navigation renders all tabs', () => {
  const nav = UI.renderNav('column');
  for (const [id] of UI.NAV) assert.ok(nav.includes(`data-tab="${id}"`), `missing tab ${id}`);
});

test('drawings and schedule render for a designed column', () => {
  const html = UI.renderDrawings(state);
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('Reinforcement schedule'));
});
