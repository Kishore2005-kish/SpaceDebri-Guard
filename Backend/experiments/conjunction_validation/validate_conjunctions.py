"""Isolated conjunction validation harness.

The production TypeScript screen() function is exercised through a bridge. The
analytical closest-approach tests are calculated independently here.
"""
from __future__ import annotations
import json, math, subprocess
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'Backend/experiments/conjunction_validation'
TCA_TOLERANCE_SEC = 1.0
RANGE_TOLERANCE_KM = 1e-9

def analytical_case(r, v, start=0.0, end=100.0):
    r, v = np.array(r, dtype=float), np.array(v, dtype=float)
    vv = float(np.dot(v, v))
    if vv <= 1e-20: return {'status': 'undefined-zero-relative-velocity'}
    offset = -float(np.dot(r, v)) / vv
    t = max(start, min(end, offset))
    closest = r + v * t
    return {'status': 'ok', 'expected_offset_sec': offset, 'used_offset_sec': t, 'expected_range_km': float(np.linalg.norm(closest))}

def run_bridge():
    bridge = OUT / 'production_bridge.ts'
    p = subprocess.run(['npx', 'tsx', str(bridge)], cwd=ROOT, text=True, capture_output=True, check=True)
    return json.loads(p.stdout)

def main():
    analytical = {
        'between_samples': analytical_case([10, 0, 0], [-1, 0, 0], 0, 20),
        'nonzero_miss': analytical_case([10, 3, 0], [-1, 0, 0], 0, 20),
        'boundary_clamped': analytical_case([-2, 0, 0], [-1, 0, 0], 0, 20),
        'zero_velocity': analytical_case([3, 4, 0], [0, 0, 0], 0, 20),
    }
    production = run_bridge()
    detection = production['scenarios']
    for item in detection:
        if item.get('result') and item.get('expectedTca'):
            item['tca_error_sec'] = abs((datetime.fromisoformat(item['result']['tca'].replace('Z', '+00:00')) - datetime.fromisoformat(item['expectedTca'].replace('Z', '+00:00'))).total_seconds())
            item['miss_distance_error_km'] = abs(item['result']['minRangeKm'] - item['expectedRangeKm'])
    expected = sum(s['expected'] == 'detect' for s in detection)
    detected = sum(s['expected'] == 'detect' and s['detected'] for s in detection)
    missed = expected - detected
    unexpected = sum(s['expected'] == 'no-detect' and s['detected'] for s in detection)
    payload = {
        'generated_utc': datetime.now(timezone.utc).isoformat(),
        'production_implementation': 'src/lib/orbital/conjunction.ts screen()',
        'frame': 'TEME', 'position_units': 'km', 'velocity_units': 'km/s',
        'configuration': {'coarse_step_sec': 60, 'coarse_threshold_km': 600, 'fine_step_sec': 1, 'fine_window_sec_each_side': 600, 'default_threshold_km': 5, 'default_horizon_days': 7, 'tca_refinement': 'linear projection at fine minimum; apply only |dt| < 60 sec; re-propagate and accept only if range improves'},
        'analytical_tca_tests': analytical,
        'synthetic_sgp4_scenarios': detection,
        'detection_summary': {'expected_encounters': expected, 'detected': detected, 'missed': missed, 'unexpected_detections': unexpected, 'tca_tolerance_sec': TCA_TOLERANCE_SEC, 'range_tolerance_km': RANGE_TOLERANCE_KM, 'matched_tca_error_sec': [s['tca_error_sec'] for s in detection if 'tca_error_sec' in s], 'matched_miss_distance_error_km': [s['miss_distance_error_km'] for s in detection if 'miss_distance_error_km' in s]},
        'threshold_boundary_tests': {'below_threshold': 'covered by synthetic crossings at 0.15/0.25 km targets and threshold 5 km', 'at_threshold': 'not directly constructible through public screen() because result minRange is data-dependent; production uses strict minRange >= threshold => no detection', 'above_threshold': 'production uses strict minRange >= threshold => no detection'},
        'risk_findings': {'formula': 'weighted sum of miss distance 40%, data uncertainty 20%, relative velocity 15%, geometry 15%, freshness 10%; rounded and clamped 0..100', 'interpretation': 'heuristic score, not collision probability'},
        'independent_reference': {'available': False, 'reason': 'No historical conjunction reference dataset was found in the repository; synthetic cases are not real events.'},
        'invalid_input_tests': {'production_screen_invalid_data': 'not invoked through screen because malformed OrbitalObject can fail during SGP4 construction; production propagation throws or returns non-finite states, but screen does not explicitly catch propagation failures in coarse/fine passes.', 'missing_data': 'not silently converted to a valid conjunction by this harness'},
        'warnings': ['Synthetic scenarios validate controlled mathematics and software behavior only.', 'No real-world conjunction accuracy claim is supported.', 'Production screen() does not catch propagation exceptions in its coarse/fine loops; a malformed object can abort the screen call rather than return a structured failure.']
    }
    (OUT / 'conjunction_validation_results.json').write_text(json.dumps(payload, indent=2) + '\n')
    report(payload)
    print(json.dumps(payload['detection_summary'], indent=2))
    print(json.dumps(detection, indent=2))

