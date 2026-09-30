/**
 * Deterministic math for the simulation. JavaScript engines (V8 in Node vs. Chromium builds) may differ in the
 * last bit of Math.sin/cos/exp/pow/hypot. Only +, −, ×, ÷ and sqrt are exactly specified by IEEE 754, so the
 * simulation uses these implementations (range reduction + polynomials) and never Math.sin & co.
 */
export const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/** sin via range reduction to [-π, π] and a Taylor series to x^15 (error ~1e-11 on [-π/2, π/2]). */
export function dsin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  // reduce to [-π, π]
  let r = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  // reduce to [-π/2, π/2]
  if (r > HALF_PI) r = PI - r; else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  // Taylor: r - r^3/6 + r^5/120 - r^7/5040 + r^9/362880 - r^11/39916800 + r^13/6227020800 - r^15/1307674368000
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800 + r2 * (1 / 6227020800 - r2 / 1307674368000)))))));
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** exp via 2^k · e^f with f in [-ln2/2, ln2/2] and a Taylor series. */
export function dexp(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? Infinity : x < 0 ? 0 : NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const LN2 = 0.6931471805599453;
  const k = Math.floor(x / LN2 + 0.5);
  const f = x - k * LN2;
  // Taylor to f^12
  let term = 1, sum = 1;
  for (let i = 1; i <= 12; i++) { term *= f / i; sum += term; }
  return sum * pow2i(k);
}

function pow2i(k: number): number {
  // exact powers of two by repeated multiplication (k within ±1100)
  let r = 1;
  if (k >= 0) { for (let i = 0; i < k; i++) r *= 2; }
  else { for (let i = 0; i < -k; i++) r *= 0.5; }
  return r;
}

/** natural log via mantissa/exponent split and the atanh series. */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (!Number.isFinite(x)) return Infinity;
  const LN2 = 0.6931471805599453;
  let e = 0;
  let m = x;
  while (m >= 2) { m *= 0.5; e++; }
  while (m < 1) { m *= 2; e--; }
  // m in [1, 2): use ln(m) = 2 atanh((m-1)/(m+1))
  const t = (m - 1) / (m + 1);
  const t2 = t * t;
  let term = t, sum = 0;
  for (let i = 1; i <= 31; i += 2) { sum += term / i; term *= t2; }
  return 2 * sum + e * LN2;
}

/** pow for positive bases (as used by the simulation); integer exponents handled exactly. */
export function dpow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let r = 1; const n = Math.abs(y);
    for (let i = 0; i < n; i++) r *= x;
    return y > 0 ? r : 1 / r;
  }
  if (x < 0) return NaN;
  return dexp(y * dlog(x));
}

export function dhypot(a: number, b: number): number {
  return Math.sqrt(a * a + b * b);
}

/** atan via argument halving and a Taylor series; atan2 by quadrant. */
function datan(a: number): number {
  let x = Math.abs(a);
  let k = 0;
  while (x > 0.25) { x = x / (1 + Math.sqrt(1 + x * x)); k++; }
  const x2 = x * x;
  let term = x, sum = 0;
  for (let i = 1; i <= 25; i += 2) { sum += term / i; term *= -x2; }
  const r = sum * pow2i(k);
  return a < 0 ? -r : r;
}

export function datan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : -HALF_PI;
}
