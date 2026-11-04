/**
 * ACI 318-25 strain-compatibility section analysis.
 * Independent implementation: Whitney block §22.2.2.4, φ Table 21.2.2 + §21.2.2.3 cap.
 * Internal units N, mm, MPa. Compression positive. Mx = ΣF·y, My = ΣF·x about section centroid.
 */
import { compressionRegion, sectionExtent } from '../../core/geometry.js';
import { bisection, scanRoots, clamp } from '../../core/numerical-solver.js';
import { ConvergenceError } from '../../core/validation.js';
import { EPS_CU, CONCRETE_STRESS_FACTOR, beta1, phiFromStrain, applyPhiCap, phiCompression } from './materials.js';

function normalFromAngle(angle) {
  // angle is the direction of the compression-face normal measured from +x axis.
  return { nx: Math.cos(angle), ny: Math.sin(angle) };
}

export function nominalAt(section, concrete, steel, c, angle = Math.PI / 2) {
  if (!(c > 0) || !Number.isFinite(c)) throw new ConvergenceError(`Invalid neutral axis depth c=${c}`);
  const { nx, ny } = normalFromAngle(angle);
  const edge = sectionExtent(section, nx, ny);
  const b1 = concrete.beta1 ?? beta1(concrete.fc);
  const a = b1 * c;
  const t = edge - a;
  const region = compressionRegion(section, nx, ny, t);
  const fcc = CONCRETE_STRESS_FACTOR * concrete.fc;
  let C = fcc * region.area;
  let Mx_c = C * region.cy;
  let My_c = C * region.cx;
  const steelDetails = [];
  let P_s = 0, Mx_s = 0, My_s = 0;
  let epsMin = Infinity;
  for (const bar of section.bars) {
    const proj = nx * bar.x + ny * bar.y;
    const eps = EPS_CU * (proj - (edge - c)) / c; // compression positive
    const fs = clamp(steel.Es * eps, -steel.fy, steel.fy);
    let force = fs * bar.As;
    // Deduct concrete displaced by compression reinforcement within the stress block (§22.2.2.4.1).
    if (proj >= t) {
      const displaced = fcc * bar.As;
      C -= displaced; Mx_c -= displaced * bar.y; My_c -= displaced * bar.x;
    }
    P_s += force; Mx_s += force * bar.y; My_s += force * bar.x;
    if (eps < epsMin) epsMin = eps;
    steelDetails.push({ x: bar.x, y: bar.y, db: bar.db, As: bar.As, eps, fs, force });
  }
  const Pn = C + P_s;
  const Mx = Mx_c + Mx_s;
  const My = My_c + My_s;
  const epsT = Math.max(0, -epsMin);
  return { c, a, angle, nx, ny, edge, t, concrete: { area: region.area, cx: region.cx, cy: region.cy, force: C, Mx: Mx_c, My: My_c }, steel: steelDetails, Pn, Mx, My, epsT };
}

export function balancedPoint(section, concrete, steel, angle = Math.PI / 2) {
  const { nx, ny } = normalFromAngle(angle);
  const edge = sectionExtent(section, nx, ny);
  let dt = 0;
  for (const bar of section.bars) dt = Math.max(dt, edge - (nx * bar.x + ny * bar.y));
  const epsTy = steel.fy / steel.Es;
  const cBal = EPS_CU / (EPS_CU + epsTy) * dt;
  const n = nominalAt(section, concrete, steel, cBal, angle);
  return { ...n, cBal, dt, epsTy };
}

export function designAt(section, concrete, steel, c, angle = Math.PI / 2, transverseType = 'ties') {
  const n = nominalAt(section, concrete, steel, c, angle);
  const phiTable = phiFromStrain(n.epsT, steel.fy, steel.Es, transverseType);
  const bal = balancedPoint(section, concrete, steel, angle);
  const cap = applyPhiCap(phiTable, n.Pn, bal.Pn, concrete.fc, section.Ag, transverseType);
  return {
    ...n, phiTable, phi: cap.phi, phiCapped: cap.capped, phiCap: cap.phiCap, PnBal: bal.Pn,
    design: { P: cap.phi * n.Pn, Mx: cap.phi * n.Mx, My: cap.phi * n.My },
  };
}

export function pureCompression(section, concrete, steel) {
  const P0 = CONCRETE_STRESS_FACTOR * concrete.fc * (section.Ag - section.As) + steel.fy * section.As;
  return { P0, Mx: 0, My: 0 };
}

