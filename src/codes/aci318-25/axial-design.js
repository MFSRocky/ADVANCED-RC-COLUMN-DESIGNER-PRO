/** ACI 318-25 axial compression design (Table 22.4.2.1, §21.2). */
import { axialDesignStrength, pureCompression } from './section-analysis.js';
import { STATUS, check } from '../../core/validation.js';
import { RHO_MIN, RHO_MAX } from './materials.js';

export function axialCapacity(section, concrete, steel, transverseType = 'ties') {
  return axialDesignStrength(section, concrete, steel, transverseType);
}

export function requiredAsForAxial({ Pu, Ag, fc, fy, phi, capFactor }) {
  // Pu = φ·cap·[0.85fc(Ag−As) + fyAs]
  const target = Pu / (phi * capFactor);
  const As = (target - 0.85 * fc * Ag) / (fy - 0.85 * fc);
  return Math.max(RHO_MIN * Ag, As);
}

export function checkAxial({ section, concrete, steel, Pu, transverseType = 'ties' }) {
  const cap = axialCapacity(section, concrete, steel, transverseType);
  const util = cap.phiPnMax > 0 ? Pu / cap.phiPnMax : Infinity;
  return check('aci-axial', 'Axial compression capacity', util <= 1 ? STATUS.PASS : STATUS.FAIL, Pu, cap.phiPnMax, 'N', 'Table 22.4.2.1 / §21.2.2', `φPn,max = ${cap.phiPnMax.toFixed(0)} N; utilization ${util.toFixed(3)}`, cap);
}
