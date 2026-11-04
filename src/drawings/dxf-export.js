/** Verified ASCII DXF R12 exporter (LINE, CIRCLE, TEXT). No external dependencies. */
import { crossSectionPrimitives } from './cross-section.js';

function pair(code, value) { return `${code}\n${value}\n`; }

export function entitiesToDXF({ lines = [], circles = [], texts = [] }, { units = 'mm' } = {}) {
  let dxf = '';
  dxf += pair(0, 'SECTION') + pair(2, 'HEADER');
  dxf += pair(9, '$ACADVER') + pair(1, 'AC1009');
  dxf += pair(9, '$INSUNITS') + pair(70, units === 'mm' ? 4 : 0);
  dxf += pair(0, 'ENDSEC');
  dxf += pair(0, 'SECTION') + pair(2, 'TABLES');
  dxf += pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, 5);
  for (const [name, color] of [['CONCRETE', 7], ['TIES', 5], ['REBAR', 1], ['TEXT', 3], ['DIMS', 2]]) {
    dxf += pair(0, 'LAYER') + pair(2, name) + pair(70, 0) + pair(62, color) + pair(6, 'CONTINUOUS');
  }
  dxf += pair(0, 'ENDTAB') + pair(0, 'ENDSEC');
  dxf += pair(0, 'SECTION') + pair(2, 'ENTITIES');
  for (const l of lines) {
    dxf += pair(0, 'LINE') + pair(8, l.layer ?? '0');
    dxf += pair(10, l.x1) + pair(20, l.y1) + pair(30, 0);
    dxf += pair(11, l.x2) + pair(21, l.y2) + pair(31, 0);
  }
  for (const c of circles) {
    dxf += pair(0, 'CIRCLE') + pair(8, c.layer ?? '0');
    dxf += pair(10, c.cx) + pair(20, c.cy) + pair(30, 0) + pair(40, c.r);
  }
  for (const t of texts) {
    dxf += pair(0, 'TEXT') + pair(8, t.layer ?? 'TEXT');
    dxf += pair(10, t.x) + pair(20, t.y) + pair(30, 0);
    dxf += pair(40, t.height ?? 10) + pair(1, t.text);
  }
  dxf += pair(0, 'ENDSEC') + pair(0, 'EOF');
  return dxf;
}

export function columnDXF(result) {
  const p = crossSectionPrimitives(result);
  const s = result.section;
  const dim = s.shape === 'circle' ? s.D : Math.max(s.b, s.h);
  p.texts.push({ x: -dim / 2, y: -dim / 2 - 40, text: `${result.codeLabel} | ${s.bars.length}-D${Math.max(...s.bars.map(b => b.db))} | ${result.transverse.type} D${result.transverse.db}@${result.transverse.spacing}`, height: 14, layer: 'TEXT' });
  return entitiesToDXF(p);
}

/** Minimal DXF integrity validation used by regression tests. */
export function validateDXF(dxf) {
  const issues = [];
  if (!dxf.startsWith('0\nSECTION')) issues.push('Missing HEADER section');
  if (!dxf.includes('0\nEOF')) issues.push('Missing EOF');
  const lines = dxf.split('\n');
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (!/^\d+$/.test(lines[i])) issues.push(`Invalid group code at line ${i + 1}: ${lines[i]}`);
  }
  const counts = { LINE: 0, CIRCLE: 0, TEXT: 0 };
  for (const key of Object.keys(counts)) counts[key] = (dxf.match(new RegExp(`0\\n${key}\\n`, 'g')) ?? []).length;
  return { valid: issues.length === 0, issues, counts };
}
