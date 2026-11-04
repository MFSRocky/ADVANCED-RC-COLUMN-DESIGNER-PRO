/** Robust 1-D root finding with explicit convergence reporting. */
import { ConvergenceError } from './validation.js';

export function bisection(f, a, b, { tol = 1e-9, maxIter = 200, relTol = 1e-12 } = {}) {
  let fa = f(a), fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) throw new ConvergenceError('Non-finite bracket endpoint.', { a, b, fa, fb });
  if (fa === 0) return { root: a, iterations: 0, converged: true, residual: 0 };
  if (fb === 0) return { root: b, iterations: 0, converged: true, residual: 0 };
  if (fa * fb > 0) throw new ConvergenceError('Bisection bracket does not enclose a root.', { a, b, fa, fb });
  let lo = a, hi = b, flo = fa, mid = a, fmid = fa;
  for (let i = 1; i <= maxIter; i++) {
    mid = lo + (hi - lo) / 2;
    fmid = f(mid);
    if (!Number.isFinite(fmid)) throw new ConvergenceError('Non-finite residual during bisection.', { mid, fmid });
    const tolerance = tol + relTol * Math.abs(mid);
    if (Math.abs(fmid) === 0 || (hi - lo) / 2 < tolerance) {
      return { root: mid, iterations: i, converged: true, residual: fmid };
    }
    if (flo * fmid < 0) { hi = mid; } else { lo = mid; flo = fmid; }
  }
  return { root: mid, iterations: maxIter, converged: false, residual: fmid };
}

/** Brent's method (Numerical Recipes style) with bisection fallback. */
export function brent(f, a, b, { tol = 1e-10, maxIter = 200 } = {}) {
  let fa = f(a), fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) throw new ConvergenceError('Non-finite bracket endpoint.', { a, b, fa, fb });
  if (fa * fb > 0) throw new ConvergenceError('Brent bracket does not enclose a root.', { a, b, fa, fb });
  if (Math.abs(fa) < Math.abs(fb)) { [a, b] = [b, a]; [fa, fb] = [fb, fa]; }
  let c = a, fc = fa, d = b - a, e = d, mflag = true;
  let s = b, fs = fb;
  for (let i = 1; i <= maxIter; i++) {
    if (Math.abs(fb) === 0 || Math.abs(b - a) < tol) return { root: b, iterations: i, converged: true, residual: fb };
    if (fa !== fc && fb !== fc) {
      s = a * fb * fc / ((fa - fb) * (fa - fc)) + b * fa * fc / ((fb - fa) * (fb - fc)) + c * fa * fb / ((fc - fa) * (fc - fb));
    } else {
      s = b - fb * (b - a) / (fb - fa);
    }
    const cond1 = !((s > (3 * a + b) / 4 && s < b) || (s < (3 * a + b) / 4 && s > b));
    const cond2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2;
    const cond3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2;
    const cond4 = mflag && Math.abs(b - c) < tol;
    const cond5 = !mflag && Math.abs(c - d) < tol;
    if (cond1 || cond2 || cond3 || cond4 || cond5) { s = (a + b) / 2; mflag = true; } else mflag = false;
    fs = f(s);
    if (!Number.isFinite(fs)) throw new ConvergenceError('Non-finite residual during Brent iteration.', { s, fs });
    d = c; c = b; fc = fb;
    if (fa * fs < 0) { b = s; fb = fs; } else { a = s; fa = fs; }
    if (Math.abs(fa) < Math.abs(fb)) { [a, b] = [b, a]; [fa, fb] = [fb, fa]; }
    e = d;
  }
  return { root: b, iterations: maxIter, converged: Math.abs(fb) < 1e-6, residual: fb };
}

export function linspace(a, b, n) {
  if (n < 2) return [a];
  return Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
}
export function logspace(a, b, n) {
  if (a <= 0 || b <= 0) throw new Error('logspace requires positive bounds');
  const la = Math.log(a), lb = Math.log(b);
  return Array.from({ length: n }, (_, i) => Math.exp(la + (lb - la) * i / (n - 1)));
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const nearlyEqual = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Find all sign-change roots of f on [a,b] using a scan + Brent. Useful for non-monotonic design axial curves. */
export function scanRoots(f, a, b, { steps = 120, tol = 1e-9 } = {}) {
  const xs = linspace(a, b, steps + 1);
  const roots = [];
  let prevX = xs[0], prevF = f(prevX);
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i], fx = f(x);
    if (Number.isFinite(prevF) && Number.isFinite(fx)) {
      if (prevF === 0) roots.push(prevX);
      else if (prevF * fx < 0) {
        try { roots.push(brent(f, prevX, x, { tol }).root); } catch { /* skip non-bracketed numeric noise */ }
      }
    }
    prevX = x; prevF = fx;
  }
  if (prevF === 0) roots.push(prevX);
  return [...new Set(roots.map(r => Number(r.toFixed(10))))];
}
