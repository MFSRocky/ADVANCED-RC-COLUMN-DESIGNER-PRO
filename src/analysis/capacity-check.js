/** Code-dispatched capacity verification against the actual strain-compatibility surface. */
import * as ACI from '../codes/aci318-25/section-analysis.js';
import * as BS from '../codes/bs8110-1997/section-analysis.js';
import { STATUS, check } from '../core/validation.js';
import { ConvergenceError } from '../core/validation.js';

export function getEngine(code) {
  if (code === 'ACI318-25' || code === 'ACI 318-25') {
    return {
      code: 'ACI318-25', label: 'ACI 318-25',
      solveForAxial: (s, c, st, P, angle, opts = {}) => ACI.solveForAxial(s, c, st, P, angle, { ...opts, design: true }),
      axialDesignStrength: (s, c, st, opts = {}) => ACI.axialDesignStrength(s, c, st, opts.transverseType ?? 'ties'),
      interactionCurve: ACI.interactionCurve,
      pureCompression: ACI.pureCompression,
      balancedPoint: ACI.balancedPoint,
      analyzeAt: ACI.designAt,
      tensionCapacity: (s, st, transverseType) => 0.9 * st.fy * s.As, // §22.4.3.1, φ=0.90
    };
  }
  if (code === 'BS8110-1997' || code === 'BS 8110-1:1997') {
    return {
      code: 'BS8110-1997', label: 'BS 8110-1:1997',
      solveForAxial: (s, c, st, P, angle, opts = {}) => BS.solveForAxial(s, c, st, P, angle, opts),
      axialDesignStrength: (s, c, st, opts = {}) => BS.axialDesignStrength(s, c, st, { braced: opts.braced ?? true }),
      interactionCurve: (s, c, st, angle, opts = {}) => BS.interactionCurve(s, c, st, angle, opts),
      pureCompression: BS.pureCompression,
      balancedPoint: BS.balancedPoint,
      analyzeAt: BS.analyzeAt,
      tensionCapacity: (s, st) => (1 / 1.05) * st.fy * s.As,
    };
  }
  throw new Error(`Unknown design code: ${code}`);
}

/** Biaxial design-strength contour at a fixed design axial load. */
export function biaxialContour(engine, section, concrete, steel, Pu, { angles = 72, transverseType = 'ties', braced = true, steps = 80 } = {}) {
  const points = [];
  const failures = [];
  for (let i = 0; i < angles; i++) {
    const angle = 2 * Math.PI * i / angles;
    try {
      const r = engine.solveForAxial(section, concrete, steel, Pu, angle, { transverseType, braced, steps });
      const Mx = r.design ? r.design.Mx : r.Mx;
      const My = r.design ? r.design.My : r.My;
      points.push({ angle, Mx, My, c: r.c, phi: r.phi ?? 1, Pn: r.Pn, epsT: r.epsT });
    } catch (e) {
      failures.push({ angle, message: e.message });
    }
  }
  if (points.length < Math.max(8, angles * 0.5)) {
    throw new ConvergenceError('Biaxial contour could not be generated reliably.', { failures, Pu });
  }
  return { points, failures };
}

function rayPolygonIntersection(Lx, Ly, points) {
  const loadMag = Math.hypot(Lx, Ly);
  if (loadMag < 1e-9) return { distance: Infinity, point: null };
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const A = points[i], B = points[(i + 1) % points.length];
    const crossA = Lx * A.My - Ly * A.Mx;
    const crossB = Lx * B.My - Ly * B.Mx;
    const denom = crossA - crossB;
    if (Math.abs(denom) < 1e-12) continue;
    const t = crossA / denom;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    const Px = A.Mx + t * (B.Mx - A.Mx);
    const Py = A.My + t * (B.My - A.My);
    const dot = Lx * Px + Ly * Py;
    if (dot <= 0) continue;
    const dist = Math.hypot(Px, Py);
    if (!best || dist < best.distance) best = { distance: dist, point: { Mx: Px, My: Py }, edge: i, t };
  }
  return best ?? { distance: Infinity, point: null };
}

