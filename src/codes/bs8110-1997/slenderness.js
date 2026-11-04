/** BS 8110-1:1997 slenderness, effective height, additional moments (§3.8.1–3.8.3). */
import { positive, nonNegative, UnsupportedError, STATUS, check } from '../../core/validation.js';
import { clamp } from '../../core/numerical-solver.js';
import { biaxialBeta, CONCRETE_STRESS_FACTOR, STEEL_STRESS_FACTOR } from './materials.js';

// Table 3.19 — braced columns. End conditions: 1 fully restrained, 2 partially restrained, 3 nominally restrained.
const BRACED_BETA = {
  '1-1': 0.75, '1-2': 0.80, '1-3': 0.90,
  '2-1': 0.80, '2-2': 0.85, '2-3': 0.95,
  '3-1': 0.90, '3-2': 0.95, '3-3': 1.00,
};

export function effectiveHeight(section, height = {}) {
  const lo = positive(height.clear ?? height.lo ?? 3000, 'clear height lo', { min: 100, max: 50000 });
  const braced = height.braced !== false;
  const topX = String(height.endTopX ?? 1), botX = String(height.endBottomX ?? 1);
  const topY = String(height.endTopY ?? 1), botY = String(height.endBottomY ?? 1);
  let betaX, betaY, assumedUnbraced = false;
  if (height.lex !== undefined && height.ley !== undefined) {
    return { lo, braced, lex: positive(height.lex, 'lex'), ley: positive(height.ley, 'ley'), betaX: height.lex / lo, betaY: height.ley / lo, rigorous: true };
  }
  if (braced) {
    betaX = BRACED_BETA[`${topX}-${botX}`];
    betaY = BRACED_BETA[`${topY}-${botY}`];
    if (betaX === undefined || betaY === undefined) throw new UnsupportedError('BS end conditions must be 1, 2 or 3 for Table 3.19.', 'Table 3.19');
  } else {
    // Conservative upper bound for unbraced columns when rigorous lex/ley are not supplied.
    betaX = height.betaX ?? 2.2;
    betaY = height.betaY ?? 2.2;
    assumedUnbraced = height.betaX === undefined || height.betaY === undefined;
  }
  return { lo, braced, lex: height.lex ?? betaX * lo, ley: height.ley ?? betaY * lo, betaX, betaY, assumedUnbraced };
}

function effectiveDepth(section, axis, tieDb) {
  const maxBar = Math.max(...section.bars.map(b => b.db));
  const offset = section.cover + tieDb + maxBar / 2;
  if (section.shape === 'circle') return section.D - offset;
  return axis === 'x' ? section.h - offset : section.b - offset;
}

