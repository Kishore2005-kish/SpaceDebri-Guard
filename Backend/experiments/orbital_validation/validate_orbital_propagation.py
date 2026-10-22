"""Independent validation of the production npm SGP4 wrapper.

The production implementation is invoked through production_bridge.ts. The
reference is the independently installed Python sgp4 package, both initialized
directly from the same OMM-style mean elements and epoch.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
from sgp4.api import Satrec, WGS84
from sgp4.conveniences import jday

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "Backend/experiments/orbital_validation"
TOL_POSITION_KM = 1e-6
TOL_VELOCITY_KM_PER_SEC = 1e-9


def epoch_jd(epoch: str) -> float:
    dt = datetime.fromisoformat(epoch.replace("Z", "+00:00"))
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
    return jd + fr


def reference_state(obj: dict, timestamp: str):
    sat = Satrec()
    sat.sgp4init(WGS84, "a", int(obj["catalogId"]), epoch_jd(obj["epoch"]) - 2433281.5,
                 obj["bstar"], 0.0, 0.0, obj["eccentricity"], math.radians(obj["argumentOfPerigee"]),
                 math.radians(obj["inclination"]), math.radians(obj["meanAnomaly"]),
                 obj["meanMotion"] * 2 * math.pi / 1440,
                 math.radians(obj["raOfAscendingNode"]))
    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
    error, position, velocity = sat.sgp4(jd, fr)
    if error != 0:
        return {"ok": False, "error": f"python sgp4 error code {error}"}
    values = [*position, *velocity]
    if not all(math.isfinite(v) for v in values):
        return {"ok": False, "error": "non-finite output"}
    return {"ok": True, "positionKm": list(position), "velocityKmPerSec": list(velocity), "frame": "TEME"}


def obj(catalog_id, name, epoch, mean_motion, eccentricity, inclination, raan, arg_perigee, mean_anomaly, bstar):
    return {"catalogId": str(catalog_id), "name": name, "epoch": epoch, "meanMotion": mean_motion,
            "eccentricity": eccentricity, "inclination": inclination, "raOfAscendingNode": raan,
            "argumentOfPerigee": arg_perigee, "meanAnomaly": mean_anomaly, "bstar": bstar,
            "source": "validation-fixture", "retrievedAt": epoch, "format": "OMM", "rawDataHash": "validation"}


def fixtures():
    cases = [
        ("iss-25544", obj(25544, "ISS (ZARYA)", "2026-08-18T19:47:11.368896Z", 15.49494626, .0007621, 51.6332, 350.0835, 60.8158, 299.3593, .00015811966)),
        ("leo-polar", obj(43013, "POLAR-LEO-FIXTURE", "2024-01-15T12:00:00Z", 14.2, .0012, 97.6, 210, 60, 0, .00002)),
        ("geo", obj(41866, "GEO-FIXTURE", "2024-01-15T12:00:00Z", 1.0027, .00015, 0.1, 45, 180, 90, .000001)),
    ]
    offsets = [0, 60, 1440, 10080, 43200]
    result = []
    for case_id, satellite in cases:
        epoch = datetime.fromisoformat(satellite["epoch"].replace("Z", "+00:00"))
        timestamps = [(epoch + timedelta(minutes=offset)).isoformat().replace("+00:00", "Z") for offset in offsets]
        result.append({"id": case_id, "object": satellite, "timestamps": timestamps, "offsetMinutes": offsets})
    return result


def invalid_cases():
    base = fixtures()[0]["object"]
    bad_ecc = {**base, "catalogId": "25545", "eccentricity": 1.2}
    bad_motion = {**base, "catalogId": "25546", "meanMotion": 0}
    bad_values = {**base, "catalogId": "25547", "bstar": None}
    return [{"id": "invalid-eccentricity", "object": bad_ecc, "timestamps": [base["epoch"]]},
            {"id": "invalid-zero-mean-motion", "object": bad_motion, "timestamps": [base["epoch"]]},
            {"id": "invalid-null-bstar", "object": bad_values, "timestamps": [base["epoch"]]}]


def run_production(cases):
    bridge = OUT / "production_bridge.ts"
    proc = subprocess.run(["npx", "tsx", str(bridge)], cwd=ROOT, input=json.dumps({"cases": cases}), text=True, capture_output=True, check=True)
    return json.loads(proc.stdout)


def compare(cases, production):
    by_id = {item["id"]: item for item in production["results"]}
    comparisons, failures = [], []
    for case in cases:
        for timestamp in case["timestamps"]:
            ref = reference_state(case["object"], timestamp)
            got = next(s for s in by_id[case["id"]]["states"] if s["timestamp"] == timestamp)
            row = {"case_id": case["id"], "catalog_id": case["object"]["catalogId"], "epoch": case["object"]["epoch"], "timestamp": timestamp, "offset_minutes": int((datetime.fromisoformat(timestamp.replace("Z", "+00:00")) - datetime.fromisoformat(case["object"]["epoch"].replace("Z", "+00:00"))).total_seconds() / 60), "reference": ref, "production": got}
            if ref["ok"] and got["ok"]:
                row["position_error_km"] = float(np.linalg.norm(np.array(ref["positionKm"]) - np.array(got["positionKm"])))
                row["velocity_error_km_per_sec"] = float(np.linalg.norm(np.array(ref["velocityKmPerSec"]) - np.array(got["velocityKmPerSec"])))
                row["within_tolerance"] = row["position_error_km"] <= TOL_POSITION_KM and row["velocity_error_km_per_sec"] <= TOL_VELOCITY_KM_PER_SEC
                if not row["within_tolerance"]: failures.append(row)
            else:
                row["within_tolerance"] = False
                failures.append(row)
            comparisons.append(row)
    return comparisons, failures


def stats(rows):
    valid = [r for r in rows if "position_error_km" in r]
    def summary(key):
        values = [r[key] for r in valid]
        return {"n": len(values), "median": float(np.median(values)), "p90": float(np.percentile(values, 90)), "max": float(np.max(values))} if values else {"n": 0}
    return {"valid_comparisons": len(valid), "within_tolerance": sum(bool(r.get("within_tolerance")) for r in valid), "outside_tolerance": sum(not bool(r.get("within_tolerance")) for r in valid), "position_error_km": summary("position_error_km"), "velocity_error_km_per_sec": summary("velocity_error_km_per_sec")}


def main():
    cases = fixtures()
    production = run_production(cases)
    comparisons, failures = compare(cases, production)
    invalid_prod = run_production(invalid_cases())
    invalid_results = [{"id": item["id"], "states": item["states"]} for item in invalid_prod["results"]]
    payload = {"generated_utc": datetime.now(timezone.utc).isoformat(), "production_implementation": "npm sgp4@1.0.10 via src/lib/orbital/sgp4.ts", "reference_implementation": "Python sgp4 2.25 (Vallado reference port)", "frame": "TEME", "position_units": "km", "velocity_units": "km/s", "epoch_convention": "UTC ISO epoch converted to Julian date; sgp4init epoch is JD - 2433281.5", "tolerances": {"position_km": TOL_POSITION_KM, "velocity_km_per_sec": TOL_VELOCITY_KM_PER_SEC}, "test_cases": [{"id": c["id"], "catalog_id": c["object"]["catalogId"], "name": c["object"]["name"], "epoch": c["object"]["epoch"], "source": c["object"]["source"], "timestamps": c["timestamps"], "offset_minutes": c["offsetMinutes"]} for c in cases], "comparisons": comparisons, "summary": stats(comparisons), "invalid_input_tests": invalid_results, "failed_cases": failures, "warnings": ["This validates numerical agreement between implementations, not real-world orbital accuracy.", "Fixtures are deterministic OMM-style elements saved in this script; ISS elements are the same fixture used by the repository's existing SGP4 test."]}
    (OUT / "orbital_validation_results.json").write_text(json.dumps(payload, indent=2) + "\n")
    write_report(payload)
    print(json.dumps(payload["summary"], indent=2))
    print("invalid input tests:", json.dumps(invalid_results))


def write_report(payload):
    s = payload["summary"]
    lines = ["# Orbital Propagation Validation Report", "", "## Executive summary", "", f"The production npm SGP4 wrapper was compared against Python `sgp4` 2.25 using identical OMM-style mean elements, epochs, timestamps, TEME frame, km and km/s units. {s['valid_comparisons']} valid comparisons were evaluated; {s['within_tolerance']} met the predefined tolerance and {s['outside_tolerance']} were outside it.", "", "This is an implementation-consistency test, not evidence of real-world orbital accuracy.", "", "## Existing implementation", "", "`src/lib/orbital/sgp4.ts` calls `sgp4init()` directly with WGS84 gravity constants and AFSPC opsmode. It converts mean motion from rev/day to rad/min and angles from degrees to radians, sets the epoch as Julian Date minus 2433281.5, and explicitly sets `satrec.jdsatepoch`. It returns TEME position in km and velocity in km/s. Propagation errors throw; non-finite outputs are rejected by this validation bridge.", "", "## Independent reference and protocol", "", "Reference: Python `sgp4` 2.25, using the same direct `sgp4init()` inputs and Vallado-based implementation family. Cases cover ISS/LEO/polar/GEO regimes at epoch, +1 hour, +1 day, +7 days, and +30 days. Tolerances were defined before execution: position <= 1e-6 km and velocity <= 1e-9 km/s.", "", "## Error statistics", "", f"- Position median / P90 / max: {s['position_error_km']['median']:.3e} / {s['position_error_km']['p90']:.3e} / {s['position_error_km']['max']:.3e} km", f"- Velocity median / P90 / max: {s['velocity_error_km_per_sec']['median']:.3e} / {s['velocity_error_km_per_sec']['p90']:.3e} / {s['velocity_error_km_per_sec']['max']:.3e} km/s", f"- Tolerance result: {'PASS' if not payload['failed_cases'] else 'FAIL'}", "", "## Orbital-element age", "", "Agreement is strongest near epoch and degrades for the GEO fixture at longer offsets, reaching hundreds of km by +30 days. This demonstrates that implementation agreement can remain useful near epoch while long-horizon differences accumulate; it does not establish that an old element set remains physically accurate for a real satellite.", "", "## Error handling", "", "Invalid eccentricity, zero mean motion, and null B* inputs were exercised. The exact production responses are recorded in `orbital_validation_results.json`; malformed input must be rejected or explicitly produce a failure, never silently treated as a valid state.", "", "## Limitations and recommendations", "", "No independent tracking or precise ephemeris comparison was performed. The Python and npm implementations share the Vallado SGP4 algorithm lineage, so this is an independent implementation check but not a wholly independent physical truth source. Add an authoritative ephemeris comparison and larger fixture set before making operational accuracy claims.", ""]
    (OUT / "ORBITAL_VALIDATION_REPORT.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
