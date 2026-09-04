// Orbital element types and conversions.
// This module is part of the PROTOTYPE conjunction awareness pipeline.
// SGP4-style mean elements are stored on each Satellite, but the propagator
// in `propagator.ts` is a Keplerian + J2 two-body propagator used for the
// demo. This is explicitly NOT a substitute for professional flight dynamics.

export interface OrbitalElements {
  // SGP4 mean elements
  meanMotion: number;   // rev/day
  eccentricity: number; // dimensionless
  inclination: number;  // deg
  raan: number;         // deg (right ascension of ascending node)
  argPerigee: number;   // deg (argument of perigee)
  meanAnomaly: number;   // deg
  bstar: number;        // drag term (~1e-4 typical)
  epoch: Date;
}

export interface CartesianState {
  // Earth-Centered Inertial (ECI) frame, J2000 epoch
  x: number; y: number; z: number; // km
  vx: number; vy: number; vz: number; // km/s
  t: Date;
  frame: 'TEME' | 'ECI_J2000' | 'ECEF';
}

export const MU_EARTH = 398600.4418;      // km^3 / s^2
export const R_EARTH_KM = 6378.137;
export const J2 = 1.082626173e-3;
export const EARTH_ROTATION_RATE = 7.2921150e-5; // rad/s
const TWO_PI = Math.PI * 2;
const DEG2RAD = Math.PI / 180;

// Convert SGP4-style mean elements to a set that our Keplerian propagator uses.
export function meanMotionToSemiMajorAxis(meanMotionRevPerDay: number): number {
  // n (rev/day) -> rad/s
  const nRadPerSec = meanMotionRevPerDay * TWO_PI / 86400;
  // a^3 = mu / n^2
  const a = Math.cbrt(MU_EARTH / (nRadPerSec * nRadPerSec));
  return a; // km
}

export function semiMajorAxisToMeanMotion(aKm: number): number {
  const nRadPerSec = Math.sqrt(MU_EARTH / (aKm * aKm * aKm));
  return nRadPerSec * 86400 / TWO_PI;
}

export function deg2rad(d: number): number { return d * DEG2RAD; }
export function rad2deg(r: number): number { return r / DEG2RAD; }

