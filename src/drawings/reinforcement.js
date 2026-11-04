/** Reinforcement schedule. */
import { steelWeightKg, barArea } from '../core/geometry.js';
export function reinforcementSchedule(result) {
  const s = result.section, t = result.transverse;
  const H = result.height?.clear ?? 3000;
  const byDb = new Map();
  for (const bar of s.bars) {
    const key = bar.db;
    if (!byDb.has(key)) byDb.set(key, { db: key, count: 0, As: 0 });
    const row = byDb.get(key); row.count++; row.As += bar.As;
  }
  const rows = [...byDb.values()].map((r, i) => ({
    mark: `B${i + 1}`, type: 'Longitudinal', db: r.db, count: r.count,
    length: H, shape: 'Straight', totalAs: r.As, weight: steelWeightKg(r.As, H),
  }));
  const tiePerimeter = s.shape === 'circle' ? Math.PI * (s.D - 2 * s.cover) : 2 * ((s.b - 2 * s.cover) + (s.h - 2 * s.cover));
  const tieCount = Math.ceil(H / t.spacing) + 1;
  rows.push({ mark: 'T1', type: t.type === 'spiral' ? 'Spiral' : 'Tie/Link', db: t.db, count: tieCount, length: tiePerimeter, shape: s.shape === 'circle' ? 'Circular' : 'Closed rectangular', totalAs: barArea(t.db) * tieCount, weight: steelWeightKg(barArea(t.db), tiePerimeter * tieCount) });
  return rows;
}
export function scheduleHTML(result) {
  const rows = reinforcementSchedule(result);
  return `<table class="data-table"><thead><tr><th>Mark</th><th>Type</th><th>Ø (mm)</th><th>Qty</th><th>Length (mm)</th><th>Shape</th><th>As (mm²)</th><th>Weight (kg)</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r.mark}</td><td>${r.type}</td><td>${r.db}</td><td>${r.count}</td><td>${r.length.toFixed(0)}</td><td>${r.shape}</td><td>${r.totalAs.toFixed(0)}</td><td>${r.weight.toFixed(1)}</td></tr>`).join('')}</tbody></table>`;
}
