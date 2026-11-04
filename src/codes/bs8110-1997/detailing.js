/** BS 8110-1:1997 column detailing and shear (Amendment No. 6: 0.95fy). */
import { STATUS, check } from '../../core/validation.js';
import { barArea, minClearBarSpacing, validateBarPlacement } from '../../core/geometry.js';
import { RHO_MIN, RHO_MAX_VERTICAL, minLinkDiameter, maxLinkSpacing, STEEL_STRESS_FACTOR, GAMMA_V } from './materials.js';

const COVER_MIN = { mild: 20, moderate: 30, severe: 40, 'very severe': 50 };

export function designTransverse(section, steel, tieSteel, transverse = {}) {
  const type = transverse.type ?? 'links';
  const maxBar = Math.max(...section.bars.map(b => b.db));
  const minDb = minLinkDiameter(maxBar);
  const db = transverse.db ?? Math.max(6, Math.ceil(minDb / 2) * 2);
  const maxS = maxLinkSpacing(section);
  const spacing = transverse.spacing ?? Math.floor(maxS / 25) * 25;
  return { type, db, spacing: Math.max(25, Math.min(spacing, maxS)), maxSpacing: maxS, minDb, crossTies: transverse.crossTies !== false };
}

export function detailingChecks({ section, concrete, steel, tieSteel, transverse, exposure = 'moderate', aggregateSize = 20, loads = [] }) {
  const checks = [];
  const t = transverse;
  const minCover = COVER_MIN[exposure] ?? 30;
  checks.push(check('bs-rho-min', 'Minimum longitudinal reinforcement', section.rho >= RHO_MIN ? STATUS.PASS : STATUS.FAIL, section.As, RHO_MIN * section.Ag, 'mm²', '§3.12.5.3', `ρ = ${(section.rho * 100).toFixed(2)}% (min 0.40%)`));
  checks.push(check('bs-rho-max', 'Maximum longitudinal reinforcement (vertical)', section.rho <= RHO_MAX_VERTICAL ? STATUS.PASS : STATUS.FAIL, section.As, RHO_MAX_VERTICAL * section.Ag, 'mm²', '§3.12.5.3', `ρ = ${(section.rho * 100).toFixed(2)}% (max 6.00% for vertical columns)`));
  const minBars = section.shape === 'circle' ? 6 : 4;
  checks.push(check('bs-bar-count', 'Minimum bar count', section.bars.length >= minBars ? STATUS.PASS : STATUS.FAIL, section.bars.length, minBars, 'bars', '§3.12.5.4', `${section.bars.length} bars provided`));
  const minBarDb = Math.min(...section.bars.map(b => b.db));
  checks.push(check('bs-bar-diameter', 'Minimum bar diameter', minBarDb >= 12 ? STATUS.PASS : STATUS.FAIL, minBarDb, 12, 'mm', '§3.12.5.4', 'Column bars shall be ≥12 mm diameter.'));
  checks.push(check('bs-cover', 'Nominal cover to links', section.cover >= minCover ? STATUS.PASS : STATUS.FAIL, section.cover, minCover, 'mm', 'Table 3.3', `Exposure: ${exposure}; nominal cover ≥ ${minCover} mm`));
  const placement = validateBarPlacement(section, t.db);
  checks.push(check('bs-bar-placement', 'Bar placement inside cover', placement.length === 0 ? STATUS.PASS : STATUS.FAIL, placement.length, 0, 'issues', '§3.3', placement.length ? `${placement.length} bars violate cover/link envelope.` : 'All bars within cover + link envelope.'));
  const minClear = Math.max(Math.max(...section.bars.map(b => b.db)), aggregateSize + 5);
  const actualClear = minClearBarSpacing(section);
  checks.push(check('bs-bar-spacing', 'Minimum clear bar spacing', actualClear >= minClear - 1e-6 ? STATUS.PASS : STATUS.FAIL, actualClear, minClear, 'mm', '§3.12.11', `Clear spacing = ${actualClear.toFixed(1)} mm; required ≥ ${minClear.toFixed(1)} mm`));
  checks.push(check('bs-link-diameter', 'Link diameter', t.db >= t.minDb ? STATUS.PASS : STATUS.FAIL, t.db, t.minDb, 'mm', '§3.12.7.1', `Minimum link diameter = max(6, db/4) = ${t.minDb.toFixed(1)} mm`));
  checks.push(check('bs-link-spacing', 'Link spacing', t.spacing <= t.maxSpacing + 1e-6 ? STATUS.PASS : STATUS.FAIL, t.spacing, t.maxSpacing, 'mm', '§3.12.7.1', `s = ${t.spacing} mm; max = ${t.maxSpacing.toFixed(0)} mm`));
  if (section.shape === 'rect') {
    const maxFace = Math.max(section.b, section.h) - 2 * (section.cover + t.db);
    const needsCross = maxFace > 300;
    const ok = !needsCross || t.crossTies;
    checks.push(check('bs-lateral-support', 'Bar restraint by links', ok ? STATUS.PASS : STATUS.FAIL, needsCross ? 1 : 0, t.crossTies ? 1 : 0, '—', '§3.12.7', needsCross ? (t.crossTies ? 'Cross-ties provided.' : 'Provide cross-ties so no bar is >150 mm from a restrained bar.') : 'All bars within 150 mm of a restrained corner.'));
  } else {
    checks.push(check('bs-lateral-support', 'Circular link restraint', STATUS.PASS, 1, 1, '—', '§3.12.7', 'Circular links restrain all longitudinal bars.'));
  }
  // Shear — conservative beam method, no axial enhancement.
  const maxVx = Math.max(0, ...loads.map(l => Math.abs(l.Vx ?? 0)));
  const maxVy = Math.max(0, ...loads.map(l => Math.abs(l.Vy ?? 0)));
  if (maxVx > 0 || maxVy > 0) {
    const offset = section.cover + t.db + Math.max(...section.bars.map(b => b.db)) / 2;
    const linkArea = barArea(t.db);
    const Asv = 2 * linkArea;
    const fsd = STEEL_STRESS_FACTOR * tieSteel.fy;
    const bwX = section.shape === 'circle' ? section.D : section.b;
    const dX = (section.shape === 'circle' ? section.D : section.h) - offset;
    const bwY = section.shape === 'circle' ? section.D : section.h;
    const dY = (section.shape === 'circle' ? section.D : section.b) - offset;
    for (const [label, V, bw, d] of [['Vx', maxVx, bwX, dX], ['Vy', maxVy, bwY, dY]]) {
      if (V <= 0) continue;
      const v = V / (bw * d);
      const rho100 = Math.min(3, 100 * (section.As / 2) / (bw * d));
      const depthFactor = Math.max(1, 400 / d);
      const gradeFactor = Math.cbrt(Math.min(concrete.fcu, 40) / 25);
      const vc = (0.79 / GAMMA_V) * Math.cbrt(rho100) * Math.pow(depthFactor, 0.25) * gradeFactor;
      const vmax = Math.min(0.8 * Math.sqrt(concrete.fcu), 5);
      checks.push(check(`bs-shear-vmax-${label}`, `Maximum shear stress ${label}`, v <= vmax ? STATUS.PASS : STATUS.FAIL, v, vmax, 'MPa', '§3.4.5.2 / §3.8.4.6', `v = ${v.toFixed(3)} MPa; vmax = ${vmax.toFixed(3)} MPa`));
      if (v <= vc) {
        checks.push(check(`bs-shear-${label}`, `Concrete shear ${label}`, STATUS.PASS, v, vc, 'MPa', 'Table 3.8', `v ≤ vc; nominal links suffice (vc=${vc.toFixed(3)} MPa).`));
      } else {
        const reqAsvPerS = bw * (v - vc) / fsd;
        const provAsvPerS = Asv / t.spacing;
        checks.push(check(`bs-shear-${label}`, `Shear links ${label}`, provAsvPerS >= reqAsvPerS ? STATUS.PASS : STATUS.FAIL, provAsvPerS, reqAsvPerS, 'mm²/mm', 'Table 3.7 / §3.4.5', `Asv/s provided = ${provAsvPerS.toFixed(3)}; required = ${reqAsvPerS.toFixed(3)} (vc=${vc.toFixed(3)} MPa)`));
      }
    }
  }
  return checks;
}