function axisDesign({ section, concrete, steel, eff, axis, load, tieDb }) {
  const isX = axis === 'x';
  const hAxis = section.shape === 'circle' ? section.D : (isX ? section.h : section.b);
  const le = isX ? eff.lex : eff.ley;
  const ratio = le / hAxis;
  const limit = eff.braced ? 15 : 10;
  const short = ratio < limit;
  const N = load.Pu ?? 0;
  const emin = Math.min(0.05 * hAxis, 20); // §3.8.2.4
  const Mmin = N > 0 ? N * emin : 0;
  const M2raw = isX ? (load.M2x ?? load.Mx ?? 0) : (load.M2y ?? load.My ?? 0);
  const M1raw = isX ? (load.M1x ?? 0) : (load.M1y ?? 0);
  const M2 = Math.abs(M2raw), M1 = Math.abs(M1raw);
  const curvature = load.curvature ?? (isX ? load.curvatureX : load.curvatureY) ?? 'single';
  const M1s = curvature === 'double' ? -M1 : M1;
  const M2s = M2;
  const steps = [];
  steps.push({ label: `Slenderness ${axis}`, equation: 'le / h', substitution: `${le.toFixed(1)} / ${hAxis}`, value: ratio, unit: '—', clause: '§3.8.1.3' });
  let Madd = 0, K = 1, betaA = 0, au = 0, Nuz = null, Nbal = null;
  if (!short) {
    const bmin = section.shape === 'circle' ? section.D : Math.min(section.b, section.h);
    const hmax = section.shape === 'circle' ? section.D : Math.max(section.b, section.h);
    const loLimit = Math.min(60 * bmin, 100 * bmin * bmin / hmax);
    if (eff.lo > loLimit) throw new UnsupportedError(`Clear height ${eff.lo} mm exceeds BS slenderness limit ${loLimit.toFixed(0)} mm.`, '§3.8.1.3 / §3.8.3');
    if (N <= 0) throw new UnsupportedError('BS slender additional moments require compression N > 0.', '§3.8.3.1');
    const Ac = section.Ag - section.As;
    Nuz = CONCRETE_STRESS_FACTOR * concrete.fcu * Ac + STEEL_STRESS_FACTOR * steel.fy * section.As;
    const d = effectiveDepth(section, axis, tieDb);
    const bPerp = section.shape === 'circle' ? section.D : (isX ? section.b : section.h);
    Nbal = section.shape === 'circle' ? null : 0.25 * concrete.fcu * bPerp * d;
    if (Nbal !== null && Nuz > Nbal) K = clamp((Nuz - N) / (Nuz - Nbal), 0, 1);
    else K = 1; // conservative for circular / undefined Nbal
    betaA = (le / hAxis) ** 2 / 2000; // Eq. 34
    au = betaA * K * hAxis;
    Madd = N * au; // Eq. 35
    steps.push({ label: `βa ${axis}`, equation: '(le/h)²/2000', substitution: `(${le.toFixed(1)}/${hAxis})²/2000`, value: betaA, unit: '—', clause: 'Eq. 34' });
    steps.push({ label: `K ${axis}`, equation: '(Nuz−N)/(Nuz−Nbal) ≤ 1', substitution: Nbal === null ? 'K=1 (circular, conservative)' : `(${Nuz.toFixed(0)}−${N.toFixed(0)})/(${Nuz.toFixed(0)}−${Nbal.toFixed(0)})`, value: K, unit: '—', clause: 'Eq. 33' });
    steps.push({ label: `Madd ${axis}`, equation: 'N·βa·K·h', substitution: `${N.toFixed(0)}×${betaA.toFixed(4)}×${K.toFixed(3)}×${hAxis}`, value: Madd, unit: 'N·mm', clause: 'Eq. 35' });
  }
  let Mdesign;
  if (short) {
    Mdesign = Math.max(M2, Mmin);
  } else if (eff.braced) {
    const Mi = Math.max(0.4 * M1s + 0.6 * M2s, 0.4 * M2s);
    const candidates = [M2, Mi + Madd, M1s + Madd / 2, Mmin];
    Mdesign = Math.max(...candidates.map(Math.abs));
    steps.push({ label: `Design moment ${axis}`, equation: 'max(M2, Mi+Madd, M1+Madd/2, N·emin)', substitution: `max(${M2.toFixed(0)}, ${(Mi + Madd).toFixed(0)}, ${(M1s + Madd / 2).toFixed(0)}, ${Mmin.toFixed(0)})`, value: Mdesign, unit: 'N·mm', clause: '§3.8.3.2 / Fig. 3.20' });
  } else {
    // Conservative: full additional moment at both ends (no stiffness-proportion reduction).
    Mdesign = Math.max(M2 + Madd, M1 + Madd, Mmin);
    steps.push({ label: `Design moment ${axis} (unbraced)`, equation: 'max(M2+Madd, M1+Madd, N·emin)', substitution: `max(${(M2 + Madd).toFixed(0)}, ${(M1 + Madd).toFixed(0)}, ${Mmin.toFixed(0)})`, value: Mdesign, unit: 'N·mm', clause: '§3.8.3.7 / Fig. 3.21 (conservative)' });
  }
  const sign = Math.sign(M2raw || 1);
  return { axis, le, hAxis, ratio, limit, short, emin, Mmin, Madd, K, betaA, au, Nuz, Nbal, Mdesign: Mdesign * sign, steps, classification: short ? 'Short' : 'Slender' };
}

export function assessSlenderness({ section, concrete, steel, height, load, tieDb = 10 }) {
  const eff = effectiveHeight(section, height);
  const x = axisDesign({ section, concrete, steel, eff, axis: 'x', load, tieDb });
  const y = axisDesign({ section, concrete, steel, eff, axis: 'y', load, tieDb });
  const checks = [];
  if (eff.assumedUnbraced) checks.push(check('bs-le-assumed', 'Unbraced effective height', STATUS.WARNING, null, null, 'mm', 'Table 3.20', 'Unbraced le taken conservatively as 2.2lo. Provide rigorous lex/ley from BS 8110-2 §2.5 for economy.'));
  checks.push(check('bs-slender-x', 'Slenderness about X', STATUS.INFO, x.ratio, x.limit, '—', '§3.8.1.3', `${x.classification}; le/h = ${x.ratio.toFixed(2)} (limit ${x.limit})`));
  checks.push(check('bs-slender-y', 'Slenderness about Y', STATUS.INFO, y.ratio, y.limit, '—', '§3.8.1.3', `${y.classification}; le/b = ${y.ratio.toFixed(2)} (limit ${y.limit})`));
  return { eff, x, y, checks, designMx: x.Mdesign, designMy: y.Mdesign, slender: !x.short || !y.short };
}

/** BS 8110-1:1997 §3.8.4.5 equivalent uniaxial moment for rectangular biaxial bending. */
export function equivalentUniaxial({ section, concrete, N, Mx, My, tieDb = 10 }) {
  const absX = Math.abs(Mx), absY = Math.abs(My);
  if (section.shape === 'circle') {
    return { axis: 'resultant', Mdesign: Math.hypot(absX, absY), beta: null, clause: '§3.8.4.5 (circular: resolve moments)' };
  }
  const hPrime = effectiveDepth(section, 'x', tieDb);
  const bPrime = effectiveDepth(section, 'y', tieDb);
  const nRatio = N / (section.b * section.h * concrete.fcu);
  const beta = biaxialBeta(nRatio);
  if (absX / hPrime >= absY / bPrime) {
    return { axis: 'x', Mdesign: absX + beta * (hPrime / bPrime) * absY, beta, hPrime, bPrime, nRatio, clause: '§3.8.4.5 Eq. 40' };
  }
  return { axis: 'y', Mdesign: absY + beta * (bPrime / hPrime) * absX, beta, hPrime, bPrime, nRatio, clause: '§3.8.4.5 Eq. 41' };
}
