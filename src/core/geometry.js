/** Section geometry, bar layout generation, and exact concrete compression-region integration. */
import { finite, positive, integer, oneOf, ValidationError } from './validation.js';

export const barArea = db => Math.PI * db * db / 4;
export const steelWeightKg = (As_mm2, length_mm, density = 7850) => As_mm2 * 1e-6 * length_mm * 1e-3 * density;

export function rectPolygon(b, h) {
  return [{ x: -b / 2, y: -h / 2 }, { x: b / 2, y: -h / 2 }, { x: b / 2, y: h / 2 }, { x: -b / 2, y: h / 2 }];
}

/** Sutherland–Hodgman clip of convex polygon by half-plane n·p >= t. */
export function clipPolygonHalfPlane(poly, nx, ny, t) {
  const out = [];
  const inside = p => nx * p.x + ny * p.y - t;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = inside(a), db = inside(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const f = da / (da - db);
      out.push({ x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) });
    }
  }
  return out;
}

export function polygonAreaCentroid(poly) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    A += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
  }
  A *= 0.5;
  if (Math.abs(A) < 1e-12) return { area: 0, cx: 0, cy: 0 };
  return { area: Math.abs(A), cx: cx / (6 * A), cy: cy / (6 * A) };
}

/**
 * Concrete compression region for a unit normal n pointing toward the compression face.
 * t is the signed distance from section centroid to the stress-block boundary along n.
 * Returns area and centroid of {p in section : n·p >= t}.
 */
export function compressionRegion(section, nx, ny, t) {
  if (section.shape === 'circle') {
    const R = section.D / 2;
    if (t <= -R) return { area: Math.PI * R * R, cx: 0, cy: 0 };
    if (t >= R) return { area: 0, cx: 0, cy: 0 };
    const area = R * R * Math.acos(t / R) - t * Math.sqrt(R * R - t * t);
    const Q = (2 / 3) * Math.pow(R * R - t * t, 1.5);
    const d = Q / area;
    return { area, cx: d * nx, cy: d * ny };
  }
  const poly = clipPolygonHalfPlane(rectPolygon(section.b, section.h), nx, ny, t);
  return polygonAreaCentroid(poly);
}

export function sectionExtent(section, nx, ny) {
  if (section.shape === 'circle') return section.D / 2;
  return (Math.abs(nx) * section.b + Math.abs(ny) * section.h) / 2;
}

export function generatePerimeterBars(opts) {
  const { shape, b, h, D, cover, tieDb, barDb } = opts;
  const offset = cover + tieDb + barDb / 2;
  if (shape === 'circle') {
    const n = integer(opts.n ?? 8, 'n', { min: 6, max: 64 });
    const r = D / 2 - offset;
    if (r <= 0) throw new ValidationError('Cover + tie + bar radius exceeds circular section radius.', 'cover');
    return Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + 2 * Math.PI * i / n;
      return { x: r * Math.cos(a), y: r * Math.sin(a), db: barDb, As: barArea(barDb) };
    });
  }
  const nx = integer(opts.nx ?? 3, 'nx', { min: 2, max: 12 });
  const ny = integer(opts.ny ?? 3, 'ny', { min: 2, max: 12 });
  const bx = b / 2 - offset, by = h / 2 - offset;
  if (bx <= 0 || by <= 0) throw new ValidationError('Cover + tie + bar radius exceeds rectangular section.', 'cover');
  const bars = [];
  const push = (x, y) => bars.push({ x, y, db: barDb, As: barArea(barDb) });
  for (let i = 0; i < nx; i++) push(-bx + 2 * bx * i / (nx - 1), by);
  for (let i = 0; i < nx; i++) push(-bx + 2 * bx * i / (nx - 1), -by);
  for (let j = 1; j < ny - 1; j++) { push(-bx, -by + 2 * by * j / (ny - 1)); push(bx, -by + 2 * by * j / (ny - 1)); }
  return bars;
}

export function normalizeSection(input) {
  const shape = oneOf(input.shape ?? 'rect', 'shape', ['rect', 'circle']);
  const cover = positive(input.cover ?? 40, 'cover', { max: 200 });
  let b, h, D;
  if (shape === 'circle') {
    D = positive(input.D ?? 500, 'D', { min: 150, max: 5000 });
    b = h = D;
  } else {
    b = positive(input.b ?? 400, 'b', { min: 150, max: 5000 });
    h = positive(input.h ?? 600, 'h', { min: 150, max: 5000 });
    D = undefined;
  }
  const section = { shape, b, h, D, cover };
  let bars;
  if (Array.isArray(input.bars) && input.bars.length) {
    bars = input.bars.map((bar, i) => {
      const x = finite(bar.x, `bars[${i}].x`);
      const y = finite(bar.y, `bars[${i}].y`);
      const db = positive(bar.db, `bars[${i}].db`, { min: 6, max: 60 });
      const As = bar.As !== undefined ? positive(bar.As, `bars[${i}].As`) : barArea(db);
      return { x, y, db, As };
    });
  } else if (input.arrangement) {
    bars = generatePerimeterBars({ shape, b, h, D, cover, tieDb: input.tieDb ?? 10, barDb: input.arrangement.barDb ?? 20, nx: input.arrangement.nx, ny: input.arrangement.ny, n: input.arrangement.n });
  } else {
    bars = generatePerimeterBars({ shape, b, h, D, cover, tieDb: input.tieDb ?? 10, barDb: 20, nx: 3, ny: 3, n: 8 });
  }
  if (bars.length < (shape === 'circle' ? 6 : 4)) throw new ValidationError(`Minimum ${shape === 'circle' ? 6 : 4} longitudinal bars required.`, 'bars');
  const As = bars.reduce((s, bar) => s + bar.As, 0);
  const Ag = shape === 'circle' ? Math.PI * D * D / 4 : b * h;
  const Ix = shape === 'circle' ? Math.PI * Math.pow(D, 4) / 64 : b * Math.pow(h, 3) / 12;
  const Iy = shape === 'circle' ? Math.PI * Math.pow(D, 4) / 64 : h * Math.pow(b, 3) / 12;
  const Ise_x = bars.reduce((s, bar) => s + bar.As * bar.y * bar.y, 0);
  const Ise_y = bars.reduce((s, bar) => s + bar.As * bar.x * bar.x, 0);
  return {
    ...section, bars, As, Ag, Ac: Ag - As,
    centroid: { x: 0, y: 0 }, Ix, Iy, Ise_x, Ise_y,
    rx: Math.sqrt(Ix / Ag), ry: Math.sqrt(Iy / Ag),
    rho: As / Ag,
  };
}

export function validateBarPlacement(section, tieDb) {
  const issues = [];
  for (let i = 0; i < section.bars.length; i++) {
    const bar = section.bars[i];
    const clearToFace = section.shape === 'circle'
      ? section.D / 2 - Math.hypot(bar.x, bar.y) - bar.db / 2
      : Math.min(section.b / 2 - Math.abs(bar.x), section.h / 2 - Math.abs(bar.y)) - bar.db / 2;
    const required = section.cover + tieDb;
    if (clearToFace < required - 1e-6) issues.push({ bar: i, clearToFace, required });
  }
  return issues;
}

export function minClearBarSpacing(section) {
  let min = Infinity;
  for (let i = 0; i < section.bars.length; i++) for (let j = i + 1; j < section.bars.length; j++) {
    const a = section.bars[i], b = section.bars[j];
    const clear = Math.hypot(a.x - b.x, a.y - b.y) - (a.db + b.db) / 2;
    if (clear < min) min = clear;
  }
  return Number.isFinite(min) ? min : Infinity;
}
