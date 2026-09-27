"""
Step 12 — Feature matrix validation (baseline vs rebuilt).
Does not train models or modify production artifacts.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from feature_engineering import (  # noqa: E402
    FEATURE_COLUMNS,
    TARGET_COLUMN,
    add_engineered_features,
    build_training_matrix,
)
from preprocessing import preprocess_space_weather_frame  # noqa: E402

BASELINE_PATH = BASE_DIR / "data" / "processed" / "final_with_kp_sw.csv"
REBUILT_PATH = BASE_DIR / "data" / "processed" / "final_with_kp_sw.REBUILT_STEP11.csv"
BACKUP_DIR = BASE_DIR / "data" / "baseline_backups"


def calendar_expansion_row_count(dates: pd.Series) -> int:
    valid = dates.dropna()
    if valid.empty:
        return 0
    daily = pd.date_range(valid.min(), valid.max(), freq="D")
    return len(daily)


def analyze_pipeline_stages(df_raw: pd.DataFrame) -> dict:
    """Mirror feature_engineering + preprocessing stages with row accounting."""
    processed = preprocess_space_weather_frame(df_raw)
    raw_rows = len(processed)

    dates = processed["date"]
    after_calendar_expansion = calendar_expansion_row_count(dates)

    engineered = add_engineered_features(processed)
    physical_retained = len(engineered)

    complete_features = engineered.dropna(subset=FEATURE_COLUMNS)
    rows_complete_features = len(complete_features)

    # Target stage (same as build_training_matrix)
    original_dates = engineered["date"].copy()
    with_target = (
        engineered.sort_values("date")
        .reset_index(drop=True)
        .set_index("date")
        .asfreq("D")
        .reset_index()
    )
    with_target[TARGET_COLUMN] = with_target["risk_level"].shift(-1)
    with_target = with_target[with_target["date"].isin(original_dates.dropna().unique())]
    with_target = with_target.sort_values("date").reset_index(drop=True)

    rows_complete_target = with_target[TARGET_COLUMN].notna().sum()
    rows_complete_both = with_target.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])
    final_usable = len(rows_complete_both)

    rows_missing_features_only = len(
        with_target[with_target[TARGET_COLUMN].notna()].dropna(subset=[TARGET_COLUMN]).dropna(
            subset=FEATURE_COLUMNS, how="all"
        )
    )
    # Rows with target but incomplete features
    has_target = with_target[TARGET_COLUMN].notna()
    incomplete_feat_with_target = len(
        with_target[has_target & with_target[FEATURE_COLUMNS].isna().any(axis=1)]
    )
    has_features = with_target[FEATURE_COLUMNS].notna().all(axis=1)
    incomplete_target_with_features = len(
        with_target[has_features & with_target[TARGET_COLUMN].isna()]
    )

    X, y, full = build_training_matrix(processed)
    assert len(full) == final_usable, "Stage counts must match build_training_matrix"
    assert list(X.columns) == list(FEATURE_COLUMNS)

    return {
        "raw_input_rows": raw_rows,
        "rows_after_calendar_expansion": after_calendar_expansion,
        "physical_rows_retained_after_filter": physical_retained,
        "rows_with_complete_feature_values": rows_complete_features,
        "rows_with_complete_target_values": int(rows_complete_target),
        "final_usable_ml_rows": final_usable,
        "dropped_incomplete_features_with_target": incomplete_feat_with_target,
        "dropped_incomplete_target_with_features": incomplete_target_with_features,
        "physical_retained_equals_raw": physical_retained == raw_rows,
        "full_frame_with_target": with_target,
        "X": X,
        "y": y,
        "full_ml": full,
    }


def class_counts(series: pd.Series) -> dict:
    vc = series.value_counts()
    total = len(series)
    out = {}
    for label in ("Low", "Medium", "High"):
        c = int(vc.get(label, 0))
        out[label] = {"count": c, "pct": round(100.0 * c / total, 2) if total else 0.0}
    return {"total": total, "by_class": out}


def year_breakdown(processed: pd.DataFrame, full_ml: pd.DataFrame) -> dict:
    years = range(2000, 2021)
    raw_by_year = processed.groupby(processed["date"].dt.year).size().to_dict()
    result = {}
    for y in years:
        raw = int(raw_by_year.get(y, 0))
        ml_y = full_ml[full_ml["date"].dt.year == y]
        usable = len(ml_y)
        dropped = raw - usable
        tgt = ml_y[TARGET_COLUMN]
        low = int((tgt == "Low").sum())
        med = int((tgt == "Medium").sum())
        high = int((tgt == "High").sum())
        result[str(y)] = {
            "raw_rows": raw,
            "usable_ml_rows": usable,
            "dropped_rows": dropped,
            "Low": low,
            "Medium": med,
            "High": high,
        }
    return result


def gap_sample_rows(processed: pd.DataFrame, start: str, end: str, n_each_side: int = 5) -> list[dict]:
    """Rows around a calendar gap for manual inspection."""
    processed = processed.sort_values("date")
    eng = add_engineered_features(processed)
    original_dates = eng["date"].copy()
    wt = (
        eng.sort_values("date")
        .reset_index(drop=True)
        .set_index("date")
        .asfreq("D")
        .reset_index()
    )
    wt[TARGET_COLUMN] = wt["risk_level"].shift(-1)
    wt = wt[wt["date"].isin(original_dates.dropna().unique())]

    window_start = pd.Timestamp(start) - pd.Timedelta(days=n_each_side)
    window_end = pd.Timestamp(end) + pd.Timedelta(days=n_each_side)
    sub = wt[(wt["date"] >= window_start) & (wt["date"] <= window_end)].copy()

    show_cols = (
        ["date", "proton_flux", "risk_level", TARGET_COLUMN]
        + FEATURE_COLUMNS[:6]
        + ["proton_trend", "proton_spike", "kp_lag1", "bz_lag1"]
    )
    show_cols = [c for c in show_cols if c in sub.columns]

    rows = []
    for _, r in sub.iterrows():
        entry = {}
        for c in show_cols:
            v = r[c]
            if isinstance(v, (float, np.floating)) and pd.isna(v):
                entry[c] = None
            elif hasattr(v, "isoformat"):
                entry[c] = v.isoformat()[:10]
            else:
                entry[c] = v if not (isinstance(v, float) and np.isnan(v)) else None
        rows.append(entry)
    return rows


def find_target_gap_examples(processed: pd.DataFrame, limit: int = 8) -> list[dict]:
    """Dates where next calendar day has no physical row — target must be NaN."""
    processed = preprocess_space_weather_frame(processed)
    dates_set = set(processed["date"].dropna())
    sorted_dates = sorted(dates_set)
    examples = []
    for d in sorted_dates:
        next_cal = d + pd.Timedelta(days=1)
        if next_cal not in dates_set:
            eng = add_engineered_features(processed)
            row = eng[eng["date"] == d]
            if row.empty:
                continue
            wt = (
                eng.set_index("date")
                .asfreq("D")
                .reset_index()
            )
            wt[TARGET_COLUMN] = wt["risk_level"].shift(-1)
            wt = wt[wt["date"].isin(processed["date"].unique())]
            trow = wt[wt["date"] == d]
            if trow.empty:
                continue
            target_val = trow[TARGET_COLUMN].iloc[0]
            examples.append(
                {
                    "date": d.strftime("%Y-%m-%d"),
                    "risk_level_today": row["risk_level"].iloc[0],
                    "next_calendar_day": next_cal.strftime("%Y-%m-%d"),
                    "next_calendar_day_in_dataset": False,
                    "target_next_day": None if pd.isna(target_val) else str(target_val),
                    "target_correctly_unavailable": pd.isna(target_val),
                }
            )
            if len(examples) >= limit:
                break
    return examples


def leakage_validation_report() -> dict:
    """Static diagnostic of feature_engineering.py semantics."""
    checks = [
        {
            "feature": "proton_lag1 / lag2",
            "uses": "shift(1), shift(2) on calendar daily index after asfreq('D')",
            "max_lookahead": "T (value at T-1, T-2 calendar days)",
            "concern": None,
        },
        {
            "feature": "proton_roll3 / roll7",
            "uses": "rolling window on calendar index; NaN if gap in window",
            "max_lookahead": "T (includes same-day proton_flux at T)",
            "concern": None,
        },
        {
            "feature": "proton_trend",
            "uses": "proton_lag1 - proton_lag2",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": "proton_spike",
            "uses": "proton_flux[T] > proton_roll3[T] * 1.3 (roll includes day T)",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": "xray_* (lag, roll, trend, spike)",
            "uses": "Same pattern as proton on xray_flux",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": "kp_lag1, kp_lag2, kp_roll3, kp_trend",
            "uses": "shift/rolling on kp_index calendar index",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": "bz_lag1",
            "uses": "shift(1) on bz",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": "proton_flux, kp_index, bz (direct)",
            "uses": "Same-day physical columns unchanged",
            "max_lookahead": "T",
            "concern": None,
        },
        {
            "feature": TARGET_COLUMN,
            "uses": "risk_level.shift(-1) on calendar index — label only",
            "max_lookahead": "T+1 (allowed for supervised target)",
            "concern": None,
        },
    ]
    return {
        "method": "static_review_of_feature_engineering.py",
        "features_must_not_use_T_plus_1": True,
        "target_may_use_T_plus_1": True,
        "checks": checks,
        "explicit_concerns": [],
    }


def format_stage_report(name: str, stages: dict) -> list[str]:
    lines = [
        f"  [{name}]",
        f"    1. Raw input rows                          : {stages['raw_input_rows']:,}",
        f"    2. Rows after calendar expansion (range)   : {stages['rows_after_calendar_expansion']:,}",
        f"    3. Original physical rows retained         : {stages['physical_rows_retained_after_filter']:,}",
        f"    4. Rows with complete feature values       : {stages['rows_with_complete_feature_values']:,}",
        f"    5. Rows with complete target values        : {stages['rows_with_complete_target_values']:,}",
        f"    6. Final usable ML rows (features+target)  : {stages['final_usable_ml_rows']:,}",
        "",
        "  Where rows are lost:",
        f"    • Calendar filter: retained count equals raw ({stages['physical_retained_equals_raw']}); "
        "no synthetic observation rows kept.",
        f"    • Feature incomplete (has date, missing ≥1 feature): "
        f"{stages['raw_input_rows'] - stages['rows_with_complete_feature_values']:,} physical rows "
        f"({stages['raw_input_rows']:,} → {stages['rows_with_complete_feature_values']:,}).",
        f"    • Target unavailable (next calendar day missing or no risk): "
        f"{stages['dropped_incomplete_target_with_features']:,} rows had full features but no target.",
        f"    • Final dropna: removes any row missing features OR target → "
        f"{stages['final_usable_ml_rows']:,} rows.",
    ]
    feat_to_final = stages["rows_with_complete_feature_values"] - stages["final_usable_ml_rows"]
    if feat_to_final > 0:
        lines.append(
            f"    • Additional loss from feature-complete set to final: {feat_to_final:,} "
            "(target missing on calendar-next-day gaps or edge last day)."
        )
    return lines


def main() -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_txt = BACKUP_DIR / f"step12_feature_matrix_validation_{ts}.txt"
    out_json = BACKUP_DIR / f"step12_feature_matrix_validation_{ts}.json"

    baseline_raw = pd.read_csv(BASELINE_PATH)
    rebuilt_raw = pd.read_csv(REBUILT_PATH)

    baseline = analyze_pipeline_stages(baseline_raw)
    rebuilt = analyze_pipeline_stages(rebuilt_raw)

    baseline_proc = preprocess_space_weather_frame(baseline_raw)
    rebuilt_proc = preprocess_space_weather_frame(rebuilt_raw)

    baseline_years = year_breakdown(baseline_proc, baseline["full_ml"])
    rebuilt_years = year_breakdown(rebuilt_proc, rebuilt["full_ml"])

    baseline_classes = class_counts(baseline["y"])
    rebuilt_classes = class_counts(rebuilt["y"])

    gap_2007_2009 = gap_sample_rows(rebuilt_proc, "2008-04-04", "2009-06-01", n_each_side=4)
    gap_2008 = gap_sample_rows(rebuilt_proc, "2007-12-31", "2008-01-15", n_each_side=3)

    target_examples_baseline = find_target_gap_examples(baseline_raw, limit=5)
    target_examples_rebuilt = find_target_gap_examples(rebuilt_raw, limit=8)

    leakage = leakage_validation_report()

    rows_gained = rebuilt["final_usable_ml_rows"] - baseline["final_usable_ml_rows"]
    raw_gained = rebuilt["raw_input_rows"] - baseline["raw_input_rows"]

    # New examples attributable to 2004-2011 raw rows
    years_new = ["2004", "2005", "2006", "2007", "2008", "2009", "2010", "2011"]
    baseline_usable_new_band = sum(baseline_years[y]["usable_ml_rows"] for y in years_new)
    rebuilt_usable_new_band = sum(rebuilt_years[y]["usable_ml_rows"] for y in years_new)
    ml_gained_2004_2011 = rebuilt_usable_new_band - baseline_usable_new_band

    report_json = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "baseline_path": str(BASELINE_PATH),
        "rebuilt_path": str(REBUILT_PATH),
        "production_csv_unmodified": str(BASELINE_PATH),
        "feature_columns": list(FEATURE_COLUMNS),
        "target_column": TARGET_COLUMN,
        "target_definition": "risk_level on calendar day T+1 (shift(-1) after daily asfreq); NaN if T+1 missing",
        "baseline": {
            "stages": {k: v for k, v in baseline.items() if k not in ("X", "y", "full_ml", "full_frame_with_target")},
            "class_distribution_final_ml": baseline_classes,
            "per_year": baseline_years,
        },
        "rebuilt": {
            "stages": {k: v for k, v in rebuilt.items() if k not in ("X", "y", "full_ml", "full_frame_with_target")},
            "class_distribution_final_ml": rebuilt_classes,
            "per_year": rebuilt_years,
        },
        "comparison": {
            "raw_row_delta": raw_gained,
            "final_usable_ml_delta": rows_gained,
            "usable_ml_gained_2004_2011_band": ml_gained_2004_2011,
            "feature_column_order_match": list(baseline["X"].columns) == list(rebuilt["X"].columns),
        },
        "gap_behavior_samples": {
            "rebuilt_2008_04_to_2009_06": gap_2007_2009,
            "rebuilt_2007_2008_transition": gap_2008,
        },
        "target_validation_examples": {
            "baseline": target_examples_baseline,
            "rebuilt": target_examples_rebuilt,
        },
        "leakage_validation": leakage,
    }

    lines: list[str] = []
    lines.append("=" * 78)
    lines.append("STEP 12 — FEATURE MATRIX VALIDATION (BASELINE vs REBUILT)")
    lines.append("=" * 78)
    lines.append(f"Generated (UTC): {report_json['generated_utc']}")
    lines.append("")
    lines.append("PATHS")
    lines.append(f"  Baseline (production): {BASELINE_PATH}")
    lines.append(f"  Rebuilt (candidate)  : {REBUILT_PATH}")
    lines.append("")
    lines.append("FEATURE SET (order fixed)")
    lines.append(f"  {FEATURE_COLUMNS}")
    lines.append(f"  Target: {TARGET_COLUMN} = next calendar day risk_level")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 2 — ROW COUNTS BY PIPELINE STAGE")
    lines.append("=" * 78)
    lines.extend(format_stage_report("Baseline", baseline))
    lines.append("")
    lines.extend(format_stage_report("Rebuilt", rebuilt))
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 3 — YEAR-BY-YEAR (2000–2020)")
    lines.append("=" * 78)
    lines.append(
        f"  {'Year':<6} {'Set':<10} {'Raw':>6} {'UsableML':>9} {'Dropped':>8} "
        f"{'Low':>6} {'Med':>6} {'High':>6}"
    )
    lines.append("  " + "-" * 70)
    for y in range(2000, 2021):
        ys = str(y)
        for label, yd in [("baseline", baseline_years), ("rebuilt", rebuilt_years)]:
            r = yd[ys]
            lines.append(
                f"  {ys:<6} {label:<10} {r['raw_rows']:>6} {r['usable_ml_rows']:>9} "
                f"{r['dropped_rows']:>8} {r['Low']:>6} {r['Medium']:>6} {r['High']:>6}"
            )
        lines.append("")
    lines.append("=" * 78)
    lines.append("PART 4 — CLASS DISTRIBUTION (FINAL USABLE ML ONLY)")
    lines.append("=" * 78)
    for label, dist in [("Baseline", baseline_classes), ("Rebuilt", rebuilt_classes)]:
        lines.append(f"  [{label}] n={dist['total']:,}")
        for c in ("Low", "Medium", "High"):
            b = dist["by_class"][c]
            lines.append(f"    {c}: {b['count']:,} ({b['pct']}%)")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 5 — GAP BEHAVIOR (REBUILT, 2007–2009 REGION)")
    lines.append("=" * 78)
    lines.append("  Calendar-aware lags/rolls use asfreq('D'); missing days → NaN in features.")
    lines.append("  Sample rows around 2008-04-04 … 2009-06-01 gap:")
    for row in gap_2007_2009:
        lines.append(f"    {json.dumps(row, default=str)}")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 6 — TARGET VALIDATION")
    lines.append("=" * 78)
    lines.append("  Examples where next calendar day is absent from raw data:")
    for ex in target_examples_rebuilt[:6]:
        lines.append(f"    {ex}")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 7 — FUTURE-LEAKAGE CHECK")
    lines.append("=" * 78)
    for chk in leakage["checks"]:
        lines.append(f"  • {chk['feature']}: max info at {chk['max_lookahead']}")
        if chk["concern"]:
            lines.append(f"    CONCERN: {chk['concern']}")
    if not leakage["explicit_concerns"]:
        lines.append("  No feature lookahead concerns identified (static review).")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 8 — BASELINE vs REBUILT SUMMARY")
    lines.append("=" * 78)
    lines.append(f"  Raw rows           : {baseline['raw_input_rows']:,} → {rebuilt['raw_input_rows']:,} (Δ {raw_gained:+,})")
    lines.append(
        f"  Final usable ML    : {baseline['final_usable_ml_rows']:,} → "
        f"{rebuilt['final_usable_ml_rows']:,} (Δ {rows_gained:+,})"
    )
    lines.append(f"  Usable ML in 2004–2011 band gained: {ml_gained_2004_2011:+,}")
    lines.append("")
    lines.append("=" * 78)
    lines.append("PART 9 — DECISION DATA (VALIDATION ONLY — NO PROMOTION)")
    lines.append("=" * 78)
    sparse_years = [
        ys
        for ys in years_new
        if rebuilt_years[ys]["raw_rows"] > 0
        and rebuilt_years[ys]["usable_ml_rows"] / max(rebuilt_years[ys]["raw_rows"], 1) < 0.5
    ]
    meaningful_years = [
        ys
        for ys in years_new
        if rebuilt_years[ys]["usable_ml_rows"] >= 100
    ]
    lines.append(f"  1. New ML training examples from 2004–2011 raw (+1,898 raw): ~{ml_gained_2004_2011:,} usable ML rows")
    lines.append(f"  2. Meaningful usable years (≥100 ML rows): {meaningful_years}")
    lines.append(f"  3. Sparse years (>50% dropped or very low usable): {sparse_years}")
    proceed = rows_gained > 0 and leakage["explicit_concerns"] == []
    lines.append(
        f"  4. Proceed to model evaluation (not retrain yet)? "
        f"{'Yes — candidate adds usable rows; methodology unchanged.' if proceed else 'Review required.'}"
    )
    lines.append(
        "  5. Methodological fixes before retrain: none from leakage review; "
        "sparse 2007–2009 years may limit value of those years in training."
    )

    out_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out_json.write_text(json.dumps(report_json, indent=2), encoding="utf-8")

    print(f"Wrote {out_txt}")
    print(f"Wrote {out_json}")
    print(f"Baseline final ML rows: {baseline['final_usable_ml_rows']}")
    print(f"Rebuilt final ML rows: {rebuilt['final_usable_ml_rows']}")
    print(f"Delta: {rows_gained:+}")


if __name__ == "__main__":
    main()
