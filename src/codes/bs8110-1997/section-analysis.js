/**
 * BS 8110-1:1997 strain-compatibility section analysis (Amendment No. 6).
 * Independent implementation: Fig. 3.3 simplified block 0.45fcu over 0.9x,
 * reinforcement design stress fy/1.05 ≈ 0.95fy, εcu = 0.0035.
 * Forces returned are DESIGN strengths (material partial factors already applied).
 */
import { compressionRegion, sectionExtent } from '../../core/geometry.js';
import { bisection, clamp } from '../../core/numerical-solver.js';
import { ConvergenceError } from '../../core/validation.js';
import { EPS_CU, CONCRETE_STRESS_FACTOR, BLOCK_DEPTH_FACTOR, STEEL_STRESS_FACTOR } from './materials.js';

function normalFromAngle(angle) { return { nx: Math.cos(angle), ny: Math.sin(angle) }; }

export function analyzeAt(section, concrete, steel, c, angle = Math.PI / 2) {
  if (!(c > 0) || !Number.isFinite(c)) throw new ConvergenceError(`Invalid neutral axis depth x=${c}`);
  const { nx, ny } = normalFromAngle(angle);
  const edge = sectionExtent(section, nx, ny);
  const a = BLOCK_DEPTH_FACTOR * c;
  const t = edge - a;
  const region = compressionRegion(section, nx, ny, t);
  const fcc = CONCRETE_STRESS_FACTOR * concrete.fcu;
  const fsd = STEEL_STRESS_FACTOR * steel.fy;
  let C = fcc * region.area;
  let Mx_c = C * region.cy, My_c = C * region.cx;
  const steelDetails = [];
  let P_s = 0, Mx_s = 0, My_s = 0, epsMin = Infinity;
  for (const bar of section.bars) {
    const proj = nx * bar.x + ny * bar.y;
    const eps = EPS_CU * (proj - (edge - c)) / c;
    const fs = clamp(steel.Es * eps, -fsd, fsd);
    const force = fs * bar.As;
    // Conservative net-concrete treatment: deduct concrete displaced by compression bars.
    if (proj >= t) {
      const displaced = fcc * bar.As;
      C -= displaced; Mx_c -= displaced * bar.y; My_c -= displaced * bar.x;
    }
    P_s += force; Mx_s += force * bar.y; My_s += force * bar.x;
    if (eps < epsMin) epsMin = eps;
    steelDetails.push({ x: bar.x, y: bar.y, db: bar.db, As: bar.As, eps, fs, force });
  }
  const P = C + P_s, Mx = Mx_c + Mx_s, My = My_c + My_s;
  return { c, x: c, a, angle, nx, ny, edge, t, concrete: { area: region.area, cx: region.cx, cy: region.cy, force: C, Mx: Mx_c, My: My_c }, steel: steelDetails, Pn: P, Mx, My, P, epsT: Math.max(0, -epsMin), phi: 1.0, design: { P, Mx, My } };
}

export function balancedPoint(section, concrete, steel, angle = Math.PI / 2) {
  const { nx, ny } = normalFromAngle(angle);
  const edge = sectionExtent(section, nx, ny);
  let dt = 0;
  for (const bar of section.bars) dt = Math.max(dt, edge - (nx * bar.x + ny * bar.y));
  const epsY = STEEL_STRESS_FACTOR * steel.fy / steel.Es;
  const cBal = EPS_CU / (EPS_CU + epsY) * dt;
  return { ...analyzeAt(section, concrete, steel, cBal, angle), cBal, dt, epsY };
}

export function pureCompression(section, concrete, steel) {
  // Rigorous section value with design stresses and net concrete area.
  const P0 = CONCRETE_STRESS_FACTOR * concrete.fcu * (section.Ag - section.As) + STEEL_STRESS_FACTOR * steel.fy * section.As;
  return { P0, Mx: 0, My: 0 };
}

/** Simplified short-column axial caps, BS 8110-1:1997 §3.8.4.3 / §3.8.4.4. */
export function axialDesignStrength(section, concrete, steel, { braced = true } = {}) {
  const Ac = section.Ag - section.As;
  const N3843 = 0.4 * concrete.fcu * Ac + 0.8 * steel.fy * section.As;
  const N3844 = 0.35 * concrete.fcu * Ac + 0.7 * steel.fy * section.As;
  const Nuz = CONCRETE_STRESS_FACTOR * concrete.fcu * Ac + STEEL_STRESS_FACTOR * steel.fy * section.As;
  const governing = braced ? Math.min(N3843, N3844) : N3844;
  return { N3843, N3844, Nuz, governing, clause: braced ? '§3.8.4.3 / §3.8.4.4 (lower bound)' : '§3.8.4.4' };
}

export function solveForAxial(section, concrete, steel, Ptarget, angle = Math.PI / 2, { steps = 100 } = {}) {
  const edgeMax = section.shape === 'circle' ? section.D / 2 : Math.hypot(section.b, section.h) / 2;
  const cMin = 1e-4, cMax = edgeMax * 12;
  const f = c => analyzeAt(section, concrete, steel, c, angle).P - Ptarget;
  const fMin = f(cMin), fMax = f(cMax);
  if (fMin > 0 || fMax < 0) throw new ConvergenceError(`Axial target ${Ptarget} N outside BS section capacity range.`, { fMin, fMax, Ptarget });
  const root = bisection(f, cMin, cMax, { tol: 1e-7, maxIter: 200 }).root;
  const result = analyzeAt(section, concrete, steel, root, angle);
  return { ...result, residual: result.P - Ptarget, convergence: { converged: true, root, target: Ptarget } };
}

export function interactionCurve(section, concrete, steel, angle = Math.PI / 2, { points = 120 } = {}) {
  const edgeMax = section.shape === 'circle' ? section.D / 2 : Math.hypot(section.b, section.h) / 2;
  const cMax = edgeMax * 12;
  const rows = [];
  for (let i = 0; i < points; i++) {
    const u = i / (points - 1);
    const c = 1e-3 * Math.pow(cMax / 1e-3, u);
    const d = analyzeAt(section, concrete, steel, c, angle);
    rows.push({ c, a: d.a, Pn: d.P, Mn: Math.hypot(d.Mx, d.My), Mx_n: d.Mx, My_n: d.My, phi: 1, Pd: d.P, Mxd: d.Mx, Myd: d.My, Md: Math.hypot(d.Mx, d.My), epsT: d.epsT, phiCapped: false });
  }
  const bal = balancedPoint(section, concrete, steel, angle);
  const axial = axialDesignStrength(section, concrete, steel);
  let pureBending = null;
  try {
    const pb = solveForAxial(section, concrete, steel, 0, angle);
    pureBending = { Pn: pb.P, Mn: Math.hypot(pb.Mx, pb.My), Pd: pb.P, Md: Math.hypot(pb.Mx, pb.My), phi: 1, c: pb.c };
  } catch { }
  return { angle, rows, balanced: { c: bal.cBal, Pn: bal.P, Mn: Math.hypot(bal.Mx, bal.My), Pd: bal.P, Md: Math.hypot(bal.Mx, bal.My), phi: 1 }, pureCompression: { P0: axial.Nuz, phiP0: axial.Nuz, phiPnMax: axial.governing }, pureBending };
}
