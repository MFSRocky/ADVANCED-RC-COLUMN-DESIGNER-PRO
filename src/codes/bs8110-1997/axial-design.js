/** BS 8110-1:1997 short-column axial design (§3.8.4.3 / §3.8.4.4). */
import { axialDesignStrength } from './section-analysis.js';
import { STATUS, check } from '../../core/validation.js';
import { RHO_MIN } from './materials.js';

export function axialCapacity(section, concrete, steel, { braced = true } = {}) {
  return axialDesignStrength(section, concrete, steel, { braced });
}

export function requiredAsForAxial({ N, Ag, fcu, fy }) {
  const As3 = (N - 0.4 * fcu * Ag) / (0.8 * fy - 0.4 * fcu);
  const As4 = (N - 0.35 * fcu * Ag) / (0.7 * fy - 0.35 * fcu);
  return Math.max(RHO_MIN * Ag, As3, As4, 0);
}

export function checkAxial({ section, concrete, steel, N, braced = true }) {
  const cap = axialCapacity(section, concrete, steel, { braced });
  const util = cap.governing > 0 ? N / cap.governing : Infinity;
  return check('bs-axial', 'Short-column axial capacity', util <= 1 ? STATUS.PASS : STATUS.FAIL, N, cap.governing, 'N', cap.clause, `Ncap = ${cap.governing.toFixed(0)} N; utilization ${util.toFixed(3)}`, cap);
}
