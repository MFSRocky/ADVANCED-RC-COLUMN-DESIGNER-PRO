/** UI renderers. Pure HTML strings; event handling lives in app.js. */
import { crossSectionSVG } from '../drawings/cross-section.js';
import { elevationSVG } from '../drawings/elevation.js';
import { scheduleHTML } from '../drawings/reinforcement.js';
import { BAR_SIZES as ACI_BARS, TIE_SIZES } from '../codes/aci318-25/materials.js';
import { BAR_SIZES as BS_BARS, LINK_SIZES } from '../codes/bs8110-1997/materials.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const icon = n => `<img src="assets/icons/${n}.svg" class="icon" alt="">`;
const status = s => `<span class="status ${s}">${s}</span>`;
const num = (v, d = 0) => v == null || !Number.isFinite(v) ? '—' : Number(v).toFixed(d);

function field(label, path, value, { type = 'number', step = 'any', options, min, max, suffix } = {}) {
  if (options) {
    return `<label>${esc(label)}<select data-path="${path}">${options.map(o => { const [v, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
  }
  return `<label>${esc(label)}<input type="${type}" data-path="${path}" value="${esc(value ?? '')}" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}>${suffix ? `<span class="small muted">${suffix}</span>` : ''}</label>`;
}

export const NAV = [
  ['projects', 'folder', 'Projects'], ['column', 'box', 'Column'], ['loads', 'layers', 'Loads'],
  ['analysis', 'activity', 'Analysis'], ['optimize', 'zap', 'Optimize'], ['drawings', 'pen-tool', 'Drawings'],
  ['batch', 'grid', 'Batch'], ['report', 'file-text', 'Report'], ['validation', 'shield-check', 'Validation'],
  ['settings', 'settings', 'Settings'], ['help', 'help-circle', 'Help'],
];

export function renderNav(active) {
  return NAV.map(([id, ic, label]) => `<button data-tab="${id}" class="${id === active ? 'active' : ''}">${icon(ic)} ${label}</button>`).join('');
}

export function renderProjects(state) {
  const list = state.projects ?? [];
  return `<div class="card"><div class="flex between wrap"><h2>Projects</h2><div class="flex wrap">
    <button class="btn primary" data-action="new-project">${icon('plus')} New</button>
    <button class="btn" data-action="load-sample">${icon('star')} Sample</button>
    <button class="btn" data-action="import-project">${icon('upload')} Import JSON</button>
    <button class="btn" data-action="export-project">${icon('download')} Export JSON</button>
  </div></div>
  ${list.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Code</th><th>Columns</th><th>Updated</th><th></th></tr></thead><tbody>
    ${list.map(p => `<tr><td><strong>${esc(p.name)}</strong>${p.id === state.project?.id ? ' <span class="status INFO">open</span>' : ''}</td><td>${esc(p.code)}</td><td>${p.columns?.length ?? 0}</td><td class="small muted">${esc(p.updatedAt?.slice(0, 16).replace('T', ' '))}</td>
    <td class="flex"><button class="btn" data-action="open-project" data-id="${p.id}">Open</button><button class="btn" data-action="duplicate-project" data-id="${p.id}">Duplicate</button><button class="btn danger" data-action="delete-project" data-id="${p.id}">Delete</button></td></tr>`).join('')}
  </tbody></table></div>` : `<div class="empty">No saved projects yet. Create a new project or load the sample.</div>`}
  </div>
  <div class="card"><h3>Recovery</h3><p class="muted small">Autosave writes to IndexedDB and a LocalStorage backup after every change. If the app was closed unexpectedly, the last backup can be restored from Settings.</p></div>`;
}

export function renderColumn(state) {
  const col = state.column; if (!col) return '<div class="empty">No column selected.</div>';
  const i = col.input, g = i.geometry, isBS = i.code?.startsWith('BS');
  const bars = isBS ? BS_BARS : ACI_BARS;
  const ties = isBS ? LINK_SIZES : TIE_SIZES;
  const result = state.results?.get(col.id);
  const preview = result ? crossSectionSVG(result, { width: 420, height: 420 }) : '';
  return `<div class="grid cols-2">
    <div>
      <div class="card"><h2>Geometry</h2><div class="grid cols-2">
        ${field('Shape', 'geometry.shape', g.shape, { options: [['rect', 'Rectangular / Square'], ['circle', 'Circular']] })}
        ${field('Clear cover to ties (mm)', 'cover', i.cover)}
        ${g.shape === 'circle' ? field('Diameter D (mm)', 'geometry.D', g.D) : `${field('Width b (mm)', 'geometry.b', g.b)}${field('Depth h (mm)', 'geometry.h', g.h)}`}
        ${field('Exposure', 'exposure', i.exposure, { options: isBS ? ['mild', 'moderate', 'severe', 'very severe'] : ['interior', 'exterior', 'earth'] })}
        ${field('Aggregate size (mm)', 'aggregateSize', i.aggregateSize ?? 20)}
      </div></div>
      <div class="card"><h2>Materials</h2><div class="grid cols-2">
        ${isBS ? field('fcu (MPa)', 'concrete.fcu', i.concrete?.fcu) : field("f'c (MPa)", 'concrete.fc', i.concrete?.fc)}
        ${field('fy longitudinal (MPa)', 'steel.fy', i.steel?.fy, { options: isBS ? [250, 460] : [280, 350, 420, 500, 550] })}
        ${field('fyv ties/links (MPa)', 'tieSteel.fy', i.tieSteel?.fy, { options: isBS ? [250, 460] : [280, 350, 420, 500] })}
      </div></div>
      <div class="card"><h2>Reinforcement</h2><div class="grid cols-2">
        ${field('Bar diameter (mm)', 'arrangement.barDb', i.arrangement?.barDb, { options: bars })}
        ${g.shape === 'circle' ? field('Number of bars', 'arrangement.n', i.arrangement?.n ?? 8, { min: 6 }) : `${field('Bars along b (nx)', 'arrangement.nx', i.arrangement?.nx ?? 3, { min: 2 })}${field('Bars along h (ny)', 'arrangement.ny', i.arrangement?.ny ?? 3, { min: 2 })}`}
        ${field('Transverse type', 'transverse.type', i.transverse?.type ?? 'ties', { options: isBS ? ['links'] : g.shape === 'circle' ? ['ties', 'spiral'] : ['ties'] })}
        ${field('Tie/link Ø (mm)', 'transverse.db', i.transverse?.db, { options: ties })}
        ${field('Spacing (mm)', 'transverse.spacing', i.transverse?.spacing)}
        <label class="flex"><input type="checkbox" data-path="transverse.crossTies" ${i.transverse?.crossTies !== false ? 'checked' : ''}> Cross-ties</label>
      </div></div>
      <div class="card"><h2>Height & End Conditions</h2><div class="grid cols-2">
        ${field('Clear height lo (mm)', 'height.clear', i.height?.clear ?? 3000)}
        <label class="flex"><input type="checkbox" data-path="height.braced" ${i.height?.braced !== false ? 'checked' : ''}> Braced (non-sway)</label>
        ${isBS ? `${field('Top end condition X', 'height.endTopX', i.height?.endTopX ?? '1', { options: [['1', '1 — fully restrained'], ['2', '2 — partially'], ['3', '3 — nominally']] })}${field('Bottom end condition X', 'height.endBottomX', i.height?.endBottomX ?? '1', { options: ['1', '2', '3'] })}${field('lex override (mm)', 'height.lex', i.height?.lex ?? '')}${field('ley override (mm)', 'height.ley', i.height?.ley ?? '')}` : `${field('kx', 'height.kx', i.height?.kx ?? 1)}${field('ky', 'height.ky', i.height?.ky ?? 1)}`}
      </div></div>
    </div>
    <div>
      <div class="card"><div class="flex between"><h2>Section Preview</h2>${result ? status(result.status) : ''}</div><div class="preview-box">${preview || '<span class="muted">Run Design to preview</span>'}</div>
      ${result ? `<div class="grid cols-3" style="margin-top:12px"><div class="kpi"><span class="value">${num(result.summary.As)}</span><span class="label">As (mm²)</span></div><div class="kpi"><span class="value">${num(result.summary.rho * 100, 2)}%</span><span class="label">ρ</span></div><div class="kpi"><span class="value">${num(result.summary.utilization, 3)}</span><span class="label">Utilization</span></div></div>` : ''}
      </div>
      <div class="card"><h3>Column identity</h3><div class="grid cols-2">
        <label>Mark<input type="text" data-col-field="mark" value="${esc(col.mark)}"></label>
        <label>Floor<input type="text" data-col-field="floor" value="${esc(col.floor)}"></label>
        <label>Grid<input type="text" data-col-field="grid" value="${esc(col.grid)}"></label>
        <label>Zone<input type="text" data-col-field="zone" value="${esc(col.zone)}"></label>
      </div><div class="flex" style="margin-top:12px"><button class="btn" data-action="add-column">${icon('plus')} Add column</button><button class="btn danger" data-action="delete-column">${icon('trash-2')} Delete column</button></div></div>
    </div>
  </div>`;
}

export function renderLoads(state) {
  const col = state.column; if (!col) return '';
  const i = col.input;
  const loads = i.loads ?? [];
  const combos = state.project.combinations ?? [];
  const svc = i.serviceLoads ?? { D: {}, L: {}, W: {}, E: {} };
  const svcRow = (k) => `<tr><td><strong>${k}</strong></td>${['Pu', 'Mx', 'My', 'Vx', 'Vy'].map(f => `<td><input type="number" data-service="${k}" data-service-field="${f}" value="${esc(svc[k]?.[f] ?? 0)}" style="width:100%"></td>`).join('')}</tr>`;
  return `<div class="card"><div class="flex between wrap"><h2>Factored Load Combinations</h2><div class="flex"><button class="btn" data-action="add-load">${icon('plus')} Add load</button><button class="btn primary" data-action="generate-loads">${icon('calculator')} Generate from service loads</button></div></div>
  <p class="muted small">Enter factored loads directly (Pu in kN, M in kN·m, V in kN) or use service loads + code combinations below. ACI combinations follow ASCE 7 as referenced by ACI §5.3; BS combinations follow Table 2.1.</p>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Pu (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Vx (kN)</th><th>Vy (kN)</th><th>M1x</th><th>M2x</th><th>M1y</th><th>M2y</th><th>βdns</th><th></th></tr></thead><tbody>
  ${loads.map((l, idx) => `<tr>
    <td><input type="text" data-load="${idx}" data-load-field="name" value="${esc(l.name)}" style="width:120px"></td>
    ${['Pu', 'Mx', 'My', 'Vx', 'Vy', 'M1x', 'M2x', 'M1y', 'M2y'].map(f => `<td><input type="number" data-load="${idx}" data-load-field="${f}" value="${esc((l[f] ?? 0) / (f.startsWith('M') ? 1e6 : 1000))}" style="width:80px"></td>`).join('')}
    <td><input type="number" data-load="${idx}" data-load-field="betaDns" value="${esc(l.betaDns ?? 0.6)}" step="0.05" style="width:60px"></td>
    <td><button class="btn danger" data-action="remove-load" data-index="${idx}">${icon('x')}</button></td></tr>`).join('')}
  </tbody></table></div></div>
  <div class="card"><h2>Service Loads (unfactored)</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Case</th><th>Pu (kN)</th><th>Mx (kN·m)</th><th>My (kN·m)</th><th>Vx (kN)</th><th>Vy (kN)</th></tr></thead><tbody>${['D', 'L', 'W', 'E'].map(svcRow).join('')}</tbody></table></div></div>
  <div class="card"><h2>Combination Factors</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>D</th><th>L</th><th>W</th><th>E</th><th>Clause</th></tr></thead><tbody>
  ${combos.map((c, idx) => `<tr><td><input type="text" data-combo="${idx}" data-combo-field="name" value="${esc(c.name)}" style="width:160px"></td>${['D', 'L', 'W', 'E'].map(f => `<td><input type="number" step="0.1" data-combo="${idx}" data-combo-field="factors.${f}" value="${esc(c.factors?.[f] ?? 0)}" style="width:60px"></td>`).join('')}<td class="small muted">${esc(c.clause)}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

export function renderAnalysis(state) {
  const col = state.column; const r = state.results?.get(col?.id);
  if (!r) return `<div class="card"><div class="empty">${icon('activity')}<p>Run Design to verify capacity, slenderness and detailing.</p><button class="btn primary" data-action="run-design">Run Design</button></div></div>`;
  const checks = r.checks ?? [];
  const fails = checks.filter(c => c.status === 'FAIL');
  return `<div class="grid cols-4">
    <div class="card kpi"><span class="value">${status(r.status)}</span><span class="label">Overall status</span></div>
    <div class="card kpi"><span class="value">${num(r.summary.utilization, 3)}</span><span class="label">Governing utilization</span></div>
    <div class="card kpi"><span class="value">${num(r.summary.As)}</span><span class="label">As provided (mm²)</span></div>
    <div class="card kpi"><span class="value">${r.requiredAs ? num(r.requiredAs) : '—'}</span><span class="label">Required As (mm²)</span></div>
  </div>
  ${r.unsupported?.length ? `<div class="card" style="border-color:var(--fail)"><h3>Unsupported provisions — PASS blocked</h3><ul>${r.unsupported.map(u => `<li>${esc(u)}</li>`).join('')}</ul></div>` : ''}
  <div class="grid cols-2">
    <div class="card"><h3>Uniaxial interaction — X axis</h3><canvas class="chart" id="chartX"></canvas></div>
    <div class="card"><h3>Biaxial contour at governing Pu</h3><canvas class="chart" id="chartBiax"></canvas></div>
  </div>
  <div class="card"><h3>Checks (${checks.length})</h3><div class="check-list">
    ${checks.map(c => `<div class="check-item"><div class="head"><strong>${esc(c.name)}</strong>${status(c.status)}</div><div class="msg">${esc(c.message)} <span class="mono">[${esc(c.clause)}]</span>${c.load ? ` · ${esc(c.load)}` : ''}</div></div>`).join('')}
  </div></div>
  <div class="card"><h3>Calculation steps</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Load</th><th>Step</th><th>Equation</th><th>Substitution</th><th>Value</th><th>Clause</th></tr></thead><tbody>
  ${(r.steps ?? []).map(s => `<tr><td>${esc(s.load ?? '')}</td><td>${esc(s.label)}</td><td class="mono small">${esc(s.equation)}</td><td class="mono small">${esc(s.substitution)}</td><td class="mono">${num(s.value, 4)} ${esc(s.unit)}</td><td class="small">${esc(s.clause)}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

export function renderOptimize(state) {
  const opt = state.optResult;
  return `<div class="card"><div class="flex between wrap"><h2>Reinforcement Optimization</h2><button class="btn primary" data-action="run-optimize">${icon('zap')} Optimize</button></div>
  <div class="form-row">
    <label>Objective<select id="optObjective"><option value="steel">Minimum steel area</option><option value="cost">Minimum cost</option><option value="congestion">Minimum congestion</option><option value="balanced">Balanced</option></select></label>
    <label>Steel price (per kg)<input type="number" id="optPrice" value="1.2" step="0.1"></label>
    <label>Max bars<input type="number" id="optMaxBars" value="24"></label>
  </div>
  <p class="muted small">The optimizer enumerates practical symmetric bar layouts, runs the full code engine on every candidate, and ranks only feasible solutions. It does not assume an optimal result without evaluating the search space.</p>
  <div id="optProgress"></div></div>
  ${opt ? `<div class="card"><h3>Search space</h3><p>Evaluated <strong>${opt.searchSpace.evaluated}</strong> of ${opt.searchSpace.total} candidates · <strong>${opt.searchSpace.feasible}</strong> feasible · objective: ${esc(opt.objective)}</p>
  ${opt.alternatives.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>#</th><th>Bars</th><th>As (mm²)</th><th>ρ</th><th>Utilization</th><th>Weight (kg)</th><th>Status</th><th></th></tr></thead><tbody>
  ${opt.alternatives.map((a, idx) => `<tr><td>${idx + 1}</td><td>${a.barCount}–Ø${a.barDb}</td><td class="mono">${num(a.As)}</td><td>${num(a.rho * 100, 2)}%</td><td>${num(a.utilization, 3)}</td><td>${num(a.metrics.totalWeight, 1)}</td><td>${status(a.status)}</td><td><button class="btn" data-action="apply-alternative" data-index="${idx}">Apply</button></td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty">No feasible candidate found. Increase the section or revise loads.</div>'}
  </div>` : ''}`;
}

export function renderDrawings(state) {
  const col = state.column; const r = state.results?.get(col?.id);
  if (!r) return `<div class="card"><div class="empty">Run Design to generate drawings.</div></div>`;
  return `<div class="flex wrap" style="margin-bottom:14px">
    <button class="btn" data-action="export-svg" data-kind="cross">${icon('download')} Cross-section SVG</button>
    <button class="btn" data-action="export-svg" data-kind="elev">${icon('download')} Elevation SVG</button>
    <button class="btn" data-action="export-png" data-kind="cross">${icon('image')} Cross-section PNG</button>
    <button class="btn" data-action="export-dxf">${icon('file')} DXF</button>
    <button class="btn" data-action="export-schedule">${icon('table')} Schedule CSV</button>
  </div>
  <div class="grid cols-2">
    <div class="card"><h3>Cross-section</h3><div class="preview-box">${crossSectionSVG(r)}</div></div>
    <div class="card"><h3>Elevation</h3><div class="preview-box">${elevationSVG(r)}</div></div>
  </div>
  <div class="card"><h3>Reinforcement schedule</h3>${scheduleHTML(r)}</div>`;
}

export function renderBatch(state) {
  const cols = state.project?.columns ?? [];
  const b = state.batchResult;
  return `<div class="card"><div class="flex between wrap"><h2>Batch Columns</h2><div class="flex wrap">
    <button class="btn" data-action="add-column">${icon('plus')} Add</button>
    <button class="btn" data-action="import-csv">${icon('upload')} Import CSV</button>
    <button class="btn" data-action="export-csv">${icon('download')} Export CSV</button>
    <button class="btn primary" data-action="run-batch">${icon('play')} Design all</button>
  </div></div>
  <div class="table-wrap"><table class="data-table"><thead><tr><th>Mark</th><th>Floor</th><th>Grid</th><th>Code</th><th>Section</th><th>Status</th><th></th></tr></thead><tbody>
  ${cols.map(c => { const res = state.results?.get(c.id); const g = c.input.geometry; return `<tr><td><strong>${esc(c.mark)}</strong></td><td>${esc(c.floor)}</td><td>${esc(c.grid)}</td><td>${esc(c.input.code)}</td><td>${g.shape === 'circle' ? `Ø${g.D}` : `${g.b}×${g.h}`}</td><td>${res ? status(res.status) : '<span class="muted">—</span>'}</td><td><button class="btn" data-action="select-column" data-id="${c.id}">Edit</button></td></tr>`; }).join('')}
  </tbody></table></div></div>
  ${b ? `<div class="grid cols-4">
    <div class="card kpi"><span class="value">${b.summary.total}</span><span class="label">Columns</span></div>
    <div class="card kpi"><span class="value" style="color:var(--pass)">${b.summary.passing}</span><span class="label">Passing</span></div>
    <div class="card kpi"><span class="value" style="color:var(--fail)">${b.summary.failing}</span><span class="label">Failing</span></div>
    <div class="card kpi"><span class="value">${num(b.summary.totalSteelKg, 1)}</span><span class="label">Total steel (kg)</span></div>
  </div><div class="card"><h3>Batch results</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Mark</th><th>Status</th><th>As</th><th>ρ</th><th>Utilization</th><th>Governing load</th></tr></thead><tbody>
  ${b.results.map(r => `<tr><td>${esc(r.mark)}</td><td>${status(r.status)}</td><td>${num(r.result?.summary.As)}</td><td>${r.result ? num(r.result.summary.rho * 100, 2) + '%' : '—'}</td><td>${num(r.result?.summary.utilization, 3)}</td><td>${esc(r.result?.summary.governingLoad ?? r.error ?? '')}</td></tr>`).join('')}
  </tbody></table></div></div>` : ''}`;
}

export function renderReport(state) {
  const col = state.column; const r = state.results?.get(col?.id);
  return `<div class="card"><div class="flex between wrap"><h2>Calculation Report</h2><div class="flex">
    <button class="btn primary" data-action="export-pdf" ${r ? '' : 'disabled'}>${icon('file-text')} PDF report</button>
    <button class="btn" data-action="export-report-csv" ${r ? '' : 'disabled'}>${icon('download')} Checks CSV</button>
  </div></div>
  ${r ? `<p>Column <strong>${esc(col.mark)}</strong> · ${esc(r.codeLabel)} · ${status(r.status)} · utilization ${num(r.summary.utilization, 3)}</p>
  <p class="muted small">The PDF includes design basis, geometry/materials, loads, slenderness steps, capacity checks, reinforcement schedule, drawings and limitations. It is generated locally with jsPDF — no network required.</p>` : '<div class="empty">Run Design first.</div>'}
  </div>`;
}

export function renderValidation(state) {
  const v = state.validation;
  return `<div class="card"><div class="flex between"><h2>Engineering Validation</h2><button class="btn primary" data-action="run-validation">${icon('shield-check')} Run benchmarks</button></div>
  <p class="muted small">Regression benchmarks verify axial caps, strain-compatibility equilibrium, geometry, units, solvers, slenderness tables, biaxial β, DXF integrity and optimization feasibility. The same suite runs in Node via <code>npm test</code>.</p>
  ${v ? `<p><strong>${v.passed}/${v.total}</strong> passed ${v.allPassed ? status('PASS') : status('FAIL')}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>Benchmark</th><th>Result</th><th>Details</th></tr></thead><tbody>
  ${v.cases.map(c => `<tr><td>${esc(c.name)}</td><td>${c.passed ? status('PASS') : status('FAIL')}</td><td class="mono small">${esc(c.details)}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="empty">Run the benchmark suite.</div>'}
  </div>`;
}

export function renderSettings(state) {
  const prefs = state.prefs ?? {};
  return `<div class="card"><h2>Preferences</h2><div class="grid cols-2">
    <label>Theme<select data-pref="theme"><option value="system" ${prefs.theme === 'system' ? 'selected' : ''}>System</option><option value="light" ${prefs.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
    <label>Default code<select data-pref="defaultCode"><option value="ACI318-25" ${prefs.defaultCode !== 'BS8110-1997' ? 'selected' : ''}>ACI 318-25</option><option value="BS8110-1997" ${prefs.defaultCode === 'BS8110-1997' ? 'selected' : ''}>BS 8110-1:1997</option></select></label>
  </div></div>
  <div class="card"><h2>Storage & Recovery</h2><div class="flex wrap">
    <button class="btn" data-action="restore-backup">${icon('rotate-ccw')} Restore last backup</button>
    <button class="btn danger" data-action="clear-storage">${icon('trash-2')} Clear all local data</button>
  </div><p class="muted small" style="margin-top:10px">Projects are stored in IndexedDB. Preferences and a recovery backup use LocalStorage. All data stays on this device.</p></div>
  <div class="card"><h2>About</h2><p class="muted small">RC Column Designer Pro · offline-first · ACI 318-25 and BS 8110-1:1997 engines are independently implemented. Unsupported provisions block PASS. Verify all results against the licensed code text.</p></div>`;
}

export function renderHelp() {
  return `<div class="card"><h2>User Guide</h2>
  <ol><li>Create or open a project, then edit the column geometry, materials and reinforcement.</li><li>Enter factored loads directly or generate them from service loads and code combinations.</li><li>Run Design. Review PASS/FAIL/WARNING checks, slenderness steps and interaction diagrams.</li><li>Optimize to search feasible bar layouts; apply an alternative to update the column.</li><li>Export drawings (SVG/PNG/DXF), schedules, batch CSV and the PDF calculation report.</li><li>Run Validation to execute the engineering regression suite in the browser.</li></ol>
  <h3>Scope & limitations</h3><ul class="muted small"><li>Seismic, torsion, prestress, anchorage and splice design are not implemented and block PASS when triggered.</li><li>BS unbraced effective heights use a conservative k=2.2 unless rigorous lex/ley are supplied.</li><li>ACI sway magnification requires story data (Q or ΣPu/ΣPc); otherwise the check fails rather than approximating.</li><li>Optimization ranks only evaluated feasible candidates; it is not a code-compliance certificate.</li></ul>
  <p class="small">See <code>docs/user-guide.md</code> and <code>docs/engineering-basis.md</code> in the repository for the full engineering basis and clause references.</p></div>`;
}
