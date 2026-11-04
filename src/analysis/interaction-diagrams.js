/** Interaction diagram data generation and CSV export. */
import { getEngine, biaxialContour } from './capacity-check.js';

export function uniaxialDiagram({ code, section, concrete, steel, axis = 'x', transverseType = 'ties', points = 140 }) {
  const engine = getEngine(code);
  const angle = axis === 'x' ? Math.PI / 2 : 0;
  const curve = engine.interactionCurve(section, concrete, steel, angle, { transverseType, points });
  return { code, axis, angle, ...curve };
}

export function biaxialDiagram({ code, section, concrete, steel, Pu, angles = 96, transverseType = 'ties', braced = true }) {
  const engine = getEngine(code);
  return biaxialContour(engine, section, concrete, steel, Pu, { angles, transverseType, braced });
}

export function diagramCSV(diagram) {
  const lines = ['c_mm,a_mm,Pn_N,Mx_n_Nmm,My_n_Nmm,phi,Pd_N,Mxd_Nmm,Myd_Nmm,eps_t,phi_capped'];
  for (const r of diagram.rows) {
    lines.push([r.c, r.a, r.Pn, r.Mx_n, r.My_n, r.phi, r.Pd, r.Mxd, r.Myd, r.epsT, r.phiCapped ? 1 : 0].map(v => Number(v).toPrecision(10)).join(','));
  }
  return lines.join('\n');
}

export function surfaceCSV(points) {
  const lines = ['angle_rad,Mx_Nmm,My_Nmm,c_mm,phi'];
  for (const p of points) lines.push([p.angle, p.Mx, p.My, p.c, p.phi ?? 1].map(v => Number(v).toPrecision(10)).join(','));
  return lines.join('\n');
}
