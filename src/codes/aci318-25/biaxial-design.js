/** ACI 318-25 biaxial bending: exact P–Mx–My surface, no reciprocal-load approximation. */
import { checkCapacity, biaxialContour, getEngine } from '../../analysis/capacity-check.js';
export function checkBiaxial(args) {
  return checkCapacity({ ...args, code: 'ACI318-25', clause: 'ACI §22.4 / §22.2 (biaxial strain compatibility)' });
}
export function capacitySurface({ section, concrete, steel, Pu, angles = 96, transverseType = 'ties' }) {
  return biaxialContour(getEngine('ACI318-25'), section, concrete, steel, Pu, { angles, transverseType });
}
