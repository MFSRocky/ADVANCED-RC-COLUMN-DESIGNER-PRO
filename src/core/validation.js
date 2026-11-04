/** Validation helpers. Engineering code must fail closed, never silently pass. */
export class ValidationError extends Error {
  constructor(message, field) { super(message); this.name = 'ValidationError'; this.field = field; }
}
export class UnsupportedError extends Error {
  constructor(message, clause) { super(message); this.name = 'UnsupportedError'; this.clause = clause; }
}
export class ConvergenceError extends Error {
  constructor(message, details) { super(message); this.name = 'ConvergenceError'; this.details = details; }
}

export function finite(value, field, { min, max, exclusiveMin, exclusiveMax } = {}) {
  const v = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(v)) throw new ValidationError(`${field} must be a finite number (received ${value}).`, field);
  if (min !== undefined && v < min) throw new ValidationError(`${field} must be ≥ ${min} (received ${v}).`, field);
  if (max !== undefined && v > max) throw new ValidationError(`${field} must be ≤ ${max} (received ${v}).`, field);
  if (exclusiveMin !== undefined && v <= exclusiveMin) throw new ValidationError(`${field} must be > ${exclusiveMin} (received ${v}).`, field);
  if (exclusiveMax !== undefined && v >= exclusiveMax) throw new ValidationError(`${field} must be < ${exclusiveMax} (received ${v}).`, field);
  return v;
}
export const positive = (v, f, opts = {}) => finite(v, f, { exclusiveMin: 0, ...opts });
export const nonNegative = (v, f, opts = {}) => finite(v, f, { min: 0, ...opts });
export const integer = (v, f, opts = {}) => {
  const n = finite(v, f, opts);
  if (!Number.isInteger(n)) throw new ValidationError(`${f} must be an integer (received ${n}).`, f);
  return n;
};
export function oneOf(v, f, allowed) {
  if (!allowed.includes(v)) throw new ValidationError(`${f} must be one of: ${allowed.join(', ')} (received ${v}).`, f);
  return v;
}
export function bool(v, f) {
  if (typeof v !== 'boolean') throw new ValidationError(`${f} must be true or false.`, f);
  return v;
}
export function str(v, f, maxLen = 200) {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) throw new ValidationError(`${f} must be a non-empty string ≤ ${maxLen} characters.`, f);
  return v;
}

export const STATUS = { PASS: 'PASS', FAIL: 'FAIL', WARNING: 'WARNING', UNSUPPORTED: 'UNSUPPORTED', INFO: 'INFO' };

export function check(id, label, status, demand, capacity, unit, clause, message, extra = {}) {
  return { id, label, status, demand, capacity, unit, clause, message, ...extra };
}

export function worstStatus(statuses) {
  if (statuses.includes(STATUS.FAIL) || statuses.includes(STATUS.UNSUPPORTED)) return STATUS.FAIL;
  if (statuses.includes(STATUS.WARNING)) return STATUS.WARNING;
  return STATUS.PASS;
}
