/**
 * RC Column Designer Pro — validated SI conversions.
 * Internal units: N, mm, MPa (N/mm²), mm², mm⁴, kg/m³.
 */
export class UnitError extends Error {
  constructor(message) { super(message); this.name = 'UnitError'; }
}

const FACTORS = {
  length: { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 },
  force: { N: 1, kN: 1000, MN: 1e6, kgf: 9.80665, tonf: 9806.65 },
  moment: { 'N·mm': 1, 'N.mm': 1, Nmm: 1, 'kN·m': 1e6, 'kN.m': 1e6, kNm: 1e6, 'N·m': 1000, Nm: 1000 },
  stress: { MPa: 1, 'N/mm²': 1, 'N/mm2': 1, kPa: 0.001, kN: 0.001, Pa: 1e-6, GPa: 1000, psi: 0.006894757293168, ksi: 6.894757293168 },
  area: { 'mm²': 1, mm2: 1, 'cm²': 100, cm2: 100, 'm²': 1e6, m2: 1e6, 'in²': 645.16, in2: 645.16 },
  inertia: { 'mm⁴': 1, mm4: 1, 'cm⁴': 1e4, cm4: 1e4, 'm⁴': 1e12, m4: 1e12, 'in⁴': 416231.4256, in4: 416231.4256 },
  density: { 'kg/m³': 1, 'kg/m3': 1, 't/m³': 1000, 't/m3': 1000, 'lb/ft³': 16.01846337396, 'lb/ft3': 16.01846337396 },
};

export function convert(value, from, to, dimension) {
  if (!Number.isFinite(value)) throw new UnitError(`Cannot convert non-finite value: ${value}`);
  const table = FACTORS[dimension];
  if (!table) throw new UnitError(`Unknown dimension: ${dimension}`);
  if (!(from in table) || !(to in table)) throw new UnitError(`Unknown ${dimension} unit: ${from} → ${to}`);
  return value * table[from] / table[to];
}

export const kNToN = v => convert(v, 'kN', 'N', 'force');
export const NToKN = v => convert(v, 'N', 'kN', 'force');
export const kNmToNmm = v => convert(v, 'kN.m', 'N.mm', 'moment');
export const NmmToKNm = v => convert(v, 'N.mm', 'kN.m', 'moment');
export const mToMm = v => convert(v, 'm', 'mm', 'length');
export const mmToM = v => convert(v, 'mm', 'm', 'length');
export const MPaToPsi = v => convert(v, 'MPa', 'psi', 'stress');
export const psiToMPa = v => convert(v, 'psi', 'MPa', 'stress');

/** Format a number for engineering display without losing internal precision. */
export function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) return value.toExponential(digits);
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function round(value, digits = 6) {
  if (!Number.isFinite(value)) return value;
  const p = 10 ** digits;
  return Math.round((value + Number.EPSILON) * p) / p;
}
