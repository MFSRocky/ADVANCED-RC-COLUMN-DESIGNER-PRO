/** Canvas interaction diagrams. No external chart library — fully offline. */
export function drawUniaxial(canvas, diagram, loads = []) {
  const ctx = setup(canvas);
  const W = canvas.logicalWidth, H = canvas.logicalHeight;
  const rows = diagram.rows ?? [];
  if (!rows.length) return;
  const pad = { l: 64, r: 20, t: 20, b: 44 };
  const maxM = Math.max(1, ...rows.map(r => Math.abs(r.Mxd ?? r.Md ?? 0)), ...loads.map(l => Math.abs(l.M ?? 0))) * 1.1;
  const maxP = Math.max(1, ...rows.map(r => r.Pd ?? r.Pn ?? 0), ...loads.map(l => l.P ?? 0)) * 1.1;
  const minP = Math.min(0, ...rows.map(r => r.Pd ?? r.Pn ?? 0)) * 1.1;
  const X = m => pad.l + (m / maxM) * (W - pad.l - pad.r);
  const Y = p => H - pad.b - ((p - minP) / (maxP - minP)) * (H - pad.t - pad.b);
  grid(ctx, W, H, pad, maxM, maxP, minP, 'M (kN·m)', 'P (kN)');
  // Nominal
  ctx.strokeStyle = '#9aa8b6'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.beginPath();
  rows.forEach((r, i) => { const x = X(Math.abs(r.Mx_n ?? r.Mn ?? 0) / 1e6), y = Y((r.Pn ?? 0) / 1000); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);
  // Design
  ctx.strokeStyle = '#0b5cad'; ctx.lineWidth = 2.5; ctx.beginPath();
  rows.forEach((r, i) => { const x = X(Math.abs(r.Mxd ?? r.Md ?? 0) / 1e6), y = Y((r.Pd ?? r.Pn ?? 0) / 1000); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke();
  // Balanced point
  if (diagram.balanced) { dot(ctx, X(diagram.balanced.Md / 1e6), Y(diagram.balanced.Pd / 1000), '#9a6700', 'Balanced'); }
  for (const l of loads) { dot(ctx, X(Math.abs(l.M ?? 0) / 1e6), Y((l.P ?? 0) / 1000), l.fail ? '#b3261e' : '#137a4b', l.name ?? 'Load'); }
  legend(ctx, W, [['Design', '#0b5cad'], ['Nominal', '#9aa8b6']]);
}

export function drawBiaxial(canvas, surface, load) {
  const ctx = setup(canvas);
  const W = canvas.logicalWidth, H = canvas.logicalHeight;
  const pts = surface?.points ?? [];
  const pad = 50;
  const max = Math.max(1, ...pts.map(p => Math.max(Math.abs(p.Mx), Math.abs(p.My))), Math.abs(load?.Mx ?? 0), Math.abs(load?.My ?? 0)) * 1.15 / 1e6;
  const X = m => W / 2 + (m / 1e6 / max) * (W / 2 - pad);
  const Y = m => H / 2 - (m / 1e6 / max) * (H / 2 - pad);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = getVar('--border'); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.moveTo(W / 2, pad); ctx.lineTo(W / 2, H - pad); ctx.stroke();
  ctx.fillStyle = getVar('--muted'); ctx.font = '12px Inter'; ctx.fillText('My (kN·m)', W / 2 + 6, pad - 8); ctx.fillText('Mx (kN·m)', W - pad - 60, H / 2 + 16);
  if (pts.length) {
    ctx.strokeStyle = '#0b5cad'; ctx.lineWidth = 2.5; ctx.beginPath();
    pts.forEach((p, i) => { const x = X(p.Mx), y = Y(p.My); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = 'rgba(11,92,173,.08)'; ctx.fill();
  }
  if (load) {
    ctx.strokeStyle = '#137a4b'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.lineTo(X(load.Mx), Y(load.My)); ctx.stroke(); ctx.setLineDash([]);
    dot(ctx, X(load.Mx), Y(load.My), load.fail ? '#b3261e' : '#137a4b', 'Load');
  }
}

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(300, rect.width * dpr); canvas.height = Math.max(240, rect.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  canvas.logicalWidth = rect.width; canvas.logicalHeight = rect.height;
  ctx.clearRect(0, 0, rect.width, rect.height);
  return ctx;
}
function getVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
function grid(ctx, W, H, pad, maxM, maxP, minP, xl, yl) {
  ctx.strokeStyle = getVar('--border'); ctx.fillStyle = getVar('--muted'); ctx.font = '11px Inter'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const x = pad.l + i / 5 * (W - pad.l - pad.r);
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
    ctx.fillText((maxM * i / 5).toFixed(0), x - 10, H - pad.b + 16);
    const y = pad.t + i / 5 * (H - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText((maxP - (maxP - minP) * i / 5).toFixed(0), 8, y + 4);
  }
  ctx.fillText(xl, W / 2 - 20, H - 8); ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yl, -20, 0); ctx.restore();
}
function dot(ctx, x, y, color, label) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = getVar('--text'); ctx.font = '11px Inter'; ctx.fillText(label, x + 8, y - 6);
}
function legend(ctx, W, items) {
  let x = W - 160; const y = 14;
  for (const [label, color] of items) { ctx.fillStyle = color; ctx.fillRect(x, y, 14, 3); ctx.fillStyle = getVar('--muted'); ctx.font = '11px Inter'; ctx.fillText(label, x + 18, y + 4); x += 70; }
}
