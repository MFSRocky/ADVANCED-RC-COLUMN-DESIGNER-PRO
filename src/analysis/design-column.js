/** Top-level column design orchestrator. Pure engineering — no UI or storage dependencies. */
import { normalizeSection, barArea } from '../core/geometry.js';
import { STATUS, check, worstStatus, UnsupportedError, ValidationError } from '../core/validation.js';
import { getEngine, checkCapacity } from './capacity-check.js';
import * as ACImat from '../codes/aci318-25/materials.js';
import * as BSmats from '../codes/bs8110-1997/materials.js';
import * as ACIdet from '../codes/aci318-25/detailing.js';
import * as BSdet from '../codes/bs8110-1997/detailing.js';
import * as ACIslender from '../codes/aci318-25/slenderness.js';
import * as BSlender from '../codes/bs8110-1997/slenderness.js';
import * as BSbiax from '../codes/bs8110-1997/biaxial-design.js';

export function normalizeCode(code) {
  if (code === 'ACI' || code === 'ACI318-25' || code === 'ACI 318-25') return 'ACI318-25';
  if (code === 'BS' || code === 'BS8110-1997' || code === 'BS 8110-1:1997') return 'BS8110-1997';
  throw new ValidationError(`Unknown design code: ${code}`, 'code');
}

function materialsFor(code, input) {
  if (code === 'ACI318-25') {
    return { concrete: ACImat.normalizeConcrete(input.concrete), steel: ACImat.normalizeSteel(input.steel), tieSteel: ACImat.normalizeSteel(input.tieSteel ?? input.steel), mats: ACImat, det: ACIdet, slender: ACIslender };
  }
  return { concrete: BSmats.normalizeConcrete(input.concrete), steel: BSmats.normalizeSteel(input.steel), tieSteel: BSmats.normalizeSteel(input.tieSteel ?? input.steel), mats: BSmats, det: BSdet, slender: BSlender };
}

function scaleSection(section, factor) {
  const bars = section.bars.map(b => {
    const As = b.As * factor;
    return { ...b, As, db: Math.sqrt(4 * As / Math.PI) };
  });
  const As = bars.reduce((s, b) => s + b.As, 0);
  return { ...section, bars, As, Ac: section.Ag - As, rho: As / section.Ag };
}

/** Estimate required steel area by uniform scaling of the current layout (strength only). */
export function estimateRequiredAs({ code, section, concrete, steel, loads, height, transverse, angles = 36 }) {
  const engine = getEngine(code);
  const braced = height?.braced !== false;
  const passes = factor => {
    const s = scaleSection(section, factor);
    if (s.rho < (code === 'ACI318-25' ? 0.01 : 0.004) || s.rho > (code === 'ACI318-25' ? 0.08 : 0.06)) return false;
    for (const load of loads) {
      const Mx = (load.Mx ?? 0) + (load.Pu ?? 0) * (load.ey ?? 0);
      const My = (load.My ?? 0) + (load.Pu ?? 0) * (load.ex ?? 0);
      try {
        const r = checkCapacity({ code, section: s, concrete, steel, Pu: load.Pu ?? 0, Mx, My, transverseType: transverse.type, braced, angles, steps: 50 });
        if (r.status !== STATUS.PASS) return false;
      } catch { return false; }
    }
    return true;
  };
  const rhoMin = code === 'ACI318-25' ? 0.01 : 0.004;
  const rhoMax = code === 'ACI318-25' ? 0.08 : 0.06;
  const rhoNow = section.As / section.Ag;
  let lo = Math.max(0.02, rhoMin / rhoNow);
  let hi = Math.min(8, rhoMax / rhoNow);
  if (hi < lo) return null;
  if (!passes(hi)) return null;
  if (passes(lo)) return section.As * lo;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) hi = mid; else lo = mid;
  }
  return section.As * hi;
}

