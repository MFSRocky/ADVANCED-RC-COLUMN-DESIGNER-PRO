/** ACI 318-25 slenderness and moment magnification (§6.2.5, §6.6.4). Nonsway + sway story magnifier. */
import { positive, nonNegative, finite, UnsupportedError, STATUS, check } from '../../core/validation.js';
import { clamp } from '../../core/numerical-solver.js';

export function effectiveLengths(section, height = {}) {
  const clear = positive(height.clear ?? height.lu ?? 3000, 'clear height', { min: 100, max: 50000 });
  const braced = height.braced !== false;
  const kx = height.kx !== undefined ? positive(height.kx, 'kx', { min: 0.1, max: 10 }) : (braced ? 1.0 : 1.2);
  const ky = height.ky !== undefined ? positive(height.ky, 'ky', { min: 0.1, max: 10 }) : (braced ? 1.0 : 1.2);
  const lex = height.lex !== undefined ? positive(height.lex, 'lex') : kx * clear;
  const ley = height.ley !== undefined ? positive(height.ley, 'ley') : ky * clear;
  return { clear, braced, kx, ky, lex, ley, kAssumed: height.kx === undefined || height.ky === undefined };
}

function axisSlenderness({ section, eff, axis, load, concrete, steel }) {
  const isX = axis === 'x';
  const r = isX ? section.rx : section.ry;
  const le = isX ? eff.lex : eff.ley;
  const klu_r = le / r;
  const hAxis = section.shape === 'circle' ? section.D : (isX ? section.h : section.b);
  const M2raw = isX ? (load.M2x ?? load.Mx ?? 0) : (load.M2y ?? load.My ?? 0);
  const M1raw = isX ? (load.M1x ?? 0) : (load.M1y ?? 0);
  const M2 = Math.abs(M2raw), M1 = Math.abs(M1raw);
  // ACI sign convention: M1/M2 positive for double curvature, negative for single.
  const ratio = M2 > 1e-9 ? clamp(M1raw / M2raw, -1, 1) : 1;
  const limit = eff.braced ? Math.min(40, 34 - 12 * ratio) : 22;
  const short = klu_r <= 22 || (eff.braced && klu_r <= limit);
  const steps = [];
  steps.push({ label: `Slenderness ratio ${axis}`, equation: 'k·lu / r', substitution: `${le.toFixed(1)} / ${r.toFixed(2)}`, value: klu_r, unit: '—', clause: '§6.2.5.1 / §6.6.4.5.1' });
  if (klu_r > 100) throw new UnsupportedError(`k·lu/r = ${klu_r.toFixed(1)} > 100 about ${axis}; ACI moment magnification is not applicable. A second-order analysis is required.`, '§6.6.4.1');
  const Pu = load.Pu ?? 0;
  const M2min = Pu > 0 ? Pu * (15 + 0.03 * hAxis) : 0; // §6.6.4.5.4, SI mm
  let Mc = M2raw, delta = 1, Cm = 1, Pc = Infinity, EI = null, betaDns = 0;
  if (!short && eff.braced) {
    if (Pu <= 0) throw new UnsupportedError('Slender nonsway magnification requires compression Pu > 0.', '§6.6.4.5');
    betaDns = load.betaDns !== undefined ? nonNegative(load.betaDns, 'betaDns', { max: 1 }) : (load.sustainedPu !== undefined ? clamp(load.sustainedPu / Pu, 0, 1) : 0.6);
    const Ig = isX ? section.Ix : section.Iy;
    const Ise = isX ? section.Ise_x : section.Ise_y;
    EI = (0.2 * concrete.Ec * Ig + steel.Es * Ise) / (1 + betaDns); // §6.6.4.4.4(b)
    Pc = Math.PI ** 2 * EI / (le ** 2); // §6.6.4.4.2
    const transverseLoads = isX ? load.transverseLoadsX : load.transverseLoadsY;
    Cm = transverseLoads ? 1.0 : Math.max(0.4, 0.6 + 0.4 * ratio); // §6.6.4.5.3
    const denom = 1 - Pu / (0.75 * Pc);
    if (denom <= 0) throw new UnsupportedError(`Pu ≥ 0.75Pc about ${axis}; member is unstable by moment magnification.`, '§6.6.4.5.2');
    delta = Math.max(1.0, Cm / denom); // §6.6.4.5.2
    const M2use = Math.max(M2, M2min);
    Mc = delta * M2use * Math.sign(M2raw || 1);
    steps.push({ label: `EI_eff ${axis}`, equation: '(0.2EcIg + EsIse)/(1+βdns)', substitution: `(0.2×${concrete.Ec.toFixed(0)}×${Ig.toExponential(3)} + ${steel.Es}×${Ise.toExponential(3)})/(1+${betaDns.toFixed(2)})`, value: EI, unit: 'N·mm²', clause: '§6.6.4.4.4(b)' });
    steps.push({ label: `Pc ${axis}`, equation: 'π²EI/(k·lu)²', substitution: `π²×${EI.toExponential(3)}/(${le.toFixed(1)})²`, value: Pc, unit: 'N', clause: '§6.6.4.4.2' });
    steps.push({ label: `δ_ns ${axis}`, equation: 'Cm/(1−Pu/0.75Pc) ≥ 1', substitution: `${Cm.toFixed(3)}/(1−${Pu.toFixed(0)}/(0.75×${Pc.toFixed(0)}))`, value: delta, unit: '—', clause: '§6.6.4.5.2' });
  } else if (!short && !eff.braced) {
    const story = load.story;
    if (load.swayMomentsMagnified) {
      Mc = M2raw; delta = 1;
      steps.push({ label: `Sway moments ${axis}`, equation: 'User-supplied second-order moments', value: Mc, unit: 'N·mm', clause: '§6.7 / §6.6.4.6' });
    } else if (!story) {
      throw new UnsupportedError(`Unbraced/slender column about ${axis} requires story stability data (ΣPu, ΣPc or Q) or verified second-order moments.`, '§6.6.4.6');
    } else {
      let deltaS;
      if (story.Q !== undefined) {
        const Q = finite(story.Q, 'story.Q');
        if (Q >= 1) throw new UnsupportedError('Story stability index Q ≥ 1; structure is unstable.', '§6.6.4.6.2(a)');
        deltaS = 1 / (1 - Q);
      } else {
        const sumPu = positive(story.sumPu, 'story.sumPu');
        const sumPc = positive(story.sumPc, 'story.sumPc');
        const denom = 1 - sumPu / (0.75 * sumPc);
        if (denom <= 0) throw new UnsupportedError('ΣPu ≥ 0.75ΣPc; story is unstable.', '§6.6.4.6.2(b)');
        deltaS = 1 / denom;
      }
      if (deltaS > 1.5) throw new UnsupportedError(`δs = ${deltaS.toFixed(2)} > 1.5; a second-order elastic analysis is required.`, '§6.6.4.6.2');
      delta = deltaS;
      Mc = deltaS * M2raw;
      steps.push({ label: `δ_s ${axis}`, equation: '1/(1−Q) or 1/(1−ΣPu/0.75ΣPc)', value: deltaS, unit: '—', clause: '§6.6.4.6.2' });
    }
  } else if (eff.braced && M2min > M2) {
    Mc = M2min * Math.sign(M2raw || 1);
    steps.push({ label: `Minimum moment ${axis}`, equation: 'M2,min = Pu(15+0.03h)', substitution: `${Pu.toFixed(0)}×(15+0.03×${hAxis})`, value: M2min, unit: 'N·mm', clause: '§6.6.4.5.4' });
  }
  return { axis, r, le, klu_r, limit, short, M2min, Cm, delta, Pc, EI, betaDns, Mc, steps, classification: short ? 'Short' : 'Slender' };
}

