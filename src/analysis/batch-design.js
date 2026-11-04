/** Batch column design with project-wide summary. */
import { designColumn } from './design-column.js';
import { STATUS } from '../core/validation.js';
import { steelWeightKg } from '../core/geometry.js';

export async function designBatch(columns, { angles = 48, onProgress, defaultCode = 'ACI318-25' } = {}) {
  const results = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    try {
      const result = designColumn({ code: col.code ?? defaultCode, ...col.input }, { angles });
      results.push({ id: col.id, mark: col.mark, floor: col.floor, grid: col.grid, zone: col.zone, status: result.status, result });
    } catch (e) {
      results.push({ id: col.id, mark: col.mark, floor: col.floor, grid: col.grid, zone: col.zone, status: STATUS.FAIL, error: e.message });
    }
    if (onProgress) onProgress({ done: i + 1, total: columns.length, mark: col.mark });
    await new Promise(r => setTimeout(r, 0));
  }
  const passing = results.filter(r => r.status === STATUS.PASS).length;
  const warning = results.filter(r => r.status === STATUS.WARNING).length;
  const failing = results.filter(r => r.status === STATUS.FAIL).length;
  const totalSteel = results.reduce((s, r) => {
    if (!r.result) return s;
    const height = r.result.height?.clear ?? 3000;
    return s + steelWeightKg(r.result.section.As, height);
  }, 0);
  const governing = results.reduce((best, r) => {
    const u = r.result?.summary?.utilization ?? -1;
    return (!best || u > (best.result?.summary?.utilization ?? -1)) ? r : best;
  }, null);
  return { results, summary: { total: results.length, passing, warning, failing, needsOptimization: failing + warning, totalSteelKg: totalSteel, governing } };
}

export function batchCSV(results) {
  const lines = ['mark,floor,grid,zone,code,status,As_mm2,rho_pct,bars,utilization,governing_load,axial_capacity_N,error'];
  for (const r of results) {
    const s = r.result?.summary;
    lines.push([r.mark, r.floor ?? '', r.grid ?? '', r.zone ?? '', r.result?.codeLabel ?? '', r.status, s?.As?.toFixed(1) ?? '', s ? (s.rho * 100).toFixed(2) : '', s?.barCount ?? '', s?.utilization?.toFixed(3) ?? '', s?.governingLoad ?? '', s?.axialCapacity?.toFixed(0) ?? '', r.error ?? ''].join(','));
  }
  return lines.join('\n');
}
