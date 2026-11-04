/** BS 8110-1:1997 uniaxial bending verification via strain compatibility. */
import { checkCapacity } from '../../analysis/capacity-check.js';
export function checkUniaxial(args) {
  return checkCapacity({ ...args, code: 'BS8110-1997', clause: 'BS §3.8.4 / Fig. 3.3 (uniaxial strain compatibility)' });
}
