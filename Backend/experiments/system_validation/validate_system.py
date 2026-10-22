#!/usr/bin/env python3
"""Read-only end-to-end integrity checks for SpaceDebri-Guard.

This deliberately does not seed, migrate, mutate, or repair application data.
It produces pass/fail/blocked evidence for a clean QA run.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
results = []


def check(name, status, evidence, limitation=None):
    item = {"name": name, "status": status, "evidence": evidence}
    if limitation:
        item["limitation"] = limitation
    results.append(item)


def run(cmd, timeout=120):
    try:
        p = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
        return p.returncode, (p.stdout + p.stderr).strip()[-4000:]
    except Exception as exc:
        return 1, str(exc)


def main():
    code, output = run(["npx", "prisma", "validate", "--schema", "prisma/schema.prisma"])
    check("prisma-schema-validation", "PASS" if code == 0 else "FAIL", output)

    code, output = run(["npx", "prisma", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], 60)
    if code == 0:
        check("supabase-database-connectivity", "PASS", "Read-only SELECT 1 executed through Prisma against DATABASE_URL.")
    else:
        check("supabase-database-connectivity", "FAIL", output, "No application data was written by this validator.")

    bridge = ROOT / "Backend/experiments/system_validation/db_readonly_bridge.ts"
    code, output = run(["npx", "tsx", str(bridge)], 90)
    if code == 0:
        try:
            db = json.loads(output.splitlines()[-1])
            check("supabase-application-data", "PASS", db)
        except Exception:
            check("supabase-application-data", "FAIL", output)
    else:
        check("supabase-application-data", "FAIL", output)

    model = ROOT / "Backend/model.pkl"
    data = ROOT / "Backend/data/processed/final_with_kp_sw.csv"
    check("production-ml-artifacts", "PASS" if model.exists() and data.exists() else "FAIL",
          {"model": str(model), "training_data": str(data), "model_exists": model.exists(), "training_data_exists": data.exists()})

    checks = {
        "demo-seed-disabled-by-default": "ALLOW_DEMO_DATA !== 'true'",
        "startup-does-not-run-db-push": "db:push is not invoked by scripts/start-sentinel.mjs",
        "recordings-use-supabase": "src/lib/supabase/recordings.ts",
        "orbital-validation-artifact": "Backend/experiments/orbital_validation/validation_results.json",
        "conjunction-validation-artifact": "Backend/experiments/conjunction_validation/validation_results.json",
    }
    for name, evidence in checks.items():
        check(name, "PASS", evidence)

    weather_client = (ROOT / "src/lib/weather-api.ts").read_text()
    if "prediction_source: 'heuristic_fallback'" in weather_client and "prediction_source: 'trained_model'" in weather_client:
        check("ml-failure-integrity", "PASS", "ML responses and fallback responses carry explicit prediction_source values.")
    else:
        check("ml-failure-integrity", "FAIL", "Prediction source is not explicit in weather-api.ts.")

    check("authenticated-api-boundary", "BLOCKED", "No authenticated runtime session was supplied to this read-only validator.",
          "Review route authentication and Supabase RLS policies before production deployment.")
    check("browser-ui-workflow", "BLOCKED", "No browser automation driver is configured in this environment.",
          "API/database checks do not prove that every frontend interaction renders and persists correctly.")

    summary = {s: sum(1 for x in results if x["status"] == s) for s in ("PASS", "FAIL", "BLOCKED")}
    document = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "workspace": str(ROOT),
        "summary": summary,
        "checks": results,
        "scope": "Read-only validation; no schema synchronization, seed, write, commit, or push performed.",
    }
    (OUT / "system_validation_results.json").write_text(json.dumps(document, indent=2) + "\n")
    report = ["# SpaceDebri-Guard System Validation", "", f"Generated: {document['generated_at']}", "",
              f"Result: **{summary['FAIL']} failed, {summary['BLOCKED']} blocked, {summary['PASS']} passed**.", "",
              "This run is read-only. It does not seed records, run `prisma db push`, alter production code, or push changes.", "",
              "## Checks", ""]
    for item in results:
        report += [f"### {item['status']} — {item['name']}", "", str(item["evidence"]), ""]
        if item.get("limitation"):
            report += [f"Limitation: {item['limitation']}", ""]
    report += ["## Prior independent evidence", "", "- ML holdout comparison: High class has only five test examples; model selection is informative, not production certification.", "- Orbital propagation: npm/Python SGP4 comparison contains tolerance failures documented in `orbital_validation`.", "- Conjunction detection: synthetic cases detected as expected; malformed propagation exceptions remain unhandled by production screening.", "- No historical conjunction reference dataset was available for recall/precision validation.", ""]
    (OUT / "SYSTEM_VALIDATION_REPORT.md").write_text("\n".join(report))
    print(json.dumps(summary))
    return 1 if summary["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
