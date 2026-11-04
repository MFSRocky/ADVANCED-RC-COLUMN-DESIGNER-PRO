/** BS 8110-1:1997 biaxial bending: §3.8.4.5 equivalent uniaxial + exact surface verification. */
import { checkCapacity, biaxialContour, getEngine } from '../../analysis/capacity-check.js';
import { equivalentUniaxial } from './slenderness.js';
import { STATUS, check } from '../../core/validation.js';

export function checkBiaxial({ section, concrete, steel, Pu, Mx, My, tieDb = 10, braced = true, angles = 72 }) {
  const eq = equivalentUniaxial({ section, concrete, N: Pu, Mx, My, tieDb });
  const eqMx = eq.axis === 'x' ? eq.Mdesign * Math.sign(Mx || 1) : 0;
  const eqMy = eq.axis === 'y' ? eq.Mdesign * Math.sign(My || 1) : 0;
  const eqCheck = checkCapacity({ code: 'BS8110-1997', section, concrete, steel, Pu, Mx: eqMx, My: eqMy, braced, angles: Math.max(36, angles / 2), clause: eq.clause });
  const exactCheck = checkCapacity({ code: 'BS8110-1997', section, concrete, steel, Pu, Mx, My, braced, angles, clause: 'BS §3.8.4 (exact biaxial surface)' });
  const ok = eqCheck.status === STATUS.PASS && exactCheck.status === STATUS.PASS;
  const util = Math.max(eqCheck.utilization, exactCheck.utilization);
  const c = check('bs-biaxial', 'Biaxial bending (§3.8.4.5 + exact surface)', ok ? STATUS.PASS : STATUS.FAIL, util, 1, '—', eq.clause, `Equivalent ${eq.axis} moment = ${eq.Mdesign.toExponential(3)} N·mm; β = ${eq.beta ?? '—'}; governing utilization ${util.toFixed(3)}`, { equivalent: eq, eqCheck, exactCheck });
  return { status: ok ? STATUS.PASS : STATUS.FAIL, utilization: util, checks: [c, ...eqCheck.checks, ...exactCheck.checks], equivalent: eq, surface: exactCheck.surface, capacityPoint: exactCheck.capacityPoint, governingAngle: exactCheck.governingAngle, axialUtil: exactCheck.axialUtil, momentUtil: exactCheck.momentUtil };
}

export function capacitySurface({ section, concrete, steel, Pu, angles = 96, braced = true }) {
  return biaxialContour(getEngine('BS8110-1997'), section, concrete, steel, Pu, { angles, braced });
}
