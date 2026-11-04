/** ACI 318-25 uniaxial bending verification via strain compatibility. */
import { checkCapacity } from '../../analysis/capacity-check.js';
export function checkUniaxial(args) {
  return checkCapacity({ ...args, code: 'ACI318-25', clause: 'ACI §22.4 / §22.2 (uniaxial strain compatibility)' });
}
