/** RC Column Designer Pro — application shell, state, routing and actions. */
import * as store from '../storage/project-manager.js';
import { createDefaultProject, createColumn, sampleProject, defaultCombinations } from '../storage/default-project.js';
import { exportJSON, importJSON, columnsToCSV, csvToColumns, downloadText } from '../storage/import-export.js';
import { designColumn } from '../analysis/design-column.js';
import { designBatch, batchCSV } from '../analysis/batch-design.js';
import { getEngine } from '../analysis/capacity-check.js';
import { uniaxialDiagram } from '../analysis/interaction-diagrams.js';
import { optimize as optimizeACI } from '../codes/aci318-25/optimization.js';
import { optimize as optimizeBS } from '../codes/bs8110-1997/optimization.js';
import { crossSectionSVG } from '../drawings/cross-section.js';
import { elevationSVG } from '../drawings/elevation.js';
import { columnDXF } from '../drawings/dxf-export.js';
import { reinforcementSchedule } from '../drawings/reinforcement.js';
import { generateReport, reportCSV } from '../reports/pdf-report.js';
import { runBenchmarks } from '../validation/benchmarks.js';
import { drawUniaxial, drawBiaxial } from './charts.js';
import * as UI from './components.js';

const state = {
  project: null, columnId: null, projects: [], results: new Map(),
  activeTab: 'column', prefs: store.getPreferences(), batchResult: null, optResult: null, validation: null,
};
const $ = sel => document.querySelector(sel);
const content = $('#content');

function markBooted() {
  window.__RCDP_BOOTED = true;
  const el = $('#bootError'); if (el) el.hidden = true;
}
function showBootError(msg) {
  const el = $('#bootError'); if (el) { el.hidden = false; el.textContent = msg; }
}
function syncHeader() {
  const p = state.project; if (!p) return;
  const name = $('#projectName'); if (name) name.value = p.name ?? '';
  const code = $('#codeSelect'); if (code) code.value = p.code ?? 'ACI318-25';
}
function ensureProject(p) {
  p.code = p.code ?? 'ACI318-25';
  p.name = p.name ?? 'Untitled Project';
  if (!Array.isArray(p.columns) || !p.columns.length) p.columns = [createColumn('C1', p.code)];
  if (!Array.isArray(p.combinations)) p.combinations = defaultCombinations(p.code);
  return p;
}
function updateStorageBadge() {
  const st = store.getStorageStatus?.();
  const badge = $('#offlineBadge'); if (!badge) return;
  if (st?.mode && st.mode !== 'indexeddb') badge.textContent = 'Local backup mode';
}

function column() { return state.project?.columns.find(c => c.id === state.columnId) ?? state.project?.columns[0]; }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }
function setSaveStatus(s) { $('#saveStatus').textContent = s; }