export function assessSlenderness({ section, concrete, steel, height, load }) {
  const eff = effectiveLengths(section, height);
  const x = axisSlenderness({ section, eff, axis: 'x', load, concrete, steel });
  const y = axisSlenderness({ section, eff, axis: 'y', load, concrete, steel });
  const checks = [];
  if (eff.kAssumed && !eff.braced) checks.push(check('k-assumed', 'Effective length factor', STATUS.WARNING, null, null, '—', '§6.6.4.4.3', 'Sway k was assumed (1.2). Provide a calculated k or effective length for final design.'));
  checks.push(check('slender-x', `Slenderness about X`, STATUS.INFO, x.klu_r, x.limit, '—', '§6.2.5 / §6.6.4.5.1', `${x.classification}; k·lu/r = ${x.klu_r.toFixed(2)}, limit = ${x.limit.toFixed(2)}`));
  checks.push(check('slender-y', `Slenderness about Y`, STATUS.INFO, y.klu_r, y.limit, '—', '§6.2.5 / §6.6.4.5.1', `${y.classification}; k·lu/r = ${y.klu_r.toFixed(2)}, limit = ${y.limit.toFixed(2)}`));
  return { eff, x, y, checks, designMx: x.Mc, designMy: y.Mc, slender: !x.short || !y.short };
}