export function axialDesignStrength(section, concrete, steel, transverseType = 'ties') {
  const { P0 } = pureCompression(section, concrete, steel);
  const cap = transverseType === 'spiral' ? 0.85 : 0.80; // Table 22.4.2.1
  const phi = phiCompression(transverseType);
  return { P0, PnMax: cap * P0, phiPnMax: phi * cap * P0, capFactor: cap, phi };
}

/** Solve for c such that design axial strength equals Ptarget at a given normal angle. */
export function solveForAxial(section, concrete, steel, Ptarget, angle = Math.PI / 2, { transverseType = 'ties', design = true, steps = 100 } = {}) {
  const edgeMax = section.shape === 'circle' ? section.D / 2 : Math.hypot(section.b, section.h) / 2;
  const cMin = 1e-4, cMax = edgeMax * 12;
  const f = c => {
    const r = design ? designAt(section, concrete, steel, c, angle, transverseType).design.P : nominalAt(section, concrete, steel, c, angle).Pn;
    return r - Ptarget;
  };
  const fMin = f(cMin), fMax = f(cMax);
  if (fMin > 0 || fMax < 0) {
    throw new ConvergenceError(`Axial target ${Ptarget} N is outside the section capacity range at angle ${angle}.`, { fMin, fMax, Ptarget });
  }
  let root;
  if (design) {
    const roots = scanRoots(f, cMin, cMax, { steps, tol: 1e-7 });
    if (!roots.length) throw new ConvergenceError('No design axial equilibrium root found.', { Ptarget, angle });
    root = roots[roots.length - 1];
  } else {
    root = bisection(f, cMin, cMax, { tol: 1e-7, maxIter: 200 }).root;
  }
  const result = design ? designAt(section, concrete, steel, root, angle, transverseType) : nominalAt(section, concrete, steel, root, angle);
  const achieved = design ? result.design.P : result.Pn;
  return { ...result, residual: achieved - Ptarget, convergence: { converged: true, root, target: Ptarget } };
}

/** Generate a uniaxial P–M curve (nominal + design) for a given normal angle. */
export function interactionCurve(section, concrete, steel, angle = Math.PI / 2, { transverseType = 'ties', points = 120 } = {}) {
  const edgeMax = section.shape === 'circle' ? section.D / 2 : Math.hypot(section.b, section.h) / 2;
  const cMax = edgeMax * 12;
  const cs = [];
  // Dense sampling through the transition region, plus logarithmic tails.
  for (let i = 0; i < points; i++) {
    const u = i / (points - 1);
    cs.push(1e-3 * Math.pow(cMax / 1e-3, u));
  }
  const rows = cs.map(c => {
    const d = designAt(section, concrete, steel, c, angle, transverseType);
    return { c, a: d.a, Pn: d.Pn, Mn: Math.hypot(d.Mx, d.My), Mx_n: d.Mx, My_n: d.My, phi: d.phi, Pd: d.design.P, Mxd: d.design.Mx, Myd: d.design.My, Md: Math.hypot(d.design.Mx, d.design.My), epsT: d.epsT, phiCapped: d.phiCapped };
  });
  const bal = balancedPoint(section, concrete, steel, angle);
  const balD = designAt(section, concrete, steel, bal.cBal, angle, transverseType);
  const pure = pureCompression(section, concrete, steel);
  const axial = axialDesignStrength(section, concrete, steel, transverseType);
  let pureBending = null;
  try {
    const pb = solveForAxial(section, concrete, steel, 0, angle, { transverseType, design: true });
    pureBending = { Pn: pb.Pn, Mn: Math.hypot(pb.Mx, pb.My), Pd: pb.design.P, Md: Math.hypot(pb.design.Mx, pb.design.My), phi: pb.phi, c: pb.c };
  } catch { /* section may not reach zero axial within numeric range */ }
  return { angle, rows, balanced: { c: bal.cBal, Pn: bal.Pn, Mn: Math.hypot(bal.Mx, bal.My), Pd: balD.design.P, Md: Math.hypot(balD.design.Mx, balD.design.My), phi: balD.phi }, pureCompression: { P0: pure.P0, phiP0: axial.phi * pure.P0, phiPnMax: axial.phiPnMax }, pureBending };
}
