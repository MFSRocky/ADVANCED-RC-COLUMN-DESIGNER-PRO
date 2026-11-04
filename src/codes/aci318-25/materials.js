/** ACI 318-25 material properties (SI). Scoped to normalweight, nonprestressed, nonseismic columns. */
import { positive, finite, oneOf, UnsupportedError } from '../../core/validation.js';

export const CODE = 'ACI 318-25';
export const EPS_CU = 0.003;              // §22.2.2.1
export const CONCRETE_STRESS_FACTOR = 0.85; // §22.2.2.4.1
export const PHI_COMPRESSION_TIED = 0.65;   // Table 21.2.2
export const PHI_COMPRESSION_SPIRAL = 0.75; // Table 21.2.2
export const PHI_TENSION = 0.90;            // Table 21.2.2
export const PHI_SHEAR = 0.75;              // Table 21.2.1
export const AXIAL_CAP_TIED = 0.80;         // Table 22.4.2.1
export const AXIAL_CAP_SPIRAL = 0.85;       // Table 22.4.2.1
export const RHO_MIN = 0.01;                // §10.6.1.1
export const RHO_MAX = 0.08;                // §10.6.1.1

export const CONCRETE_GRADES = [20, 25, 30, 35, 40, 45, 50, 55, 60, 69].map(fc => ({ id: `ACI-C${fc}`, name: `f'c ${fc} MPa`, fc, density: 2400 }));
export const STEEL_GRADES = [
  { id: 'ACI-Gr420', name: 'Grade 420', fy: 420, Es: 200000 },
  { id: 'ACI-Gr500', name: 'Grade 500', fy: 500, Es: 200000 },
  { id: 'ACI-Gr550', name: 'Grade 550', fy: 550, Es: 200000 },
];
export const BAR_SIZES = [10, 12, 16, 20, 25, 32, 36, 40];
export const TIE_SIZES = [10, 13, 16];

export function beta1(fc) {
  // §22.2.2.4.3: 0.85 for fc ≤ 28 MPa, reduce 0.05 per 7 MPa above 28, min 0.65.
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
}

export function normalizeConcrete(input = {}) {
  const fc = positive(input.fc ?? input.fcPrime ?? 30, "f'c", { min: 17, max: 69 });
  const density = positive(input.density ?? 2400, 'density', { min: 2200, max: 2500 });
  if (input.lightweight || density < 2200) throw new UnsupportedError('Lightweight concrete is outside this release’s verified ACI scope.', '§19.2.2');
  const Ec = input.Ec !== undefined ? positive(input.Ec, 'Ec', { min: 10000, max: 80000 }) : 4700 * Math.sqrt(fc); // §19.2.2.1(b), normalweight
  return { code: CODE, fc, density, Ec, lambda: 1.0, beta1: beta1(fc), designStress: CONCRETE_STRESS_FACTOR * fc, epsCu: EPS_CU };
}

export function normalizeSteel(input = {}) {
  const fy = positive(input.fy ?? 420, 'fy', { min: 280, max: 550 });
  const Es = positive(input.Es ?? 200000, 'Es', { min: 190000, max: 210000 });
  return { code: CODE, fy, Es, epsY: fy / Es, designStress: fy };
}

export function phiCompression(transverseType) {
  return transverseType === 'spiral' ? PHI_COMPRESSION_SPIRAL : PHI_COMPRESSION_TIED;
}

/** Table 21.2.2 strain-based φ, before the 21.2.2.3 axial cap. */
export function phiFromStrain(epsT, fy, Es, transverseType) {
  const epsTy = fy / Es;
  const phiC = phiCompression(transverseType);
  if (epsT <= epsTy) return phiC;
  if (epsT >= epsTy + 0.003) return PHI_TENSION;
  return phiC + (PHI_TENSION - phiC) * (epsT - epsTy) / 0.003;
}

/**
 * ACI 318-25 §21.2.2.3 cap: for 0.1f'cAg ≤ Pn ≤ Pn,bal, φ shall not exceed
 * linear interpolation between 0.90 at 0.1f'cAg and φcc at Pn,bal.
 */
export function applyPhiCap(phiTable, Pn, PnBal, fc, Ag, transverseType) {
  const lower = 0.1 * fc * Ag;
  if (Pn < lower || Pn > PnBal || PnBal <= lower) return { phi: phiTable, capped: false, phiCap: null };
  const phiC = phiCompression(transverseType);
  const phiCap = PHI_TENSION + (phiC - PHI_TENSION) * (Pn - lower) / (PnBal - lower);
  return { phi: Math.min(phiTable, phiCap), capped: phiTable > phiCap + 1e-12, phiCap };
}

export function minTieDiameter(maxLongBarDb) {
  // §25.7.2.2: No.3 (≈10 mm) ties for No.10 (≈32 mm) or smaller; No.4 (≈13 mm) for No.11 or larger.
  return maxLongBarDb <= 32 ? 10 : 13;
}

export function maxTieSpacing(section, tieDb) {
  const maxBarDb = Math.max(...section.bars.map(b => b.db));
  const least = section.shape === 'circle' ? section.D : Math.min(section.b, section.h);
  return Math.min(16 * maxBarDb, 48 * tieDb, least); // §25.7.2.1
}
