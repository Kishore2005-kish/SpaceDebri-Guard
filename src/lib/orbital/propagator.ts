// Orbit propagator: Keplerian + J2 secular perturbation.
//
// IMPORTANT: This is a PROTOTYPE propagator. It does NOT implement the full
// SGP4 algorithm. It uses two-body motion with J2 secular precession of RAAN
// and argument of perigee, which is appropriate for short-horizon screening
// (hours to ~7 days) and gives realistic relative motion for the demo.
//
// For operational use, replace this with the official SGP4 library (e.g.
// skyfield / sgp4 Python package, or `sgp4` npm package) using the actual
// B* drag and SGP4 corrections. The interface in this file (propagate /
// propagateRange) is intentionally compatible with such a replacement.

import {
  OrbitalElements,
  CartesianState,
  MU_EARTH,
  J2,
  R_EARTH_KM,
  deg2rad,
  rad2deg,
  solveKepler,
  classicalToCartesian,
  meanMotionToSemiMajorAxis,
  cartesianToClassical,
  semiMajorAxisToMeanMotion,
} from './elements';

const TWO_PI = Math.PI * 2;
const J2_FACTOR = (3 / 2) * J2 * (R_EARTH_KM / 1) ** 2; // length^2 component

// Compute J2 secular rates for RAAN and argument of perigee (rad/sec).
// Standard formulas:
//   dRAAN/dt = -(3/2) * n * J2 * (R/a)^2 / (1-e^2)^2 * cos(i)
//   domega/dt =  (3/2) * n * J2 * (R/a)^2 / (1-e^2)^2 * (5*cos^2(i) - 1)/2
function j2SecularRates(a: number, e: number, i: number) {
  const n = Math.sqrt(MU_EARTH / (a * a * a)); // rad/sec
  const inv = 1 / (1 - e * e);
  const factor = (3 / 2) * J2 * (R_EARTH_KM / a) ** 2 * inv * inv;
  const raanRate = -factor * n * Math.cos(i); // rad/sec
  const omegaRate = factor * n * (2 - (5 / 2) * Math.sin(i) * Math.sin(i)); // simplified (1 - 5cos^2 i)/2 -> 5cos^2 -1 -> 2 - 2.5 sin^2 = (5cos^2-1)/2 ... using (2 - 2.5 sin^2 i) is wrong
  // Correct: omegaRate = factor * n * (5/4 * (cos i)^2 - 1/2) -> factor * n * (5 cos^2 i - 1)/2
  const omegaRateCorrect = factor * n * (2.5 * Math.cos(i) * Math.cos(i) - 1) / 2;
  return { raanRate, omegaRate: omegaRateCorrect };
}

export interface PropagatedState extends CartesianState {
  elements: {
    a: number; e: number; i: number; raan: number; omega: number; nu: number;
  };
}

// propagate: take a satellite's orbital elements and produce a Cartesian state at time t.
export function propagate(
  elements: OrbitalElements,
  t: Date,
): PropagatedState {
  const a = meanMotionToSemiMajorAxis(elements.meanMotion);
  const e = elements.eccentricity;
  const i0 = deg2rad(elements.inclination);
  const raan0 = deg2rad(elements.raan);
  const omega0 = deg2rad(elements.argPerigee);
  const M0 = deg2rad(elements.meanAnomaly);

  const dt = (t.getTime() - elements.epoch.getTime()) / 1000; // sec
  const { raanRate, omegaRate } = j2SecularRates(a, e, i0);
  const raan = raan0 + raanRate * dt;
  const omega = omega0 + omegaRate * dt;

  // Mean motion (rad/s)
  const n = Math.sqrt(MU_EARTH / (a * a * a));
  // Mean anomaly at t
  const M = M0 + n * dt;

  // Solve Kepler
  const E = solveKepler(M, e);
  // True anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2),
  );

  const cart = classicalToCartesian(a, e, i0, raan, omega, nu);
  return {
    x: cart.x, y: cart.y, z: cart.z,
    vx: cart.vx, vy: cart.vy, vz: cart.vz,
    t,
    frame: 'ECI_J2000',
    elements: { a, e, i: i0, raan, omega, nu },
  };
}

