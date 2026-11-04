/** ACI 318-25 column detailing + conservative nonseismic one-way shear check. */
import { STATUS, check, positive } from '../../core/validation.js';
import { barArea, minClearBarSpacing, validateBarPlacement } from '../../core/geometry.js';
import { RHO_MIN, RHO_MAX, minTieDiameter, maxTieSpacing, PHI_SHEAR } from './materials.js';

const COVER_MIN = { interior: 40, exterior: 50, earth: 75 };

export function designTransverse(section, steel, tieSteel, transverse = {}, opts = {}) {
  const type = transverse.type ?? (section.shape === 'circle' ? 'ties' : 'ties');
  const maxBar = Math.max(...section.bars.map(b => b.db));
  const minDb = minTieDiameter(maxBar);
  const db = transverse.db ?? minDb;
  const maxS = maxTieSpacing(section, db);
  const spacing = transverse.spacing ?? Math.floor(maxS / 25) * 25;
  return { type, db, spacing: Math.max(25, Math.min(spacing, maxS)), maxSpacing: maxS, minDb, crossTies: transverse.crossTies !== false };
}

export function detailingChecks({ section, concrete, steel, tieSteel, transverse, exposure = 'interior', aggregateSize = 20, loads = [] }) {
  const checks = [];
  const t = transverse;
  const minCover = COVER_MIN[exposure] ?? 40;
  checks.push(check('rho-min', 'Minimum longitudinal reinforcement', section.rho >= RHO_MIN ? STATUS.PASS : STATUS.FAIL, section.As, RHO_MIN * section.Ag, 'mm²', '§10.6.1.1', `ρ = ${(section.rho * 100).toFixed(2)}% (min 1.00%)`));
  checks.push(check('rho-max', 'Maximum longitudinal reinforcement', section.rho <= RHO_MAX ? STATUS.PASS : STATUS.FAIL, section.As, RHO_MAX * section.Ag, 'mm²', '§10.6.1.1', `ρ = ${(section.rho * 100).toFixed(2)}% (max 8.00%)`));
  const minBars = section.shape === 'circle' ? 6 : 4;
  checks.push(check('bar-count', 'Minimum bar count', section.bars.length >= minBars ? STATUS.PASS : STATUS.FAIL, section.bars.length, minBars, 'bars', '§10.7.3.1', `${section.bars.length} bars provided`));
  const minBarDb = Math.min(...section.bars.map(b => b.db));
  checks.push(check('bar-diameter', 'Minimum bar diameter', minBarDb >= 12 ? STATUS.PASS : STATUS.WARNING, minBarDb, 12, 'mm', '§10.7.3 / practical', 'Use ≥12 mm longitudinal bars for columns.'));
  checks.push(check('cover', 'Clear cover to ties', section.cover >= minCover ? STATUS.PASS : STATUS.FAIL, section.cover, minCover, 'mm', '§20.6.1.3', `Exposure: ${exposure}`));
  const placement = validateBarPlacement(section, t.db);
  checks.push(check('bar-placement', 'Bar placement inside cover', placement.length === 0 ? STATUS.PASS : STATUS.FAIL, placement.length, 0, 'issues', '§20.6.1', placement.length ? `${placement.length} bars violate cover/tie envelope.` : 'All bars within cover + tie envelope.'));
  const minClear = Math.max(25, Math.max(...section.bars.map(b => b.db)), 4 / 3 * aggregateSize);
  const actualClear = minClearBarSpacing(section);
  checks.push(check('bar-spacing', 'Minimum clear bar spacing', actualClear >= minClear - 1e-6 ? STATUS.PASS : STATUS.FAIL, actualClear, minClear, 'mm', '§25.2.1', `Clear spacing = ${actualClear.toFixed(1)} mm; required ≥ ${minClear.toFixed(1)} mm`));
  checks.push(check('tie-diameter', 'Tie diameter', t.db >= t.minDb ? STATUS.PASS : STATUS.FAIL, t.db, t.minDb, 'mm', '§25.7.2.2', `Minimum tie diameter ${t.minDb} mm`));
  checks.push(check('tie-spacing', 'Tie spacing', t.spacing <= t.maxSpacing + 1e-6 ? STATUS.PASS : STATUS.FAIL, t.spacing, t.maxSpacing, 'mm', '§25.7.2.1', `s = ${t.spacing} mm; max = ${t.maxSpacing.toFixed(0)} mm = min(16db, 48dt, least dim)`));
  // Lateral support: corners supported by closed tie; intermediate bars need cross-ties if >150 mm clear from support.
  if (section.shape === 'rect') {
    const maxFace = Math.max(section.b, section.h) - 2 * (section.cover + t.db);
    const needsCross = maxFace > 300;
    const ok = !needsCross || t.crossTies;
    checks.push(check('lateral-support', 'Longitudinal bar lateral support', ok ? STATUS.PASS : STATUS.FAIL, needsCross ? 1 : 0, t.crossTies ? 1 : 0, '—', '§25.7.2.3', needsCross ? (t.crossTies ? 'Cross-ties provided to restrain intermediate bars.' : 'Provide cross-ties: unsupported face length exceeds 300 mm.') : 'Corner ties restrain all bars within 150 mm clear.'));
  } else {
    checks.push(check('lateral-support', 'Circular tie/spiral support', STATUS.PASS, 1, 1, '—', '§25.7.2 / §25.7.3', 'Continuous circular tie or spiral supports all longitudinal bars.'));
  }
  if (t.type === 'spiral') {
    if (section.shape !== 'circle') checks.push(check('spiral-shape', 'Spiral requires circular section', STATUS.FAIL, 0, 1, '—', '§25.7.3', 'Spirals are only supported for circular columns.'));
    else {
      const Dch = section.D - 2 * section.cover;
      const Ach = Math.PI * Dch * Dch / 4;
      const Asp = barArea(t.db);
      const rhoS = 4 * Asp / (Dch * t.spacing);
      const rhoReq = 0.45 * (section.Ag / Ach - 1) * concrete.fc / tieSteel.fy;
      checks.push(check('spiral-ratio', 'Spiral reinforcement ratio', rhoS >= rhoReq ? STATUS.PASS : STATUS.FAIL, rhoS, rhoReq, '—', '§25.7.3.3', `ρs = ${rhoS.toFixed(4)}; required ${rhoReq.toFixed(4)}`));
      const clearPitch = t.spacing - t.db;
      checks.push(check('spiral-pitch', 'Spiral clear pitch', clearPitch >= 25 && clearPitch <= 75 ? STATUS.PASS : STATUS.FAIL, clearPitch, 75, 'mm', '§25.7.3.2', `Clear pitch = ${clearPitch.toFixed(1)} mm (25–75 mm)`));
    }
  }
  // Shear (conservative nonseismic subset).
  const maxVx = Math.max(0, ...loads.map(l => Math.abs(l.Vx ?? 0)));
  const maxVy = Math.max(0, ...loads.map(l => Math.abs(l.Vy ?? 0)));
  const maxPu = Math.max(0, ...loads.map(l => l.Pu ?? 0));
  if (maxVx > 0 || maxVy > 0) {
    const offset = section.cover + t.db + Math.max(...section.bars.map(b => b.db)) / 2;
    const tieArea = barArea(t.db);
    const Av = 2 * tieArea;
    const bwX = section.shape === 'circle' ? section.D : section.b;
    const dX = (section.shape === 'circle' ? section.D : section.h) - offset;
    const bwY = section.shape === 'circle' ? section.D : section.h;
    const dY = (section.shape === 'circle' ? section.D : section.b) - offset;
    for (const [label, V, bw, d] of [['Vx', maxVx, bwX, dX], ['Vy', maxVy, bwY, dY]]) {
      if (V <= 0) continue;
      const Vc = Math.max(0, (0.17 * Math.sqrt(concrete.fc) + maxPu / (6 * section.Ag)) * bw * d); // §22.5.5.1(a), SI
      const Vs = Av * tieSteel.fy * d / t.spacing;
      const phiVn = PHI_SHEAR * (Vc + Vs);
      const Avmin = Math.max(0.062 * Math.sqrt(concrete.fc), 0.35) * bw * t.spacing / tieSteel.fy;
      checks.push(check(`shear-${label}`, `One-way shear ${label}`, V <= phiVn ? STATUS.PASS : STATUS.FAIL, V, phiVn, 'N', '§22.5.5.1 / §10.6.2', `φVn = ${phiVn.toFixed(0)} N (Vc=${Vc.toFixed(0)}, Vs=${Vs.toFixed(0)}); Av=${Av.toFixed(0)} mm², Av,min=${Avmin.toFixed(0)} mm²`));
      checks.push(check(`shear-avmin-${label}`, `Minimum shear reinforcement ${label}`, Av >= Avmin ? STATUS.PASS : STATUS.WARNING, Av, Avmin, 'mm²', '§10.6.2.2', 'Conservative beam Av,min used for column ties; verify seismic requirements separately.'));
    }
  }
  return checks;
}
