/** Genuine reinforcement optimization: enumerate practical symmetric layouts, verify every candidate. */
import { designColumn } from './design-column.js';
import { generatePerimeterBars, barArea, steelWeightKg } from '../core/geometry.js';
import { STATUS } from '../core/validation.js';

const COMMON_DIAMETERS = [16, 20, 25, 32];

function candidateLayouts(input, cfg) {
  const shape = input.geometry?.shape ?? 'rect';
  const diameters = cfg.barDiameters;
  const maxBars = cfg.maxBars ?? 28;
  const covers = cfg.coverOptions ?? [input.cover ?? input.geometry?.cover ?? 40];
  const out = [];
  for (const cover of covers) for (const barDb of diameters) {
    if (shape === 'circle') {
      for (const n of [6, 8, 10, 12, 14, 16, 20, 24]) {
        if (n <= maxBars) out.push({ cover, barDb, arrangement: { barDb, n } });
      }
    } else {
      const maxFace = cfg.maxPerFace ?? 7;
      for (let nx = 2; nx <= maxFace; nx++) for (let ny = 2; ny <= maxFace; ny++) {
        const count = 2 * nx + 2 * ny - 4;
        if (count <= maxBars && count >= 4) out.push({ cover, barDb, arrangement: { barDb, nx, ny } });
      }
    }
  }
  return out;
}

function metrics(result, input, cfg, heightMm) {
  const s = result.section;
  const t = result.transverse;
  const longWeight = steelWeightKg(s.As, heightMm);
  const tiePerimeter = s.shape === 'circle' ? Math.PI * (s.D - 2 * s.cover) : 2 * ((s.b - 2 * s.cover) + (s.h - 2 * s.cover));
  const tieCount = Math.ceil(heightMm / t.spacing) + 1;
  const tieWeight = steelWeightKg(barArea(t.db), tiePerimeter * tieCount);
  const totalWeight = longWeight + tieWeight;
  const price = cfg.prices?.steelPerKg ?? 0;
  const cost = totalWeight * price;
  const congestion = s.bars.length * 100 + s.As * 0.05 + tieWeight * 2;
  const commonPenalty = COMMON_DIAMETERS.includes(Math.max(...s.bars.map(b => b.db))) ? 0 : 250;
  return { longWeight, tieWeight, totalWeight, cost, congestion, commonPenalty, tieCount };
}

export async function runOptimization(input, cfg = {}, onProgress) {
  const objective = cfg.objective ?? 'steel';
  const candidates = candidateLayouts(input, cfg);
  const evaluated = [];
  const feasible = [];
  const heightMm = input.height?.clear ?? 3000;
  let i = 0;
  for (const cand of candidates) {
    i++;
    const trial = {
      ...input,
      cover: cand.cover,
      arrangement: cand.arrangement,
      bars: undefined,
      transverse: { ...(input.transverse ?? {}), db: undefined, spacing: undefined },
    };
    let result;
    try { result = designColumn(trial, { angles: cfg.angles ?? 36, steps: 50 }); }
    catch { evaluated.push({ candidate: cand, status: 'ERROR' }); continue; }
    // If shear controls, retry with closer ties.
    if (result.status === STATUS.FAIL && result.checks.some(c => c.id.startsWith('shear') || c.id.startsWith('bs-shear'))) {
      try {
        const retry = designColumn({ ...trial, transverse: { ...(input.transverse ?? {}), spacing: 100 } }, { angles: cfg.angles ?? 36, steps: 50 });
        if (retry.status !== STATUS.FAIL) result = retry;
      } catch { }
    }
    const m = metrics(result, input, cfg, heightMm);
    const row = { candidate: cand, result, metrics: m, status: result.status, utilization: result.summary.utilization, As: result.section.As, rho: result.section.rho, barCount: result.section.bars.length, barDb: cand.barDb };
    evaluated.push(row);
    if (result.status !== STATUS.FAIL) feasible.push(row);
    if (onProgress && i % 5 === 0) onProgress({ evaluated: i, total: candidates.length, feasible: feasible.length });
    if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const maxAs = Math.max(1, ...feasible.map(r => r.As));
  const maxCost = Math.max(1, ...feasible.map(r => r.metrics.cost));
  const maxCong = Math.max(1, ...feasible.map(r => r.metrics.congestion));
  for (const r of feasible) {
    if (objective === 'steel') r.score = r.As;
    else if (objective === 'cost') r.score = r.metrics.cost || r.As;
    else if (objective === 'congestion') r.score = r.metrics.congestion;
    else r.score = 0.5 * r.As / maxAs + 0.3 * r.metrics.cost / maxCost + 0.2 * r.metrics.congestion / maxCong + r.metrics.commonPenalty / 1000;
  }
  feasible.sort((a, b) => a.score - b.score || a.As - b.As || a.barCount - b.barCount);
  const seen = new Set();
  const alternatives = [];
  for (const r of feasible) {
    const key = `${r.candidate.cover}|${r.barDb}|${JSON.stringify(r.candidate.arrangement)}|${r.result.transverse.db}|${r.result.transverse.spacing}`;
    if (seen.has(key)) continue;
    seen.add(key);
    alternatives.push(r);
    if (alternatives.length >= (cfg.maxAlternatives ?? 8)) break;
  }
  return { objective, searchSpace: { total: candidates.length, evaluated: evaluated.length, feasible: feasible.length }, alternatives, evaluated };
}