function applyTheme() {
  try {
    const theme = state.prefs.theme ?? 'system';
    const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch { document.documentElement.dataset.theme = 'light'; }
}

async function loadProjects() { try { state.projects = await store.listProjects(); } catch { state.projects = []; } }

async function openProject(p, { persist = true } = {}) {
  state.project = ensureProject(p);
  state.columnId = state.project.columns[0]?.id;
  state.results.clear(); state.batchResult = null; state.optResult = null;
  syncHeader();
  render();
  markBooted();
  if (persist) { try { await store.saveProject(state.project); } catch (e) { showBootError(`Project could not be saved: ${e.message}`); } }
  await loadProjects();
  updateStorageBadge();
  if (state.activeTab === 'projects') render();
}

function render() {
  try {
    const nav = $('#nav'); if (nav) nav.innerHTML = UI.renderNav(state.activeTab);
    const s = { ...state, column: column() };
    const renderers = { projects: UI.renderProjects, column: UI.renderColumn, loads: UI.renderLoads, analysis: UI.renderAnalysis, optimize: UI.renderOptimize, drawings: UI.renderDrawings, batch: UI.renderBatch, report: UI.renderReport, validation: UI.renderValidation, settings: UI.renderSettings, help: UI.renderHelp };
    content.innerHTML = (renderers[state.activeTab] ?? UI.renderColumn)(s);
    if (state.activeTab === 'analysis') drawCharts();
  } catch (e) {
    console.error(e);
    content.innerHTML = `<div class="card"><h2>Display error</h2><p class="muted">The workspace could not be rendered: ${String(e?.message ?? e)}</p><button class="btn primary" data-action="new-project">Start a new project</button></div>`;
    showBootError(`Display error: ${e?.message ?? e}`);
  }
}

function drawCharts() {
  const col = column(); const r = state.results.get(col?.id); if (!r) return;
  const eng = getEngine(r.code);
  const cx = $('#chartX'), cb = $('#chartBiax');
  if (cx) {
    const diag = uniaxialDiagram({ code: r.code, section: r.section, concrete: r.concrete, steel: r.steel, axis: 'x', transverseType: r.transverse.type, points: 120 });
    const loads = r.loadResults.map(lr => ({ name: lr.load.name, P: lr.load.Pu, M: lr.designMx, fail: lr.status === 'FAIL' }));
    drawUniaxial(cx, diag, loads);
  }
  if (cb && r.governing?.capacity?.surface) {
    drawBiaxial(cb, r.governing.capacity.surface, { Mx: r.governing.designMx, My: r.governing.designMy, fail: r.governing.status === 'FAIL' });
  }
}

function markDirty() {
  if (!state.project) return;
  setSaveStatus('Saving…');
  store.scheduleAutosave(state.project);
  setTimeout(() => setSaveStatus('Saved'), 1300);
  state.results.delete(column()?.id);
}

function setPath(obj, path, value) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null) o[keys[i]] = {}; o = o[keys[i]]; }
  o[keys[keys.length - 1]] = value;
}

function runDesign({ silent = false } = {}) {
  const col = column(); if (!col) return;
  try {
    const r = designColumn(col.input, { angles: 72 });
    state.results.set(col.id, r);
    if (!silent) toast(`Design complete: ${r.status}`);
  } catch (e) { if (!silent) toast(`Design error: ${e.message}`); console.error(e); }
  render();
}

async function runOptimize() {
  const col = column(); if (!col) return;
  const objective = $('#optObjective')?.value ?? 'steel';
  const price = Number($('#optPrice')?.value ?? 1.2);
  const maxBars = Number($('#optMaxBars')?.value ?? 24);
  const prog = $('#optProgress');
  const opt = col.input.code?.startsWith('BS') ? optimizeBS : optimizeACI;
  prog.innerHTML = '<div class="progress"><div style="width:0%"></div></div><p class="small muted">Evaluating candidates…</p>';
  try {
    const result = await opt(col.input, { objective, prices: { steelPerKg: price }, maxBars, maxAlternatives: 8, angles: 36 }, p => {
      const bar = prog.querySelector('.progress>div'); if (bar) bar.style.width = `${(p.evaluated / p.total * 100).toFixed(0)}%`;
    });
    state.optResult = result;
    toast(`Optimization: ${result.searchSpace.feasible} feasible of ${result.searchSpace.evaluated}`);
  } catch (e) { toast(`Optimization error: ${e.message}`); }
  render();
}

async function svgToPng(svg, width = 1000, height = 1000) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);
  return canvas.toDataURL('image/png');
}

