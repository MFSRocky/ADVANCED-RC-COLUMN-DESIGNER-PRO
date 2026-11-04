/** BS 8110-1:1997 material properties, incorporating Amendment No. 6 (γm steel = 1.05). */
import { positive, oneOf, UnsupportedError } from '../../core/validation.js';

export const CODE = 'BS 8110-1:1997';
export const EPS_CU = 0.0035;             // §3.4.4.1
export const GAMMA_C = 1.5;               // Table 2.2
export const GAMMA_S = 1.05;              // Table 2.2, Amendment No. 6 (changed from 1.15)
export const GAMMA_V = 1.25;              // Table 2.2, shear without shear reinforcement
export const CONCRETE_STRESS_FACTOR = 0.45; // Fig. 3.3 simplified stress block (0.67/1.5 ≈ 0.45)
export const BLOCK_DEPTH_FACTOR = 0.9;    // Fig. 3.3
export const STEEL_STRESS_FACTOR = 1 / GAMMA_S; // ≈0.952 → code rounds to 0.95fy
export const RHO_MIN = 0.004;             // §3.12.5.3
export const RHO_MAX_VERTICAL = 0.06;     // §3.12.5.3
export const RHO_MAX_HORIZONTAL = 0.08;   // §3.12.5.3

export const CONCRETE_GRADES = [25, 30, 35, 40, 45, 50, 60].map(fcu => ({ id: `BS-C${fcu}`, name: `C${fcu} (fcu ${fcu} MPa)`, fcu, density: 2400 }));
export const STEEL_GRADES = [
  { id: 'BS-250', name: 'Mild steel fy 250', fy: 250, Es: 200000 },
  { id: 'BS-460', name: 'High yield fy 460', fy: 460, Es: 200000 },
];
export const BAR_SIZES = [12, 16, 20, 25, 32, 40];
export const LINK_SIZES = [6, 8, 10, 12, 16];

export function normalizeConcrete(input = {}) {
  const fcu = positive(input.fcu ?? input.fc ?? 30, 'fcu', { min: 25, max: 60 });
  const density = positive(input.density ?? 2400, 'density', { min: 2200, max: 2500 });
  const Ec = input.Ec !== undefined ? positive(input.Ec, 'Ec') : 20000 + 200 * fcu; // BS 8110-2 Eq. 17, MPa
  return {
    code: CODE, fcu, density, Ec, gammaC: GAMMA_C,
    designStress: CONCRETE_STRESS_FACTOR * fcu,
    blockFactor: BLOCK_DEPTH_FACTOR, epsCu: EPS_CU,
  };
}

export function normalizeSteel(input = {}) {
  const fy = positive(input.fy ?? 460, 'fy', { min: 100, max: 1000 });
  if (![250, 460].includes(fy)) throw new UnsupportedError(`BS 8110-1:1997 Table 3.1 lists fy = 250 and 460 MPa. fy = ${fy} MPa is outside the verified material library; use a code-compliant grade or a separate assessment.`, 'Table 3.1');
  const Es = positive(input.Es ?? 200000, 'Es', { min: 190000, max: 210000 });
  return { code: CODE, fy, Es, gammaS: GAMMA_S, designStress: STEEL_STRESS_FACTOR * fy, epsY: STEEL_STRESS_FACTOR * fy / Es };
}

export function minLinkDiameter(maxLongBarDb) {
  return Math.max(6, maxLongBarDb / 4); // §3.12.7.1
}

export function maxLinkSpacing(section) {
  const minBarDb = Math.min(...section.bars.map(b => b.db));
  const least = section.shape === 'circle' ? section.D : Math.min(section.b, section.h);
  return Math.min(12 * minBarDb, least); // §3.12.7.1
}

/** Table 3.22 coefficient β for biaxial bending, N/(bh fcu). */
export function biaxialBeta(nRatio) {
  const table = [[0, 1.0], [0.1, 0.88], [0.2, 0.77], [0.3, 0.65], [0.4, 0.53], [0.5, 0.42], [0.6, 0.30]];
  if (nRatio <= 0) return 1.0;
  if (nRatio >= 0.6) return 0.30;
  for (let i = 1; i < table.length; i++) {
    if (nRatio <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (nRatio - x0) / (x1 - x0);
    }
  }
  return 0.30;
}