// Solve Kepler's equation M = E - e*sin(E) for E (eccentric anomaly).
export function solveKepler(M: number, e: number, tol = 1e-10, maxIter = 30): number {
  // Normalize M to [-pi, pi]
  let m = M % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  if (m < -Math.PI) m += TWO_PI;
  let E = m + e * Math.sin(m); // initial guess
  for (let i = 0; i < maxIter; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Convert classical orbital elements (radians) to ECI Cartesian state.
export function classicalToCartesian(
  a: number, e: number, i: number, raan: number, omega: number, nu: number,
): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
  const p = a * (1 - e * e);
  // Position in perifocal frame
  const rPQW = p / (1 + e * Math.cos(nu));
  const xP = rPQW * Math.cos(nu);
  const yP = rPQW * Math.sin(nu);
  // Velocity in perifocal frame
  const h = Math.sqrt(MU_EARTH * p);
  const vxP = -h / p * Math.sin(nu);
  const vyP =  h / p * (e + Math.cos(nu));
  // Rotation: perifocal -> ECI
  const cosO = Math.cos(raan), sinO = Math.sin(raan);
  const cosW = Math.cos(omega), sinW = Math.sin(omega);
  const cosI = Math.cos(i), sinI = Math.sin(i);
  const R11 = cosO * cosW - sinO * sinW * cosI;
  const R12 = -cosO * sinW - sinO * cosW * cosI;
  const R21 = sinO * cosW + cosO * sinW * cosI;
  const R22 = -sinO * sinW + cosO * cosW * cosI;
  const R31 = sinW * sinI;
  const R32 = cosW * sinI;
  const x = R11 * xP + R12 * yP;
  const y = R21 * xP + R22 * yP;
  const z = R31 * xP + R32 * yP;
  const vx = R11 * vxP + R12 * vyP;
  const vy = R21 * vxP + R22 * vyP;
  const vz = R31 * vxP + R32 * vyP;
  return { x, y, z, vx, vy, vz };
}

// Convert Cartesian state back to classical orbital elements.
//
// Standard algorithm (Vallado, "Fundamentals of Astrodynamics"):
//   1) a from specific orbital energy: a = 1 / (2/r - v²/μ)
//   2) h = r × v  (specific angular momentum vector)
//   3) e_vec = (v × h)/μ - r̂  (eccentricity vector)
//   4) i = acos(h_z / |h|)
//   5) n = k × h = (-h_y, h_x, 0)  (ascending node vector, in equatorial plane)
//   6) RAAN = atan2(n_y, n_x)  (angle from +X to ascending node)
//   7) omega (argument of perigee) = angle from ascending node to e_vec,
//      measured in the orbital plane in the direction of motion:
//        cos(omega) = (n · e_vec) / (|n| |e|)
//        sin(omega) = (e_vec · (h × n)) / (|e| |h| |n|)  -- sign comes from e_vec_z
//      Simpler: omega = atan2(e_vec_z * sign(h_z), (n · e_vec) / |n| * sign(...))
//      Cleanest robust form:
//        omega = acos((n · e_vec)/(|n||e|)) if e_vec_z >= 0 else 2π - acos(...)
//   8) nu (true anomaly) = angle from e_vec to r, measured in orbital plane:
//        cos(nu) = (e_vec · r) / (|e| r)
//        nu = acos(...) if r·v >= 0 else 2π - acos(...)
export function cartesianToClassical(state: { x: number; y: number; z: number; vx: number; vy: number; vz: number }): {
  a: number; e: number; i: number; raan: number; omega: number; nu: number;
} {
  const { x, y, z, vx, vy, vz } = state;
  const r = Math.sqrt(x * x + y * y + z * z);
  const v2 = vx * vx + vy * vy + vz * vz;
  const a = 1 / (2 / r - v2 / MU_EARTH);

  // Angular momentum h = r × v
  const hx = y * vz - z * vy;
  const hy = z * vx - x * vz;
  const hz = x * vy - y * vx;
  const h = Math.sqrt(hx * hx + hy * hy + hz * hz);

  // Eccentricity vector e_vec = (v × h)/μ - r̂
  const evx = (vy * hz - vz * hy) / MU_EARTH - x / r;
  const evy = (vz * hx - vx * hz) / MU_EARTH - y / r;
  const evz = (vx * hy - vy * hx) / MU_EARTH - z / r;
  const e = Math.sqrt(evx * evx + evy * evy + evz * evz);

  // Inclination
  const i = Math.acos(Math.max(-1, Math.min(1, hz / h)));

  // Node vector n = k × h = (-h_y, h_x, 0)
  const nx = -hy, ny = hx;
  const nMag = Math.sqrt(nx * nx + ny * ny);

  // RAAN
  let raan;
  if (nMag > 1e-10) {
    raan = Math.atan2(ny, nx);
    if (raan < 0) raan += TWO_PI;
  } else {
    raan = 0;
  }

  // Argument of perigee
  let omega = 0;
  if (nMag > 1e-10 && e > 1e-10) {
    const cosOmega = Math.max(-1, Math.min(1, (nx * evx + ny * evy) / (nMag * e)));
    const acosOmega = Math.acos(cosOmega);
    // If e_vec_z >= 0, omega is in [0, π]; else in (π, 2π]
    omega = evz >= 0 ? acosOmega : (TWO_PI - acosOmega);
  }

  // True anomaly
  let nu = 0;
  if (e > 1e-10) {
    const cosNu = Math.max(-1, Math.min(1, (evx * x + evy * y + evz * z) / (e * r)));
    const acosNu = Math.acos(cosNu);
    const rDotV = x * vx + y * vy + z * vz; // > 0 when moving away from perigee
    nu = rDotV >= 0 ? acosNu : (TWO_PI - acosNu);
  }

  return { a, e, i, raan, omega, nu };
}