async function handleAction(action, el) {
  const col = column();
  switch (action) {
    case 'new-project': await openProject(createDefaultProject()); state.activeTab = 'column'; render(); break;
    case 'load-sample': await openProject(sampleProject()); state.activeTab = 'column'; render(); break;
    case 'open-project': { const p = await store.getProject(el.dataset.id); if (p) await openProject(p); break; }
    case 'duplicate-project': await store.duplicateProject(el.dataset.id); await loadProjects(); render(); break;
    case 'delete-project': if (confirm('Delete this project?')) { await store.deleteProject(el.dataset.id); await loadProjects(); render(); } break;
    case 'export-project': downloadText(`${state.project.name}.json`, exportJSON(state.project), 'application/json'); break;
    case 'import-project': pickFile('.json', async text => { const p = importJSON(text); await openProject(p); toast('Project imported'); }); break;
    case 'add-column': { const c = createColumn(`C${state.project.columns.length + 1}`, state.project.code); state.project.columns.push(c); state.columnId = c.id; markDirty(); render(); break; }
    case 'delete-column': if (state.project.columns.length > 1 && confirm('Delete column?')) { state.project.columns = state.project.columns.filter(c => c.id !== col.id); state.columnId = state.project.columns[0].id; markDirty(); render(); } break;
    case 'select-column': state.columnId = el.dataset.id; state.activeTab = 'column'; render(); break;
    case 'run-design': runDesign(); break;
    case 'add-load': col.input.loads.push({ name: `LC${col.input.loads.length + 1}`, Pu: 0, Mx: 0, My: 0 }); markDirty(); render(); break;
    case 'remove-load': col.input.loads.splice(Number(el.dataset.index), 1); markDirty(); render(); break;
    case 'generate-loads': generateLoads(col); markDirty(); render(); toast('Factored loads generated'); break;
    case 'run-optimize': await runOptimize(); break;
    case 'apply-alternative': {
      const a = state.optResult?.alternatives[Number(el.dataset.index)]; if (!a) break;
      col.input.cover = a.candidate.cover; col.input.arrangement = a.candidate.arrangement; col.input.bars = undefined;
      col.input.transverse = { ...col.input.transverse, db: a.result.transverse.db, spacing: a.result.transverse.spacing };
      state.results.set(col.id, a.result); markDirty(); state.activeTab = 'column'; render(); toast('Alternative applied'); break;
    }
    case 'export-svg': { const r = state.results.get(col.id); if (!r) break; const svg = el.dataset.kind === 'elev' ? elevationSVG(r) : crossSectionSVG(r); downloadText(`${col.mark}-${el.dataset.kind}.svg`, svg, 'image/svg+xml'); break; }
    case 'export-png': { const r = state.results.get(col.id); if (!r) break; const png = await svgToPng(crossSectionSVG(r, { width: 1000, height: 1000 })); const a = document.createElement('a'); a.href = png; a.download = `${col.mark}-cross.png`; a.click(); break; }
    case 'export-dxf': { const r = state.results.get(col.id); if (r) downloadText(`${col.mark}.dxf`, columnDXF(r), 'application/dxf'); break; }
    case 'export-schedule': { const r = state.results.get(col.id); if (!r) break; const rows = reinforcementSchedule(r); const csv = ['mark,type,db,count,length_mm,shape,As_mm2,weight_kg', ...rows.map(x => [x.mark, x.type, x.db, x.count, x.length.toFixed(0), x.shape, x.totalAs.toFixed(0), x.weight.toFixed(1)].join(','))].join('\n'); downloadText(`${col.mark}-schedule.csv`, csv, 'text/csv'); break; }
    case 'import-csv': pickFile('.csv', text => { const cols = csvToColumns(text, state.project.code); state.project.columns.push(...cols); markDirty(); render(); toast(`${cols.length} columns imported`); }); break;
    case 'export-csv': downloadText(`${state.project.name}-columns.csv`, columnsToCSV(state.project), 'text/csv'); break;
    case 'run-batch': {
      const b = await designBatch(state.project.columns, { angles: 48, defaultCode: state.project.code });
      state.batchResult = b; for (const r of b.results) if (r.result) state.results.set(r.id, r.result);
      render(); toast(`Batch: ${b.summary.passing}/${b.summary.total} passing`); break;
    }
    case 'export-pdf': {
      const r = state.results.get(col.id); if (!r) break;
      const images = { crossSection: await svgToPng(crossSectionSVG(r, { width: 800, height: 800 }), 800, 800), elevation: await svgToPng(elevationSVG(r, { width: 500, height: 800 }), 500, 800) };
      const doc = generateReport(r, { ...state.project, columnMark: col.mark }, images);
      doc.save(`${state.project.name}-${col.mark}-report.pdf`); break;
    }
    case 'export-report-csv': { const r = state.results.get(col.id); if (r) downloadText(`${col.mark}-checks.csv`, reportCSV(r), 'text/csv'); break; }
    case 'run-validation': { state.validation = await runBenchmarks(); render(); toast(`Validation ${state.validation.passed}/${state.validation.total}`); break; }
    case 'restore-backup': { const b = store.getBackup(); if (b?.project) { await openProject(b.project); toast('Backup restored'); } else toast('No backup found'); break; }
    case 'clear-storage': if (confirm('Clear all local projects and preferences?')) { for (const p of state.projects) await store.deleteProject(p.id); localStorage.clear(); location.reload(); } break;
  }
}

