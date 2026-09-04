// Maneuver bridge: apply an impulsive maneuver to an OrbitalObject, producing
// a new OrbitalObject with adjusted elements.
//
// The maneuver is expressed in the local RIC frame (Radial, Along-track,
// Cross-track) at the burn time. We:
//   1) Propagate the object to the burn time using SGP4
//   2) Compute the RIC unit vectors at that state
//   3) Apply the delta-V in the RIC frame
//   4) Convert the post-burn Cartesian state back to classical orbital elements
//      using the closed-form Cartesian→Classical algorithm
//   5) Return a NEW OrbitalObject (the original is untouched — the maneuver
//      does NOT modify the stored real catalog object)
//
// The resulting object is marked with source = 'SENTINEL-SIMULATED' so the UI
// can clearly distinguish it from real catalog data.

import { OrbitalObject } from '@/lib/data/celestrak/types';
import { propagateSgp4, PropagatedState } from './sgp4';
import {
  cartesianToClassical,
  semiMajorAxisToMeanMotion,
} from './elements';
import { meanMotionToSemiMajorAxis, perigeeApogeeKm, orbitalPeriodMin } from '@/lib/data/celestrak/normalizer';

/**
 * Compute RIC unit vectors at a propagated state.
 *   R = r_hat (radial, away from Earth center)
 *   C = h_hat (along angular momentum, "cross-track")
 *   S = C × R (along-track, in direction of motion for prograde orbits)
 */
export function ricFrame(state: PropagatedState): {
  R: [number, number, number];
  S: [number, number, number];
  C: [number, number, number];
} {
  const r = Math.sqrt(state.x * state.x + state.y * state.y + state.z * state.z);
  const Rx = state.x / r, Ry = state.y / r, Rz = state.z / r;
  const hx = state.y * state.vz - state.z * state.vy;
  const hy = state.z * state.vx - state.x * state.vz;
  const hz = state.x * state.vy - state.y * state.vx;
  const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
  const Cx = hx / hMag, Cy = hy / hMag, Cz = hz / hMag;
  const Sx = Cy * Rz - Cz * Ry;
  const Sy = Cz * Rx - Cx * Rz;
  const Sz = Cx * Ry - Cy * Rx;
  return {
    R: [Rx, Ry, Rz],
    S: [Sx, Sy, Sz],
    C: [Cx, Cy, Cz],
  };
}

/**
 * Apply an impulsive delta-V to an OrbitalObject at burnTime, returning a NEW
 * OrbitalObject with adjusted orbital elements. The original object is not
 * mutated.
 *
 * Returns null if propagation fails (e.g., the burn time is outside the
 * valid SGP4 window for the object).
 */
export function applyImpulsiveManeuver(
  obj: OrbitalObject,
  burnTime: Date,
  deltaVRadial: number,    // km/s
  deltaVAlongTrack: number,
  deltaVCrossTrack: number,
): OrbitalObject | null {
  // 1) Propagate to burn time
  let state: PropagatedState;
  try {
    state = propagateSgp4(obj, burnTime);
  } catch {
    return null;
  }

  // 2) Apply delta-V in RIC frame
  const { R, S, C } = ricFrame(state);
  const newVx = state.vx + deltaVRadial * R[0] + deltaVAlongTrack * S[0] + deltaVCrossTrack * C[0];
  const newVy = state.vy + deltaVRadial * R[1] + deltaVAlongTrack * S[1] + deltaVCrossTrack * C[1];
  const newVz = state.vz + deltaVRadial * R[2] + deltaVAlongTrack * S[2] + deltaVCrossTrack * C[2];

  // 3) Convert post-burn Cartesian state → classical elements
  const cls = cartesianToClassical({ x: state.x, y: state.y, z: state.z, vx: newVx, vy: newVy, vz: newVz });

  // 4) Convert true anomaly → mean anomaly via eccentric anomaly
  const E = 2 * Math.atan2(
    Math.sqrt(1 - cls.e) * Math.sin(cls.nu / 2),
    Math.sqrt(1 + cls.e) * Math.cos(cls.nu / 2),
  );
  const M = E - cls.e * Math.sin(E);
  const deg = (rad: number) => ((rad * 180 / Math.PI) % 360 + 360) % 360;

  // 5) Build new OrbitalObject — HYPOTHETICAL maneuver
  const aKm = cls.a;
  const { perigeeKm, apogeeKm } = perigeeApogeeKm(aKm, cls.e);
  return {
    ...obj,
    epoch: burnTime.toISOString(),
    meanMotion: semiMajorAxisToMeanMotion(cls.a),
    eccentricity: cls.e,
    inclination: deg(cls.i),
    raOfAscendingNode: deg(cls.raan),
    argumentOfPerigee: deg(cls.omega),
    meanAnomaly: deg(M),
    bstar: 0,  // After a maneuver, B* is no longer meaningful
    semiMajorAxisKm: aKm,
    perigeeKm,
    apogeeKm,
    orbitalPeriodMin: orbitalPeriodMin(semiMajorAxisToMeanMotion(cls.a)),
    // Mark this as a SIMULATED STATE so the UI can clearly distinguish it from
    // real catalog data.
    source: 'SENTINEL-SIMULATED',
    retrievedAt: new Date().toISOString(),
    format: 'OMM',
    rawDataHash: '',
    operationalStatus: 'SIMULATED-POST-MANEUVER',
  };
}
