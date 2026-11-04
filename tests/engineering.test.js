import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmarks } from '../src/validation/benchmarks.js';
import { designColumn } from '../src/analysis/design-column.js';
import { convert, UnitError } from '../src/core/unit-converter.js';
import { ValidationError, UnsupportedError } from '../src/core/validation.js';
import { normalizeSection, generatePerimeterBars } from '../src/core/geometry.js';
import { parseCSV, csvToColumns, columnsToCSV } from '../src/storage/import-export.js';
import { validateDXF, columnDXF } from '../src/drawings/dxf-export.js';
import { optimize } from '../src/codes/aci318-25/optimization.js';

test('engineering benchmark suite', async () => {
  const r = await runBenchmarks();
  for (const c of r.cases) assert.ok(c.passed, `${c.name}: ${c.details}`);
  assert.equal(r.allPassed, true);
});

test('unit conversion rejects unknown units', () => {
  assert.throws(() => convert(1, 'kip', 'N', 'force'), UnitError);
  assert.equal(convert(1, 'MPa', 'N/mm²', 'stress'), 1);
});

test('validation rejects invalid geometry', () => {
  assert.throws(() => normalizeSection({ shape: 'rect', b: -1, h: 600, cover: 40, tieDb: 10, arrangement: { barDb: 20, nx: 2, ny: 2 } }), ValidationError);
});

test('BS unsupported steel grade blocks design', () => {
  assert.throws(() => designColumn({
    code: 'BS8110-1997', geometry: { shape: 'rect', b: 400, h: 500 }, cover: 30,
    concrete: { fcu: 30 }, steel: { fy: 500 }, arrangement: { barDb: 20, nx: 2, ny: 2 },
    loads: [{ Pu: 1000e3 }],
  }), UnsupportedError);
});

test('ACI torsion blocks PASS', () => {
  const r = designColumn({
    code: 'ACI318-25', geometry: { shape: 'rect', b: 400, h: 600 }, cover: 40,
    concrete: { fc: 30 }, steel: { fy: 420 }, tieSteel: { fy: 420 },
    arrangement: { barDb: 25, nx: 3, ny: 4 }, transverse: { type: 'ties', db: 10, spacing: 150 },
    height: { clear: 3000, braced: true, kx: 1, ky: 1 },
    loads: [{ Pu: 1000e3, T: 10e6 }],
  }, { angles: 24 });
  assert.equal(r.status, 'FAIL');
  assert.ok(r.unsupported.some(u => /torsion/i.test(u)));
});

test('CSV round-trip preserves columns', () => {
  const project = { code: 'ACI318-25', columns: [{ id: '1', mark: 'C1', floor: 'G', grid: 'A/1', input: { code: 'ACI318-25', geometry: { shape: 'rect', b: 400, h: 600 }, cover: 40, concrete: { fc: 30 }, steel: { fy: 420 }, arrangement: { barDb: 20, nx: 3, ny: 3 }, loads: [{ Pu: 1000e3, Mx: 50e6 }] } }] };
  const csv = columnsToCSV(project);
  const cols = csvToColumns(csv, 'ACI318-25');
  assert.equal(cols.length, 1);
  assert.equal(cols[0].mark, 'C1');
  assert.equal(cols[0].input.geometry.b, 400);
  assert.equal(cols[0].input.loads[0].Pu, 1000e3);
});

test('DXF export is structurally valid', () => {
  const s = normalizeSection({ shape: 'rect', b: 400, h: 600, cover: 40, tieDb: 10, arrangement: { barDb: 25, nx: 3, ny: 4 } });
  const v = validateDXF(columnDXF({ section: s, transverse: { type: 'ties', db: 10, spacing: 150, crossTies: true }, codeLabel: 'ACI 318-25' }));
  assert.ok(v.valid);
  assert.ok(v.counts.CIRCLE >= s.bars.length);
});

test('optimization returns only feasible evaluated candidates', async () => {
  const opt = await optimize({
    code: 'ACI318-25', geometry: { shape: 'rect', b: 400, h: 600 }, cover: 40,
    concrete: { fc: 30 }, steel: { fy: 420 }, tieSteel: { fy: 420 },
    transverse: { type: 'ties' }, height: { clear: 3500, braced: true, kx: 1, ky: 1 },
    loads: [{ name: 'ULS', Pu: 2500e3, Mx: 150e6, My: 80e6, M1x: 75e6, M2x: 150e6, M1y: 40e6, M2y: 80e6 }],
  }, { barDiameters: [20, 25], maxPerFace: 4, angles: 24, maxAlternatives: 3 });
  assert.ok(opt.searchSpace.evaluated > 0);
  assert.ok(opt.alternatives.length > 0);
  for (const a of opt.alternatives) assert.notEqual(a.status, 'FAIL');
});