/**
 * Verify a factored load (Pu, Mx, My) against axial cap and the actual P–Mx–My design surface.
 * Returns numerical utilization, governing direction, and PASS/FAIL check.
 */
export function checkCapacity({ code, section, concrete, steel, Pu, Mx = 0, My = 0, transverseType = 'ties', braced = true, angles = 72, steps = 80, clause }) {
  const engine = getEngine(code);
  const axial = engine.axialDesignStrength(section, concrete, steel, { transverseType, braced });
  const axialCap = code.startsWith('ACI') ? axial.phiPnMax : axial.governing;
  const tensionCap = engine.tensionCapacity(section, steel, transverseType);
  const checks = [];
  let axialUtil = 0, tensionUtil = 0;
  if (Pu >= 0) {
    axialUtil = axialCap > 0 ? Pu / axialCap : Infinity;
    checks.push(check('axial', 'Axial compression capacity', axialUtil <= 1 ? STATUS.PASS : STATUS.FAIL, Pu, axialCap, 'N', clause ?? (code.startsWith('ACI') ? 'ACI Table 22.4.2.1 / §21.2' : 'BS §3.8.4.3–4'), `Pu / Ncap = ${axialUtil.toFixed(3)}`, { axial }));
  } else {
    tensionUtil = tensionCap > 0 ? -Pu / tensionCap : Infinity;
    checks.push(check('tension', 'Axial tension capacity', tensionUtil <= 1 ? STATUS.PASS : STATUS.FAIL, -Pu, tensionCap, 'N', code.startsWith('ACI') ? 'ACI §22.4.3.1' : 'BS §3.8.4 / Fig. 2.2', `|Pu| / Nt = ${tensionUtil.toFixed(3)}`));
  }
  const momentMag = Math.hypot(Mx, My);
  if (momentMag < 1e-6) {
    const status = axialUtil <= 1 && tensionUtil <= 1 ? STATUS.PASS : STATUS.FAIL;
    return { status, utilization: Math.max(axialUtil, tensionUtil), axialUtil, tensionUtil, momentUtil: 0, checks, surface: null, capacityPoint: null, governingAngle: null, axialCap, tensionCap };
  }
  let surface;
  try {
    surface = biaxialContour(engine, section, concrete, steel, Pu, { angles, transverseType, braced, steps });
  } catch (e) {
    checks.push(check('biaxial', 'Biaxial capacity surface', STATUS.FAIL, momentMag, null, 'N·mm', clause ?? 'Strain compatibility', e.message));
    return { status: STATUS.FAIL, utilization: Infinity, axialUtil, tensionUtil, momentUtil: Infinity, checks, surface: null, capacityPoint: null, governingAngle: null, axialCap, tensionCap, error: e.message };
  }
  const hit = rayPolygonIntersection(Mx, My, surface.points);
  const momentUtil = hit.distance > 0 && Number.isFinite(hit.distance) ? momentMag / hit.distance : Infinity;
  const ok = momentUtil <= 1 + 1e-6 && axialUtil <= 1 + 1e-6 && tensionUtil <= 1 + 1e-6;
  const governingAngle = Math.atan2(My, Mx);
  checks.push(check('biaxial', 'Biaxial P–Mx–My capacity', ok ? STATUS.PASS : STATUS.FAIL, momentMag, hit.distance, 'N·mm', clause ?? (code.startsWith('ACI') ? 'ACI §22.4 / §22.2 strain compatibility' : 'BS §3.8.4 / Fig. 3.3 strain compatibility'), `Moment utilization = ${momentUtil.toFixed(3)}; load direction θ = ${(governingAngle * 180 / Math.PI).toFixed(1)}°`, { hit, surfaceAngles: surface.points.length }));
  return {
    status: ok ? STATUS.PASS : STATUS.FAIL,
    utilization: Math.max(axialUtil, tensionUtil, momentUtil),
    axialUtil, tensionUtil, momentUtil, checks, surface,
    capacityPoint: hit.point, governingAngle, axialCap, tensionCap,
  };
}
