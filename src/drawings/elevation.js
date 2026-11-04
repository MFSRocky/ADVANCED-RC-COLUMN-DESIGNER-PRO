/** Longitudinal elevation SVG. */
const NS = 'http://www.w3.org/2000/svg';
export function elevationSVG(result, { width = 360, height = 640, title = 'ELEVATION' } = {}) {
  const s = result.section, t = result.transverse;
  const H = result.height?.clear ?? 3000;
  const b = s.shape === 'circle' ? s.D : s.b;
  const margin = 70;
  const scale = (height - 2 * margin) / H;
  const sw = Math.max(40, b * scale);
  const ox = width / 2, oy = height - margin;
  const X = x => ox + x * scale, Y = z => oy - z * scale;
  let svg = `<svg xmlns="${NS}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>`;
  svg += `<rect x="${X(-b / 2)}" y="${Y(H)}" width="${sw}" height="${H * scale}" fill="#f7f7f7" stroke="#111" stroke-width="2"/>`;
  // Longitudinal bars
  const barXs = s.shape === 'circle' ? [-b / 2 + s.cover + t.db, b / 2 - s.cover - t.db] : [-b / 2 + s.cover + t.db, b / 2 - s.cover - t.db];
  svg += `<g stroke="#cc0000" stroke-width="2">`;
  for (const x of barXs) svg += `<line x1="${X(x)}" y1="${Y(0)}" x2="${X(x)}" y2="${Y(H)}"/>`;
  svg += `</g>`;
  // Links
  svg += `<g stroke="#0066cc" stroke-width="1.2">`;
  const n = Math.min(80, Math.ceil(H / t.spacing));
  for (let i = 0; i <= n; i++) {
    const z = Math.min(H, i * t.spacing);
    svg += `<line x1="${X(-b / 2 + s.cover)}" y1="${Y(z)}" x2="${X(b / 2 - s.cover)}" y2="${Y(z)}"/>`;
  }
  svg += `</g>`;
  // End zones
  svg += `<g stroke="#333" stroke-width="0.8" stroke-dasharray="4 3"><line x1="${X(-b / 2) - 12}" y1="${Y(H)}" x2="${X(b / 2) + 12}" y2="${Y(H)}"/><line x1="${X(-b / 2) - 12}" y1="${Y(0)}" x2="${X(b / 2) + 12}" y2="${Y(0)}"/></g>`;
  // Height dimension
  const dx = X(b / 2) + 34;
  svg += `<g stroke="#333" stroke-width="1" fill="#333" font-size="12"><line x1="${dx}" y1="${Y(0)}" x2="${dx}" y2="${Y(H)}"/><line x1="${dx - 5}" y1="${Y(0)}" x2="${dx + 5}" y2="${Y(0)}"/><line x1="${dx - 5}" y1="${Y(H)}" x2="${dx + 5}" y2="${Y(H)}"/><text x="${dx + 8}" y="${Y(H / 2)}" transform="rotate(-90 ${dx + 8} ${Y(H / 2)})" text-anchor="middle" stroke="none">${H} mm</text></g>`;
  svg += `<text x="${ox}" y="${Y(H) - 12}" font-size="12" fill="#333" text-anchor="middle">${t.type} Ø${t.db}@${t.spacing} c/c</text>`;
  svg += `<rect x="8" y="8" width="${width - 16}" height="26" fill="#f4f6f8" stroke="#ccc"/><text x="16" y="26" font-size="13" font-weight="600">${title}</text>`;
  svg += `</svg>`;
  return svg;
}
