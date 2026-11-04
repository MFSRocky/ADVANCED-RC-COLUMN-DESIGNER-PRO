/** Professional SVG cross-section drawing + DXF primitives. Units: mm. */
import { barArea } from '../core/geometry.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function crossSectionPrimitives(result) {
  const s = result.section, t = result.transverse;
  const lines = [], circles = [], texts = [];
  const cover = s.cover;
  if (s.shape === 'circle') {
    circles.push({ cx: 0, cy: 0, r: s.D / 2, layer: 'CONCRETE' });
    circles.push({ cx: 0, cy: 0, r: s.D / 2 - cover, layer: 'TIES' });
  } else {
    const b = s.b, h = s.h;
    lines.push({ x1: -b / 2, y1: -h / 2, x2: b / 2, y2: -h / 2, layer: 'CONCRETE' });
    lines.push({ x1: b / 2, y1: -h / 2, x2: b / 2, y2: h / 2, layer: 'CONCRETE' });
    lines.push({ x1: b / 2, y1: h / 2, x2: -b / 2, y2: h / 2, layer: 'CONCRETE' });
    lines.push({ x1: -b / 2, y1: h / 2, x2: -b / 2, y2: -h / 2, layer: 'CONCRETE' });
    const tb = b / 2 - cover, th = h / 2 - cover;
    lines.push({ x1: -tb, y1: -th, x2: tb, y2: -th, layer: 'TIES' });
    lines.push({ x1: tb, y1: -th, x2: tb, y2: th, layer: 'TIES' });
    lines.push({ x1: tb, y1: th, x2: -tb, y2: th, layer: 'TIES' });
    lines.push({ x1: -tb, y1: th, x2: -tb, y2: -th, layer: 'TIES' });
    if (t.crossTies) {
      const xs = [...new Set(s.bars.map(b => b.x.toFixed(3)))].map(Number).sort((a, b) => a - b);
      const ys = [...new Set(s.bars.map(b => b.y.toFixed(3)))].map(Number).sort((a, b) => a - b);
      for (const x of xs.slice(1, -1)) lines.push({ x1: x, y1: -th, x2: x, y2: th, layer: 'TIES' });
      for (const y of ys.slice(1, -1)) lines.push({ x1: -tb, y1: y, x2: tb, y2: y, layer: 'TIES' });
    }
  }
  s.bars.forEach((bar, i) => {
    circles.push({ cx: bar.x, cy: bar.y, r: bar.db / 2, layer: 'REBAR' });
    texts.push({ x: bar.x, y: bar.y, text: `B${i + 1}`, height: Math.max(8, s.D ? s.D / 40 : Math.min(s.b, s.h) / 40), layer: 'TEXT' });
  });
  return { lines, circles, texts };
}

export function crossSectionSVG(result, { width = 520, height = 520, title = 'CROSS-SECTION' } = {}) {
  const s = result.section;
  const dim = s.shape === 'circle' ? s.D : Math.max(s.b, s.h);
  const margin = dim * 0.22;
  const vb = dim + 2 * margin;
  const scale = Math.min(width, height) / vb;
  const ox = width / 2, oy = height / 2;
  const X = x => ox + x * scale, Y = y => oy - y * scale;
  const p = crossSectionPrimitives(result);
  let svg = `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, Arial, sans-serif">`;
  svg += `<rect width="100%" height="100%" fill="#ffffff"/>`;
  svg += `<g stroke="#1a1a1a" stroke-width="2" fill="none">`;
  for (const l of p.lines.filter(l => l.layer === 'CONCRETE')) svg += `<line x1="${X(l.x1)}" y1="${Y(l.y1)}" x2="${X(l.x2)}" y2="${Y(l.y2)}"/>`;
  svg += `</g><g stroke="#0066cc" stroke-width="1.5" fill="none">`;
  for (const l of p.lines.filter(l => l.layer === 'TIES')) svg += `<line x1="${X(l.x1)}" y1="${Y(l.y1)}" x2="${X(l.x2)}" y2="${Y(l.y2)}"/>`;
  for (const c of p.circles.filter(c => c.layer === 'TIES')) svg += `<circle cx="${X(c.cx)}" cy="${Y(c.cy)}" r="${c.r * scale}"/>`;
  svg += `</g><g fill="#cc0000" stroke="#800000" stroke-width="1">`;
  for (const c of p.circles.filter(c => c.layer === 'REBAR')) svg += `<circle cx="${X(c.cx)}" cy="${Y(c.cy)}" r="${Math.max(3, c.r * scale)}"/>`;
  svg += `</g>`;
  // Axes
  svg += `<g stroke="#888" stroke-width="0.8" stroke-dasharray="6 4"><line x1="${X(-dim / 2 - margin * 0.5)}" y1="${Y(0)}" x2="${X(dim / 2 + margin * 0.5)}" y2="${Y(0)}"/><line x1="${X(0)}" y1="${Y(-dim / 2 - margin * 0.5)}" x2="${X(0)}" y2="${Y(dim / 2 + margin * 0.5)}"/></g>`;
  svg += `<text x="${X(dim / 2 + margin * 0.55)}" y="${Y(0) + 4}" font-size="12" fill="#555">X</text><text x="${X(0) + 5}" y="${Y(dim / 2 + margin * 0.55)}" font-size="12" fill="#555">Y</text>`;
  // Dimensions
  const dy = Y(-dim / 2) + 34;
  if (s.shape === 'rect') {
    svg += dimLine(X(-s.b / 2), dy, X(s.b / 2), dy, `${s.b}`);
    const dx = X(-s.b / 2) - 34;
    svg += dimLineV(dx, Y(-s.h / 2), dx, Y(s.h / 2), `${s.h}`);
  } else {
    svg += dimLine(X(-s.D / 2), dy, X(s.D / 2), dy, `Ø${s.D}`);
  }
  // Cover note
  svg += `<text x="${X(0)}" y="${Y(0) - 6}" font-size="11" fill="#333" text-anchor="middle">cover ${s.cover} mm</text>`;
  svg += `<text x="${X(0)}" y="${Y(0) + 10}" font-size="11" fill="#333" text-anchor="middle">${s.bars.length}–Ø${Math.max(...s.bars.map(b => b.db))}</text>`;
  // Title block
  svg += `<rect x="8" y="8" width="${width - 16}" height="26" fill="#f4f6f8" stroke="#ccc"/>`;
  svg += `<text x="16" y="26" font-size="13" font-weight="600" fill="#111">${esc(title)}</text>`;
  svg += `<text x="${width - 16}" y="26" font-size="11" fill="#555" text-anchor="end">${esc(result.codeLabel)} · ${result.transverse.type} Ø${result.transverse.db}@${result.transverse.spacing}</text>`;
  svg += `</svg>`;
  return svg;
}

function dimLine(x1, y, x2, y2, label) {
  return `<g stroke="#333" stroke-width="1" fill="#333" font-size="12"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}"/><line x1="${x2}" y1="${y2 - 5}" x2="${x2}" y2="${y2 + 5}"/><text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle" stroke="none">${label}</text></g>`;
}
function dimLineV(x, y1, x2, y2, label) {
  return `<g stroke="#333" stroke-width="1" fill="#333" font-size="12"><line x1="${x}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}"/><line x1="${x2 - 5}" y1="${y2}" x2="${x2 + 5}" y2="${y2}"/><text x="${x - 6}" y="${(y1 + y2) / 2}" text-anchor="middle" transform="rotate(-90 ${x - 6} ${(y1 + y2) / 2})" stroke="none">${label}</text></g>`;
}
