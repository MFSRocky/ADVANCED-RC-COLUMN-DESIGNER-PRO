/** Professional PDF calculation report using local jsPDF. Browser-only. */
import { reinforcementSchedule } from '../drawings/reinforcement.js';

function getJsPDF() {
  if (typeof window !== 'undefined' && window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  throw new Error('jsPDF not loaded. Include vendor/jspdf.umd.min.js.');
}

export function generateReport(result, project = {}, images = {}) {
  const jsPDF = getJsPDF();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297, M = 16;
  let y = M;
  const line = (txt, size = 10, style = 'normal', color = [30, 30, 30]) => {
    if (y > H - 20) { doc.addPage(); y = M; }
    doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(String(txt), W - 2 * M);
    doc.text(lines, M, y); y += lines.length * size * 0.42 + 1.5;
  };
  const heading = (txt) => { y += 3; line(txt, 13, 'bold', [0, 60, 120]); doc.setDrawColor(0, 60, 120); doc.line(M, y - 1, W - M, y - 1); y += 2; };
  const table = (headers, rows, widths) => {
    if (y > H - 40) { doc.addPage(); y = M; }
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (W - 2 * M) / total;
    const ws = widths.map(w => w * scale);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setFillColor(240, 244, 248);
    let x = M;
    doc.rect(M, y - 4, W - 2 * M, 7, 'F');
    headers.forEach((h, i) => { doc.text(String(h), x + 1, y); x += ws[i]; });
    y += 5;
    doc.setFont('helvetica', 'normal');
    for (const row of rows) {
      if (y > H - 16) { doc.addPage(); y = M; }
      x = M;
      let maxLines = 1;
      const cells = row.map((c, i) => { const ls = doc.splitTextToSize(String(c ?? ''), ws[i] - 2); maxLines = Math.max(maxLines, ls.length); return ls; });
      cells.forEach((ls, i) => { doc.text(ls, x + 1, y); x += ws[i]; });
      y += maxLines * 3.6 + 1.5;
      doc.setDrawColor(220); doc.line(M, y - 1, W - M, y - 1);
    }
    y += 3;
  };

  // Cover / metadata
  doc.setFillColor(0, 60, 120); doc.rect(0, 0, W, 28, 'F');
  doc.setTextColor(255); doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('RC COLUMN DESIGNER PRO', M, 13);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Structural Calculation Report — ' + result.codeLabel, M, 21);
  y = 36;
  line(`Project: ${project.name ?? '—'}    Client: ${project.client ?? '—'}    Project No.: ${project.projectNumber ?? '—'}`, 10);
  line(`Engineer: ${project.engineer ?? '—'}    Column: ${project.columnMark ?? '—'}    Date: ${new Date().toLocaleDateString()}`, 10);
  line(`Overall status: ${result.status}    Governing load: ${result.summary.governingLoad ?? '—'}    Utilization: ${result.summary.utilization?.toFixed(3) ?? '—'}`, 11, 'bold', result.status === 'PASS' ? [0, 120, 60] : result.status === 'WARNING' ? [180, 120, 0] : [180, 0, 0]);

  heading('1. Design Basis');
  line(`Design code: ${result.codeLabel}. Internal units: N, mm, MPa. Compression positive. Moments about section centroid. Displaced concrete deducted at compression bars.`);
  line(`Scope gates: ${result.unsupported.length ? result.unsupported.join(' ') : 'No unsupported provisions triggered for this input.'}`);
  line('This report is generated from the input model and must be checked by a competent engineer against the licensed code text. Seismic, torsion, prestress, anchorage and splice design are outside the verified scope unless explicitly supported.');

  heading('2. Geometry & Materials');
  const g = result.geometry;
  table(['Property', 'Value'], [
    ['Shape', g.shape], ['Dimensions', g.shape === 'circle' ? `D = ${g.D} mm` : `b = ${g.b} mm, h = ${g.h} mm`],
    ['Ag', `${g.Ag.toFixed(0)} mm²`], ['As', `${g.As.toFixed(1)} mm²`], ['ρ', `${(g.rho * 100).toFixed(2)} %`],
    ['Ix / Iy', `${g.Ix.toExponential(3)} / ${g.Iy.toExponential(3)} mm⁴`], ['rx / ry', `${g.rx.toFixed(1)} / ${g.ry.toFixed(1)} mm`],
    ['Concrete', result.code === 'ACI318-25' ? `f'c = ${result.concrete.fc} MPa, Ec = ${result.concrete.Ec.toFixed(0)} MPa` : `fcu = ${result.concrete.fcu} MPa, Ec = ${result.concrete.Ec.toFixed(0)} MPa`],
    ['Steel', `fy = ${result.steel.fy} MPa, Es = ${result.steel.Es} MPa`],
    ['Transverse', `${result.transverse.type} Ø${result.transverse.db} @ ${result.transverse.spacing} mm`],
    ['Cover', `${result.section.cover} mm to ties/links`],
  ], [60, 120]);

  heading('3. Load Combinations');
  table(['Load', 'Pu (kN)', 'Mx (kN·m)', 'My (kN·m)', 'Design Mx', 'Design My', 'Utilization', 'Status'],
    result.loadResults.map(r => [r.load.name, ((r.load.Pu ?? 0) / 1000).toFixed(1), ((r.load.Mx ?? 0) / 1e6).toFixed(1), ((r.load.My ?? 0) / 1e6).toFixed(1), ((r.designMx ?? r.load.Mx ?? 0) / 1e6).toFixed(1), ((r.designMy ?? r.load.My ?? 0) / 1e6).toFixed(1), r.utilization?.toFixed(3) ?? '—', r.status]), [34, 22, 24, 24, 24, 24, 22, 20]);

  heading('4. Slenderness & Second-Order Effects');
  for (const r of result.loadResults) {
    if (!r.slenderness) continue;
    line(`${r.load.name}: X ${r.slenderness.x.classification} (le/h=${r.slenderness.x.ratio.toFixed(2)}), Y ${r.slenderness.y.classification} (le/b=${r.slenderness.y.ratio.toFixed(2)}). Madd,x=${(r.slenderness.x.Madd / 1e6).toFixed(2)} kN·m, Madd,y=${(r.slenderness.y.Madd / 1e6).toFixed(2)} kN·m.`, 9);
  }
  if (result.steps.length) table(['Step', 'Equation', 'Substitution', 'Value', 'Clause'], result.steps.slice(0, 40).map(s => [s.label, s.equation, s.substitution, `${Number(s.value).toPrecision(5)} ${s.unit}`, s.clause]), [34, 34, 60, 30, 26]);

  heading('5. Capacity Verification');
  for (const r of result.loadResults) {
    const cap = r.capacity;
    if (!cap) { line(`${r.load.name}: ${r.error}`, 9, 'normal', [180, 0, 0]); continue; }
    line(`${r.load.name}: ${cap.status}; utilization ${cap.utilization.toFixed(3)}; axial ${cap.axialUtil.toFixed(3)}; moment ${cap.momentUtil.toFixed(3)}; capacity point (${(cap.capacityPoint.Mx / 1e6).toFixed(1)}, ${(cap.capacityPoint.My / 1e6).toFixed(1)}) kN·m.`, 9);
  }
  table(['Check', 'Status', 'Value', 'Limit', 'Clause', 'Detail'], result.checks.map(c => [c.name, c.status, c.value == null ? '—' : Number(c.value).toPrecision(5), c.limit == null ? '—' : Number(c.limit).toPrecision(5), c.clause, c.message]), [34, 18, 22, 22, 30, 60]);

  heading('6. Reinforcement Schedule');
  const sched = reinforcementSchedule(result);
  table(['Mark', 'Type', 'Ø', 'Qty', 'Length (mm)', 'Shape', 'Weight (kg)'], sched.map(r => [r.mark, r.type, r.db, r.count, r.length.toFixed(0), r.shape, r.weight.toFixed(1)]), [16, 30, 14, 14, 28, 44, 24]);

  if (images.crossSection || images.elevation || images.interaction) {
    heading('7. Drawings & Interaction');
    for (const [key, label] of [['crossSection', 'Cross-section'], ['elevation', 'Elevation'], ['interaction', 'Interaction diagram']]) {
      if (!images[key]) continue;
      if (y > H - 90) { doc.addPage(); y = M; }
      line(label, 10, 'bold');
      try { doc.addImage(images[key], 'PNG', M, y, key === 'elevation' ? 70 : 120, key === 'elevation' ? 120 : 90); y += key === 'elevation' ? 124 : 94; } catch { line('Image could not be embedded.', 9); }
    }
  }
  heading('8. Summary & Limitations');
  line(`Provided As = ${result.summary.As.toFixed(1)} mm² (ρ = ${(result.summary.rho * 100).toFixed(2)}%). Estimated required As (strength, current layout) = ${result.requiredAs ? result.requiredAs.toFixed(1) + ' mm²' : 'not converged — increase section or revise loads'}.`);
  line('Optimization results, where shown, are selected only from evaluated feasible candidates. They are not a substitute for code compliance review. All PASS results are conditional on the input assumptions and the verified scope stated above.');

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`RC Column Designer Pro · ${result.codeLabel} · Page ${p}/${pages}`, M, H - 8);
    doc.text('Generated offline — verify against licensed code', W - M, H - 8, { align: 'right' });
  }
  return doc;
}

export function reportCSV(result) {
  const lines = ['check_id,name,status,value,limit,unit,clause,message'];
  for (const c of result.checks) lines.push([c.id, c.name, c.status, c.value ?? '', c.limit ?? '', c.unit, c.clause, `"${(c.message ?? '').replace(/"/g, '""')}"`].join(','));
  return lines.join('\n');
}