function generateLoads(col) {
  const svc = col.input.serviceLoads ?? {};
  const combos = state.project.combinations ?? [];
  const fields = ['Pu', 'Mx', 'My', 'Vx', 'Vy'];
  col.input.loads = combos.map(c => {
    const load = { id: c.id, name: c.name };
    for (const f of fields) {
      let v = 0;
      for (const k of ['D', 'L', 'W', 'E']) v += (c.factors?.[k] ?? 0) * (svc[k]?.[f] ?? 0);
      load[f] = f.startsWith('M') ? v * 1e6 : v * 1000;
    }
    load.M1x = load.Mx * 0.5; load.M2x = load.Mx; load.M1y = load.My * 0.5; load.M2y = load.My;
    return load;
  });
}

function pickFile(accept, cb) {
  const input = $('#fileInput'); input.accept = accept; input.value = '';
  input.onchange = async () => { const f = input.files[0]; if (f) cb(await f.text()); };
  input.click();
}

// Event delegation
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { state.activeTab = tab.dataset.tab; $('#sidebar').classList.remove('open'); render(); return; }
  const action = e.target.closest('[data-action]');
  if (action) { Promise.resolve(handleAction(action.dataset.action, action)).catch(err => { console.error(err); toast(`Action failed: ${err.message}`); }); return; }
});
document.addEventListener('input', e => {
  const t = e.target; const col = column();
  if (t.id === 'projectName') { if (state.project) state.project.name = t.value; markDirty(); return; }
  if (t.dataset.path && col) {
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number') v = v === '' ? undefined : Number(v);
    if (t.dataset.path === 'geometry.shape') { col.input.geometry = v === 'circle' ? { shape: 'circle', D: 500 } : { shape: 'rect', b: 400, h: 600 }; }
    else setPath(col.input, t.dataset.path, v);
    if (t.dataset.path === 'code' || t.dataset.path === 'geometry.shape') { /* handled below */ }
    markDirty();
    if (state.activeTab === 'column') render();
    return;
  }
  if (t.dataset.colField && col) { col[t.dataset.colField] = t.value; markDirty(); return; }
  if (t.dataset.load !== undefined && col) {
    const idx = Number(t.dataset.load), f = t.dataset.loadField;
    let v = Number(t.value);
    if (f.startsWith('M') && f !== 'betaDns') v *= 1e6; else if (['Pu', 'Vx', 'Vy'].includes(f)) v *= 1000;
    col.input.loads[idx][f] = v; markDirty(); return;
  }
  if (t.dataset.service && col) {
    const k = t.dataset.service, f = t.dataset.serviceField;
    col.input.serviceLoads ??= {}; col.input.serviceLoads[k] ??= {};
    col.input.serviceLoads[k][f] = Number(t.value); // stored in display units (kN, kN·m)
    markDirty(); return;
  }
  if (t.dataset.combo !== undefined) {
    const idx = Number(t.dataset.combo), f = t.dataset.comboField;
    if (f.startsWith('factors.')) setPath(state.project.combinations[idx], f, Number(t.value));
    else state.project.combinations[idx][f] = t.value;
    markDirty(); return;
  }
  if (t.dataset.pref) { state.prefs[t.dataset.pref] = t.value; store.setPreferences(state.prefs); applyTheme(); return; }
});
document.addEventListener('change', e => {
  if (e.target.id === 'codeSelect') {
    const newCode = e.target.value;
    state.project.code = newCode;
    state.project.combinations = defaultCombinations(newCode);
    for (const c of state.project.columns) {
      const i = c.input; const wasBS = i.code?.startsWith('BS'); const isBS = newCode.startsWith('BS');
      i.code = newCode;
      if (wasBS !== isBS) {
        if (isBS) { i.concrete = { fcu: i.concrete?.fc ?? i.concrete?.fcu ?? 30 }; i.exposure = 'moderate'; if (![250, 460].includes(i.steel?.fy)) i.steel = { fy: 460 }; if (![250, 460].includes(i.tieSteel?.fy)) i.tieSteel = { fy: 460 }; }
        else { i.concrete = { fc: i.concrete?.fcu ?? i.concrete?.fc ?? 30 }; i.exposure = 'interior'; if (i.steel?.fy === 460) i.steel = { fy: 420 }; if (i.tieSteel?.fy === 460) i.tieSteel = { fy: 420 }; }
      }
    }
    state.results.clear(); markDirty(); render();
  }
});
$('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#themeToggle').addEventListener('click', () => { state.prefs.theme = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark'; store.setPreferences(state.prefs); applyTheme(); });
$('#runDesign').addEventListener('click', runDesign);
$('#saveProject').addEventListener('click', async () => {
  try { await store.saveProject(state.project); await loadProjects(); updateStorageBadge(); setSaveStatus('Saved'); toast('Project saved'); }
  catch (e) { setSaveStatus('Save failed'); toast(`Save failed: ${e.message}`); }
});
window.addEventListener('resize', () => { if (state.activeTab === 'analysis') drawCharts(); });
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch { }
window.addEventListener('error', e => { if (!window.__RCDP_BOOTED) showBootError(`Startup error: ${e.message}`); });
window.addEventListener('unhandledrejection', e => { if (!window.__RCDP_BOOTED) showBootError(`Startup error: ${e.reason?.message ?? e.reason}`); });
window.addEventListener('rcdp-storage-warning', e => { updateStorageBadge(); toast(e.detail ?? 'Using local backup storage.'); });

// Boot: render a usable workspace immediately, then hydrate from storage in the background.
(function init() {
  applyTheme();
  try {
    state.project = ensureProject(createDefaultProject());
    state.columnId = state.project.columns[0]?.id;
    syncHeader();
    render();
    markBooted();
    setSaveStatus('Loading…');
  } catch (e) {
    console.error(e);
    showBootError(`Startup failed: ${e.message}`);
    return;
  }
  (async () => {
    await loadProjects();
    const backup = store.getBackup();
    const existing = state.projects[0] ?? backup?.project;
    if (existing) await openProject(existing, { persist: false });
    else { await store.saveProject(state.project); await loadProjects(); }
    updateStorageBadge();
    setSaveStatus('Saved');
    if (state.activeTab === 'projects') render();
    else if (!state.results.get(column()?.id)) runDesign({ silent: true });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
    window.addEventListener('online', () => { $('#offlineBadge').textContent = 'Offline-ready'; });
    window.addEventListener('offline', () => { $('#offlineBadge').textContent = 'Offline mode'; });
  })().catch(e => { console.error(e); showBootError(`Storage hydration failed: ${e.message}. The workspace is still usable in memory.`); setSaveStatus('Memory only'); });
})();