export function designColumn(input, options = {}) {
  const code = normalizeCode(input.code);
  const { concrete, steel, tieSteel, mats, det, slender } = materialsFor(code, input);
  const tieDbGuess = input.transverse?.db ?? (code === 'ACI318-25' ? 10 : 8);
  const section = normalizeSection({ ...input.geometry, cover: input.cover ?? input.geometry?.cover, tieDb: tieDbGuess, bars: input.bars, arrangement: input.arrangement });
  const transverse = det.designTransverse(section, steel, tieSteel, input.transverse ?? {});
  // Re-normalize with actual tie diameter so bar coordinates match the selected tie.
  const sectionFinal = normalizeSection({ ...input.geometry, cover: input.cover ?? input.geometry?.cover, tieDb: transverse.db, bars: input.bars, arrangement: input.arrangement });
  const loads = (input.loads ?? []).map((l, i) => ({ id: l.id ?? `LC${i + 1}`, name: l.name ?? `Combination ${i + 1}`, ...l }));
  if (!loads.length) throw new ValidationError('At least one load combination is required.', 'loads');
  const height = input.height ?? {};
  const checks = [];
  const steps = [];
  const loadResults = [];
  const unsupported = [];

  if (input.seismic || input.options?.seismic) {
    unsupported.push('Seismic design (ACI Ch.18 / BS seismic detailing) is not implemented in this release. The column cannot be certified as PASS for seismic demands.');
    checks.push(check('seismic', 'Seismic design scope', STATUS.FAIL, 1, 0, '—', 'ACI Ch.18 / BS 8110 seismic', 'Unsupported: perform a separate seismic design.'));
  }
  const maxT = Math.max(0, ...loads.map(l => Math.abs(l.T ?? 0)));
  if (maxT > 0) {
    unsupported.push('Torsion design is not implemented. Nonzero torsion prevents a PASS result.');
    checks.push(check('torsion', 'Torsion design scope', STATUS.FAIL, maxT, 0, 'N·mm', 'ACI §22.7 / BS §3.4.5.13', 'Unsupported: torsion requires separate design.'));
  }

  for (const load of loads) {
    const Pu = load.Pu ?? 0;
    let Mx = (load.Mx ?? 0) + Pu * (load.ey ?? 0);
    let My = (load.My ?? 0) + Pu * (load.ex ?? 0);
    let sl;
    try {
      sl = slender.assessSlenderness({ section: sectionFinal, concrete, steel, height, load: { ...load, Mx, My }, tieDb: transverse.db });
      checks.push(...sl.checks.map(c => ({ ...c, id: `${c.id}-${load.id}`, load: load.name })));
      steps.push(...sl.x.steps.map(s => ({ ...s, load: load.name })), ...sl.y.steps.map(s => ({ ...s, load: load.name })));
      Mx = sl.designMx; My = sl.designMy;
    } catch (e) {
      if (e instanceof UnsupportedError) {
        unsupported.push(e.message);
        checks.push(check(`slender-${load.id}`, `Slenderness (${load.name})`, STATUS.FAIL, null, null, '—', e.clause ?? 'Slenderness', e.message));
        loadResults.push({ load, status: STATUS.FAIL, error: e.message });
        continue;
      }
      throw e;
    }
    let cap;
    try {
      if (code === 'BS8110-1997' && Math.abs(Mx) > 1e-6 && Math.abs(My) > 1e-6) {
        cap = BSbiax.checkBiaxial({ section: sectionFinal, concrete, steel, Pu, Mx, My, tieDb: transverse.db, braced: height.braced !== false, angles: options.angles ?? 72 });
      } else {
        cap = checkCapacity({ code, section: sectionFinal, concrete, steel, Pu, Mx, My, transverseType: transverse.type, braced: height.braced !== false, angles: options.angles ?? 72, steps: options.steps ?? 80 });
      }
      checks.push(...cap.checks.map(c => ({ ...c, id: `${c.id}-${load.id}`, load: load.name })));
      loadResults.push({ load, designMx: Mx, designMy: My, slenderness: sl, capacity: cap, status: cap.status, utilization: cap.utilization });
    } catch (e) {
      checks.push(check(`capacity-${load.id}`, `Capacity (${load.name})`, STATUS.FAIL, null, null, '—', 'Strain compatibility', e.message));
      loadResults.push({ load, status: STATUS.FAIL, error: e.message, utilization: Infinity });
    }
  }

  const detailing = det.detailingChecks({ section: sectionFinal, concrete, steel, tieSteel, transverse, exposure: input.exposure, aggregateSize: input.aggregateSize ?? 20, loads });
  checks.push(...detailing);

  let requiredAs = null;
  try { requiredAs = estimateRequiredAs({ code, section: sectionFinal, concrete, steel, loads, height, transverse, angles: 36 }); } catch { }

  const governing = loadResults.reduce((best, r) => (!best || (r.utilization ?? Infinity) > (best.utilization ?? -Infinity)) ? r : best, null);
  const status = worstStatus(checks.map(c => c.status));
  const engine = getEngine(code);
  const axial = engine.axialDesignStrength(sectionFinal, concrete, steel, { transverseType: transverse.type, braced: height.braced !== false });
  return {
    code, codeLabel: code === 'ACI318-25' ? 'ACI 318-25' : 'BS 8110-1:1997',
    status, checks, steps, loadResults, governing, requiredAs,
    section: sectionFinal, concrete, steel, tieSteel, transverse, height,
    axial, unsupported,
    geometry: { shape: sectionFinal.shape, b: sectionFinal.b, h: sectionFinal.h, D: sectionFinal.D, Ag: sectionFinal.Ag, Ac: sectionFinal.Ac, As: sectionFinal.As, rho: sectionFinal.rho, Ix: sectionFinal.Ix, Iy: sectionFinal.Iy, rx: sectionFinal.rx, ry: sectionFinal.ry },
    summary: {
      As: sectionFinal.As, rho: sectionFinal.rho, barCount: sectionFinal.bars.length,
      utilization: governing?.utilization ?? null, governingLoad: governing?.load?.name ?? null,
      axialCapacity: code === 'ACI318-25' ? axial.phiPnMax : axial.governing,
    },
  };
}
