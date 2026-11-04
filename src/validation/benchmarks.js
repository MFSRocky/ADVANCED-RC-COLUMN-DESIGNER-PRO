/** Engineering regression benchmarks shared by Node tests and the in-app Validation tab. */
import { convert } from '../core/unit-converter.js';
import { brent } from '../core/numerical-solver.js';
import { normalizeSection, barArea } from '../core/geometry.js';
import * as ACI from '../codes/aci318-25/section-analysis.js';
import * as BS from '../codes/bs8110-1997/section-analysis.js';
import { designColumn } from '../analysis/design-column.js';
import { getEngine, checkCapacity } from '../analysis/capacity-check.js';
import { validateDXF, columnDXF } from '../drawings/dxf-export.js';
import { equivalentUniaxial, effectiveHeight } from '../codes/bs8110-1997/slenderness.js';
import { optimize } from '../codes/aci318-25/optimization.js';

const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

function sec(shape, b, h, D, barDb, nx, ny, n, cover = 40, tieDb = 10) {
  return normalizeSection({ shape, b, h, D, cover, tieDb, arrangement: shape === 'circle' ? { barDb, n } : { barDb, nx, ny } });
}

export async function runBenchmarks({ quick = false } = {}) {
  const cases = [];
  const add = (name, passed, details) => cases.push({ name, passed, details });

  // 1. ACI axial cap hand calculation
  {
    const s = sec('rect', 400, 600, 0, 25, 3, 4);
    const c = { fc: 30 }, st = { fy: 420 };
    const cap = ACI.axialDesignStrength(s, c, st, 'ties');
    const P0 = 0.85 * 30 * (s.Ag - s.As) + 420 * s.As;
    const expected = 0.65 * 0.80 * P0;
    add('ACI 318-25 axial cap (Table 22.4.2.1)', near(cap.phiPnMax, expected, 1e-9), `φPn,max = ${cap.phiPnMax.toFixed(1)} N; hand = ${expected.toFixed(1)} N`);
  }
  // 2. BS axial caps hand calculation
  {
    const s = sec('rect', 400, 500, 0, 25, 3, 3, undefined, 30, 8);
    const c = { fcu: 35 }, st = { fy: 460 };
    const cap = BS.axialDesignStrength(s, c, st, { braced: true });
    const Ac = s.Ag - s.As;
    const N3 = 0.4 * 35 * Ac + 0.8 * 460 * s.As;
    const N4 = 0.35 * 35 * Ac + 0.7 * 460 * s.As;
    add('BS 8110-1:1997 axial caps (§3.8.4.3/4)', near(cap.governing, Math.min(N3, N4), 1e-9), `Ncap = ${cap.governing.toFixed(1)} N; hand = ${Math.min(N3, N4).toFixed(1)} N`);
  }
  // 3. ACI pure bending equilibrium + tension-controlled phi
  {
    const s = sec('rect', 400, 600, 0, 25, 3, 4);
    const pure = ACI.solveForAxial(s, { fc: 30 }, { fy: 420, Es: 200000 }, 0, Math.PI / 2);
    add('ACI strain compatibility equilibrium', Math.abs(pure.residual) < 1, `Pure bending residual = ${pure.residual.toExponential(2)} N; φ = ${pure.phi}`);
    add('ACI pure bending φ = 0.90', near(pure.phi, 0.9, 1e-6), `φ = ${pure.phi.toFixed(4)}`);
  }
  // 4. BS pure bending equilibrium
  {
    const s = sec('rect', 400, 600, 0, 25, 3, 4, undefined, 30, 8);
    const pure = BS.solveForAxial(s, { fcu: 30 }, { fy: 460, Es: 200000 }, 0, Math.PI / 2);
    add('BS strain compatibility equilibrium', Math.abs(pure.residual) < 1, `Pure bending residual = ${pure.residual.toExponential(2)} N; M = ${(pure.Mx / 1e6).toFixed(2)} kN·m`);
  }
  // 5. Geometry properties
  {
    const r = sec('rect', 400, 600, 0, 20, 2, 2);
    const c = sec('circle', 0, 0, 500, 20, undefined, undefined, 8);
    add('Rectangular section properties', near(r.Ag, 240000, 1e-12) && near(r.Ix, 400 * 600 ** 3 / 12, 1e-9), `Ag=${r.Ag}, Ix=${r.Ix.toExponential(4)}`);
    add('Circular section properties', near(c.Ag, Math.PI * 250 ** 2, 1e-9) && near(c.Ix, Math.PI * 500 ** 4 / 64, 1e-9), `Ag=${c.Ag.toFixed(1)}, Ix=${c.Ix.toExponential(4)}`);
  }
  // 6. Unit conversions
  {
    add('Unit conversion kN→N', convert(1, 'kN', 'N', 'force') === 1000, '1 kN = 1000 N');
    add('Unit conversion kN·m→N·mm', convert(1, 'kN·m', 'N·mm', 'moment') === 1e6, '1 kN·m = 1e6 N·mm');
  }
  // 7. Numerical solver
  {
    const r = brent(x => x * x - 2, 0, 2);
    add('Brent root solver', near(r.root, Math.SQRT2, 1e-9), `√2 ≈ ${r.root.toFixed(12)} in ${r.iterations} iterations`);
  }
  // 8. Capacity check monotonic utilization
  {
    const s = sec('rect', 400, 600, 0, 25, 3, 4);
    const r1 = checkCapacity({ code: 'ACI318-25', section: s, concrete: { fc: 30 }, steel: { fy: 420, Es: 200000 }, Pu: 1000e3, Mx: 100e6, My: 0, angles: 24, steps: 50 });
    const r2 = checkCapacity({ code: 'ACI318-25', section: s, concrete: { fc: 30 }, steel: { fy: 420, Es: 200000 }, Pu: 1000e3, Mx: 200e6, My: 0, angles: 24, steps: 50 });
    add('Capacity utilization increases with moment', r2.utilization > r1.utilization, `u(100 kN·m)=${r1.utilization.toFixed(3)} < u(200 kN·m)=${r2.utilization.toFixed(3)}`);
  }
  // 9. BS braced effective height table
  {
    const s = sec('rect', 400, 600, 0, 20, 2, 2);
    const e11 = effectiveHeight(s, { clear: 4000, braced: true, endTopX: '1', endBottomX: '1' });
    const e33 = effectiveHeight(s, { clear: 4000, braced: true, endTopX: '3', endBottomX: '3' });
    add('BS Table 3.19 braced β', near(e11.betaX, 0.75, 1e-12) && near(e33.betaX, 1.0, 1e-12), `β11=${e11.betaX}, β33=${e33.betaX}`);
  }
  // 10. BS biaxial β interpolation
  {
    const s = sec('rect', 400, 600, 0, 20, 2, 2, undefined, 30, 8);
    const eq = equivalentUniaxial({ section: s, concrete: { fcu: 30 }, N: 0.3 * 400 * 600 * 30, Mx: 100e6, My: 50e6, tieDb: 8 });
    add('BS §3.8.4.5 biaxial β', near(eq.beta, 0.65, 1e-9) && eq.Mdesign >= Math.abs(100e6), `β=${eq.beta?.toFixed(3)} (Table 3.22 at N/(b·h·fcu)=0.3), M'=${(eq.Mdesign / 1e6).toFixed(1)} kN·m`);
  }
  // 11. DXF integrity
  {
    const s = sec('rect', 400, 600, 0, 25, 3, 4);
    const result = { section: s, transverse: { type: 'ties', db: 10, spacing: 150, crossTies: true }, codeLabel: 'ACI 318-25' };
    const v = validateDXF(columnDXF(result));
    add('DXF export integrity', v.valid && v.counts.CIRCLE >= s.bars.length && v.counts.LINE >= 8, `valid=${v.valid}, circles=${v.counts.CIRCLE}, lines=${v.counts.LINE}`);
  }
  // 12. Full design smoke
  {
    const r = designColumn({
      code: 'ACI318-25', geometry: { shape: 'rect', b: 400, h: 600 }, cover: 40,
      concrete: { fc: 30 }, steel: { fy: 420 }, tieSteel: { fy: 420 },
      arrangement: { barDb: 25, nx: 3, ny: 4 }, transverse: { type: 'ties', db: 10, spacing: 150 },
      height: { clear: 3500, braced: true, kx: 1, ky: 1 },
      loads: [{ name: 'ULS', Pu: 2500e3, Mx: 150e6, My: 80e6, M1x: 75e6, M2x: 150e6, M1y: 40e6, M2y: 80e6 }],
    }, { angles: 24 });
    add('ACI full design PASS', r.status === 'PASS', `status=${r.status}, u=${r.summary.utilization?.toFixed(3)}`);
  }
  if (!quick) {
    const opt = await optimize({
      code: 'ACI318-25', geometry: { shape: 'rect', b: 400, h: 600 }, cover: 40,
      concrete: { fc: 30 }, steel: { fy: 420 }, tieSteel: { fy: 420 },
      transverse: { type: 'ties' }, height: { clear: 3500, braced: true, kx: 1, ky: 1 },
      loads: [{ name: 'ULS', Pu: 2500e3, Mx: 150e6, My: 80e6, M1x: 75e6, M2x: 150e6, M1y: 40e6, M2y: 80e6 }],
    }, { barDiameters: [20, 25], maxPerFace: 4, angles: 24, maxAlternatives: 3 });
    const best = opt.alternatives[0];
    add('Optimization feasible candidate', !!best && best.status !== 'FAIL', `evaluated=${opt.searchSpace.evaluated}, feasible=${opt.searchSpace.feasible}, best As=${best?.As?.toFixed(0)}`);
  }
  const passed = cases.filter(c => c.passed).length;
  return { cases, passed, total: cases.length, allPassed: passed === cases.length };
}
