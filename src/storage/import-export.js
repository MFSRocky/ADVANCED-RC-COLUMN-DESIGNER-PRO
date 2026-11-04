/** JSON / CSV import-export with validation. */
import { newId } from '../core/id.js';
import { ValidationError } from '../core/validation.js';

export function exportJSON(project) { return JSON.stringify(project, null, 2); }

export function importJSON(text) {
  let p;
  try { p = JSON.parse(text); } catch (e) { throw new ValidationError(`Invalid JSON: ${e.message}`); }
  if (!p || typeof p !== 'object') throw new ValidationError('Project must be a JSON object.');
  if (!p.name) throw new ValidationError('Project is missing a name.');
  if (!Array.isArray(p.columns)) throw new ValidationError('Project is missing a columns array.');
  p.id = p.id ?? newId();
  p.schemaVersion = p.schemaVersion ?? 1;
  return p;
}

const COLUMN_HEADERS = ['mark', 'floor', 'grid', 'zone', 'code', 'shape', 'b', 'h', 'D', 'cover', 'fc', 'fcu', 'fy', 'fyv', 'barDb', 'nx', 'ny', 'n', 'tieDb', 'tieSpacing', 'clearHeight', 'braced', 'lex', 'ley', 'Pu', 'Mx', 'My', 'Vx', 'Vy'];

export function columnsToCSV(project) {
  const lines = [COLUMN_HEADERS.join(',')];
  for (const col of project.columns ?? []) {
    const i = col.input ?? {};
    const g = i.geometry ?? {};
    const load = i.loads?.[0] ?? {};
    const row = {
      mark: col.mark, floor: col.floor ?? '', grid: col.grid ?? '', zone: col.zone ?? '', code: i.code ?? project.code,
      shape: g.shape ?? 'rect', b: g.b ?? '', h: g.h ?? '', D: g.D ?? '', cover: i.cover ?? g.cover ?? '',
      fc: i.concrete?.fc ?? '', fcu: i.concrete?.fcu ?? '', fy: i.steel?.fy ?? '', fyv: i.tieSteel?.fy ?? '',
      barDb: i.arrangement?.barDb ?? '', nx: i.arrangement?.nx ?? '', ny: i.arrangement?.ny ?? '', n: i.arrangement?.n ?? '',
      tieDb: i.transverse?.db ?? '', tieSpacing: i.transverse?.spacing ?? '', clearHeight: i.height?.clear ?? '', braced: i.height?.braced !== false ? 1 : 0,
      lex: i.height?.lex ?? '', ley: i.height?.ley ?? '', Pu: load.Pu ?? '', Mx: load.Mx ?? '', My: load.My ?? '', Vx: load.Vx ?? '', Vy: load.Vy ?? '',
    };
    lines.push(COLUMN_HEADERS.map(h => csvCell(row[h])).join(','));
  }
  return lines.join('\n');
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some(c => c.trim() !== '')) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]?.trim() ?? ''])));
}

export function csvToColumns(text, defaultCode = 'ACI318-25') {
  const rows = parseCSV(text);
  return rows.map((r, idx) => {
    const code = r.code || defaultCode;
    const isBS = code.startsWith('BS');
    const num = (k, d) => r[k] !== '' && r[k] !== undefined ? Number(r[k]) : d;
    const shape = r.shape || 'rect';
    const input = {
      code,
      geometry: shape === 'circle' ? { shape, D: num('D', 500) } : { shape, b: num('b', 400), h: num('h', 600) },
      cover: num('cover', isBS ? 30 : 40),
      concrete: isBS ? { fcu: num('fcu', 30) } : { fc: num('fc', 30) },
      steel: { fy: num('fy', isBS ? 460 : 420) },
      tieSteel: { fy: num('fyv', isBS ? 460 : 420) },
      arrangement: shape === 'circle' ? { barDb: num('barDb', 20), n: num('n', 8) } : { barDb: num('barDb', 20), nx: num('nx', 3), ny: num('ny', 3) },
      transverse: { db: num('tieDb', isBS ? 8 : 10), spacing: num('tieSpacing', 150) },
      height: { clear: num('clearHeight', 3500), braced: r.braced !== '0', lex: num('lex', undefined), ley: num('ley', undefined) },
      loads: [{ name: 'CSV-ULS', Pu: num('Pu', 1000e3), Mx: num('Mx', 0), My: num('My', 0), Vx: num('Vx', 0), Vy: num('Vy', 0) }],
    };
    return { id: newId(), mark: r.mark || `C${idx + 1}`, floor: r.floor || '', grid: r.grid || '', zone: r.zone || '', input };
  });
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