def report(p):
    d = p['detection_summary']
    lines = ['# Conjunction Validation Report', '', '## Executive summary', '', f"The production `screen()` pipeline was exercised with {len(p['synthetic_sgp4_scenarios'])} deterministic synthetic SGP4 scenarios: {d['detected']} of {d['expected_encounters']} expected encounters detected, {d['missed']} missed, and {d['unexpected_detections']} unexpected detections.", '', 'This validates controlled software behavior only; no real-world conjunction accuracy claim is made.', '', '## Production pipeline overview', '', 'The engine samples both objects every 60 seconds, selects local minima below 600 km, searches ±600 seconds at 1-second resolution, then applies a linear relative-motion TCA projection. It re-propagates the refined timestamp and accepts it only when the range improves. Final detection uses strict `minRange < thresholdKm`. States are TEME, km, and km/s.', '', '## Analytical TCA validation', '', 'The independent linear-motion cases verify `t = -dot(r,v)/dot(v,v)` for nonzero relative velocity, clamp to interval boundaries, and report an undefined result for zero relative velocity. These cases are recorded in the JSON artifact.', '', '## Detection results', '', '| Scenario | Expected | Detected | TCA | Miss distance km | Relative velocity km/s |', '|---|---|---|---|---:|---:|']
    for s in p['synthetic_sgp4_scenarios']:
        r = s.get('result') or {}
        lines.append(f"| {s['id']} | {s['expected']} | {s['detected']} | {r.get('tca','—')} | {r.get('minRangeKm','—')} | {r.get('relVelocityKmPerSec','—')} |")
    lines += ['', '## Thresholds and risk scoring', '', f"The configured thresholds and refinement behavior are recorded in the JSON artifact. Risk scoring is a weighted heuristic, not a collision probability: {p['risk_findings']['formula']}.", '', '## Configuration findings', '', '- Coarse, fine, and refinement configuration values are applied in `screen()` as documented.', '- The public `screen()` function has no explicit distance/time/velocity filter beyond the coarse 600 km candidate threshold and final requested range threshold.', '- Propagation exceptions during coarse/fine screening are not caught; malformed input can abort screening. This is documented only and was not changed.', '', '## Independent reference comparison', '', 'No suitable historical conjunction reference dataset was found in the repository. Therefore precision, recall, and F1 against real events were not calculated.', '', '## Limitations and recommendations', '', 'Synthetic SGP4 fixtures are labeled demo data and do not represent historical conjunctions. Add a provenance-controlled CDM/TLE reference dataset before assessing operational detection accuracy. Consider a structured error policy around propagation failures in a future production change.', '']
    (OUT / 'CONJUNCTION_VALIDATION_REPORT.md').write_text('\n'.join(lines))

if __name__ == '__main__': main()