// propagateRange: produce a list of states over a time window.
export function propagateRange(
  elements: OrbitalElements,
  start: Date,
  end: Date,
  stepSec: number,
): PropagatedState[] {
  const out: PropagatedState[] = [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  for (let ms = startMs; ms <= endMs; ms += stepSec * 1000) {
    out.push(propagate(elements, new Date(ms)));
  }
  return out;
}

// Apply a small impulsive delta-V to a satellite's state, then convert back
// to mean elements (so we can re-propagate with J2 perturbation). The maneuver
// is expressed in the local RIC (radial / along-track / cross-track) frame.
//
// RIC frame at state s:
//   R = r_hat (radial, away from Earth center)
//   C = h_hat (along angular momentum, "cross-track")
//   S = C x R (along-track, in direction of motion for circular orbits)
export function applyImpulsiveManeuver(
  state: PropagatedState,
  deltaVRadial: number,    // km/s
  deltaVAlongTrack: number,
  deltaVCrossTrack: number,
): OrbitalElements {
  const r = Math.sqrt(state.x * state.x + state.y * state.y + state.z * state.z);
  // Unit radial
  const Rx = state.x / r, Ry = state.y / r, Rz = state.z / r;
  // Angular momentum vector h = r x v
  const hx = state.y * state.vz - state.z * state.vy;
  const hy = state.z * state.vx - state.x * state.vz;
  const hz = state.x * state.vy - state.y * state.vx;
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const Cx = hx / hMag, Cy = hy / hMag, Cz = hz / hMag;
  // Along-track S = C x R
  const Sx = Cy * Rz - Cz * Ry;
  const Sy = Cz * Rx - Cx * Rz;
  const Sz = Cx * Ry - Cy * Rx;
  // Apply delta-V
  const newVx = state.vx + deltaVRadial * Rx + deltaVAlongTrack * Sx + deltaVCrossTrack * Cx;
  const newVy = state.vy + deltaVRadial * Ry + deltaVAlongTrack * Sy + deltaVCrossTrack * Cy;
  const newVz = state.vz + deltaVRadial * Rz + deltaVAlongTrack * Sz + deltaVCrossTrack * Cz;
  // Convert new state to classical elements
  const cls = cartesianToClassical({ x: state.x, y: state.y, z: state.z, vx: newVx, vy: newVy, vz: newVz });
  // Convert back to mean elements (deg, rev/day)
  const meanMotion = semiMajorAxisToMeanMotion(cls.a);
  // New epoch is the maneuver time
  const newEpoch = state.t;
  // Mean anomaly: convert true anomaly to mean anomaly via eccentric anomaly
  const E = 2 * Math.atan2(
    Math.sqrt(1 - cls.e) * Math.sin(cls.nu / 2),
    Math.sqrt(1 + cls.e) * Math.cos(cls.nu / 2),
  );
  const M = E - cls.e * Math.sin(E);
  return {
    meanMotion,
    eccentricity: cls.e,
    inclination: rad2deg(cls.i),
    raan: rad2deg(cls.raan) % 360,
    argPerigee: rad2deg(cls.omega) % 360,
    meanAnomaly: rad2deg(M) % 360,
    bstar: 0, // After a maneuver we treat as fresh elements
    epoch: newEpoch,
  };
}

// Compute distance and relative velocity between two Cartesian states.
export function relativeMotion(a: CartesianState, b: CartesianState): {
  range: number; // km
  relVel: number; // km/s
  relPosRic: { radial: number; alongTrack: number; crossTrack: number };
} {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const range = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const dvx = b.vx - a.vx, dvy = b.vy - a.vy, dvz = b.vz - a.vz;
  const relVel = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
  // Relative position in primary's RIC frame
  const r = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  const Rx = a.x / r, Ry = a.y / r, Rz = a.z / r;
  const hx = a.y * a.vz - a.z * a.vy;
  const hy = a.z * a.vx - a.x * a.vz;
  const hz = a.x * a.vy - a.y * a.vx;
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const Cx = hx / hMag, Cy = hy / hMag, Cz = hz / hMag;
  const Sx = Cy * Rz - Cz * Ry;
  const Sy = Cz * Rx - Cx * Rz;
  const Sz = Cx * Ry - Cy * Rx;
  const radial = dx * Rx + dy * Ry + dz * Rz;
  const alongTrack = dx * Sx + dy * Sy + dz * Sz;
  const crossTrack = dx * Cx + dy * Cy + dz * Cz;
  return { range, relVel, relPosRic: { radial, alongTrack, crossTrack } };
}

// Format helpers
export function formatKm(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(2)} km`;
}

export function formatKmPerS(v: number): string {
  return `${v.toFixed(2)} km/s`;
}
