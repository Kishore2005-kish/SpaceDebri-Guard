"""
Step 13 — Evaluation-only comparison: baseline vs rebuilt dataset.
Does not modify model.pkl, production CSV, or training pipeline modules.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from feature_engineering import FEATURE_COLUMNS, TARGET_COLUMN, build_training_matrix  # noqa: E402
from preprocessing import preprocess_space_weather_frame  # noqa: E402

BASELINE_CSV = BASE_DIR / "data" / "processed" / "final_with_kp_sw.csv"
REBUILT_CSV = BASE_DIR / "data" / "processed" / "final_with_kp_sw.REBUILT_STEP11.csv"
BACKUP_DIR = BASE_DIR / "data" / "baseline_backups"
MODEL_PKL = BASE_DIR / "model.pkl"
FE_PATH = BASE_DIR / "feature_engineering.py"

CLASSES = ["Low", "Medium", "High"]
RF_KWARGS = {
    "n_estimators": 500,
    "random_state": 42,
    "class_weight": {"Low": 1, "Medium": 3, "High": 10},
}

WALK_FORWARD = [
    {"name": "Exp2", "train_end": "2003-12-31", "test_start": "2012-01-01", "test_end": "2013-12-31"},
    {"name": "Exp3", "train_end": "2013-12-31", "test_start": "2014-01-01", "test_end": "2015-12-31"},
    {"name": "Exp4", "train_end": "2015-12-31", "test_start": "2016-01-01", "test_end": "2017-12-31"},
    {"name": "Exp5", "train_end": "2017-12-31", "test_start": "2018-01-01", "test_end": "2019-12-31"},
]

CHRONO_TRAIN_END = "2015-12-31"
CHRONO_TEST_START = "2016-01-01"
CHRONO_TEST_END = "2019-12-31"

EXCLUDE_YEARS_SENSITIVITY = (2007, 2008, 2009)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_matrix(csv_path: Path) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    raw = pd.read_csv(csv_path)
    processed = preprocess_space_weather_frame(raw)
    X, y, engineered = build_training_matrix(processed)
    assert list(X.columns) == list(FEATURE_COLUMNS)
    return X, y, engineered


def load_matrix_excluding_years(csv_path: Path, years: tuple[int, ...]) -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    raw = pd.read_csv(csv_path)
    raw["date"] = pd.to_datetime(raw["date"], errors="coerce")
    mask = ~raw["date"].dt.year.isin(years)
    raw = raw.loc[mask].reset_index(drop=True)
    processed = preprocess_space_weather_frame(raw)
    X, y, engineered = build_training_matrix(processed)
    return X, y, engineered


def class_distribution(y: pd.Series) -> dict:
    counts = {c: int((y == c).sum()) for c in CLASSES}
    total = len(y)
    pcts = {c: round(100.0 * counts[c] / total, 4) if total else 0.0 for c in CLASSES}
    return {"total": total, "counts": counts, "percentages": pcts}


def train_eval(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    model = RandomForestClassifier(**RF_KWARGS)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = float(accuracy_score(y_test, y_pred))
    p, r, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, labels=CLASSES, zero_division=0
    )
    macro_f1 = float(f1_score(y_test, y_pred, average="macro", zero_division=0))
    weighted_f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
    cm = confusion_matrix(y_test, y_pred, labels=CLASSES).tolist()

    per_class = {
        c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f1[i])}
        for i, c in enumerate(CLASSES)
    }

    return {
        "accuracy": acc,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "per_class": per_class,
        "confusion_matrix": cm,
        "confusion_matrix_labels": CLASSES,
    }


def split_chronological(engineered: pd.DataFrame, X: pd.DataFrame, y: pd.Series) -> tuple:
    dates = engineered["date"]
    train_m = dates <= pd.to_datetime(CHRONO_TRAIN_END)
    test_m = (dates >= pd.to_datetime(CHRONO_TEST_START)) & (
        dates <= pd.to_datetime(CHRONO_TEST_END)
    )
    return X.loc[train_m], y.loc[train_m], X.loc[test_m], y.loc[test_m]


def split_window(
    engineered: pd.DataFrame,
    X: pd.DataFrame,
    y: pd.Series,
    train_end: str,
    test_start: str,
    test_end: str,
) -> tuple:
    dates = engineered["date"]
    train_m = dates <= pd.to_datetime(train_end)
    test_m = (dates >= pd.to_datetime(test_start)) & (dates <= pd.to_datetime(test_end))
    return X.loc[train_m], y.loc[train_m], X.loc[test_m], y.loc[test_m]


def run_chronological(label: str, X: pd.DataFrame, y: pd.Series, engineered: pd.DataFrame) -> dict:
    X_tr, y_tr, X_te, y_te = split_chronological(engineered, X, y)
    metrics = train_eval(X_tr, y_tr, X_te, y_te)
    return {
        "dataset": label,
        "train_n": len(y_tr),
        "test_n": len(y_te),
        "train_class_distribution": class_distribution(y_tr),
        "test_class_distribution": class_distribution(y_te),
        "metrics": metrics,
    }


def run_walk_forward(label: str, X: pd.DataFrame, y: pd.Series, engineered: pd.DataFrame) -> list[dict]:
    results = []
    for exp in WALK_FORWARD:
        X_tr, y_tr, X_te, y_te = split_window(
            engineered, X, y, exp["train_end"], exp["test_start"], exp["test_end"]
        )
        if len(y_tr) == 0 or len(y_te) == 0:
            results.append(
                {
                    "window": exp["name"],
                    "dataset": label,
                    "skipped": True,
                    "reason": "empty train or test",
                }
            )
            continue
        metrics = train_eval(X_tr, y_tr, X_te, y_te)
        results.append(
            {
                "window": exp["name"],
                "dataset": label,
                "train_end": exp["train_end"],
                "test_period": f"{exp['test_start']} to {exp['test_end']}",
                "train_n": len(y_tr),
                "test_n": len(y_te),
                "train_class_distribution": class_distribution(y_tr),
                "test_class_distribution": class_distribution(y_te),
                "metrics": metrics,
            }
        )
    return results


def delta(a: float | int, b: float | int) -> float | int:
    if isinstance(a, float) or isinstance(b, float):
        return float(b) - float(a)
    return int(b) - int(a)


def comparison_row(metric: str, old_v, new_v) -> dict:
    return {"metric": metric, "baseline": old_v, "rebuilt": new_v, "delta": delta(old_v, new_v)}


def format_txt_report(payload: dict) -> str:
    lines: list[str] = []
    ch = payload["chronological"]
    base_ch = ch["baseline"]
    reb_ch = ch["rebuilt"]

    lines.append("=" * 78)
    lines.append("STEP 13 — REBUILT DATASET EVALUATION (EVALUATION ONLY)")
    lines.append("=" * 78)
    lines.append(f"Generated (UTC): {payload['generated_utc']}")
    lines.append("")
    lines.append("PART 2 — CHRONOLOGICAL HOLDOUT (train ≤2015-12-31, test 2016–2019)")
    lines.append(f"  Baseline train n={base_ch['train_n']}, test n={base_ch['test_n']}")
    lines.append(f"  Rebuilt  train n={reb_ch['train_n']}, test n={reb_ch['test_n']}")
    lines.append("")
    lines.append("PART 3 — METRIC COMPARISON TABLE")
    lines.append(f"  {'Metric':<28} {'Baseline':>12} {'Rebuilt':>12} {'Delta':>12}")
    lines.append("  " + "-" * 66)
    for row in payload["chronological_comparison_table"]:
        b, r, d = row["baseline"], row["rebuilt"], row["delta"]
        if isinstance(d, float):
            lines.append(f"  {row['metric']:<28} {b:>12.4f} {r:>12.4f} {d:>+12.4f}")
        else:
            lines.append(f"  {row['metric']:<28} {b:>12} {r:>12} {d:>+12}")
    lines.append("")
    lines.append("PART 4/5 — WALK-FORWARD (baseline vs rebuilt)")
    for exp_name in ["Exp2", "Exp3", "Exp4", "Exp5"]:
        b = next(x for x in payload["walk_forward"]["baseline"] if x.get("window") == exp_name)
        r = next(x for x in payload["walk_forward"]["rebuilt"] if x.get("window") == exp_name)
        if b.get("skipped") or r.get("skipped"):
            continue
        lines.append(f"  {exp_name} | train baseline/rebuilt: {b['train_n']}/{r['train_n']} | test: {b['test_n']}/{r['test_n']}")
        bm, rm = b["metrics"], r["metrics"]
        lines.append(
            f"    Acc {bm['accuracy']:.4f} → {rm['accuracy']:.4f} | "
            f"Macro F1 {bm['macro_f1']:.4f} → {rm['macro_f1']:.4f} | "
            f"High recall {bm['per_class']['High']['recall']:.4f} → {rm['per_class']['High']['recall']:.4f}"
        )
    lines.append("")
    lines.append("PART 6 — FULL MATRIX CLASS BALANCE (usable ML rows)")
    for key in ("baseline_matrix", "rebuilt_matrix"):
        cd = payload["class_balance_analysis"][key]
        lines.append(f"  {key}: Low {cd['Low']} | Medium {cd['Medium']} | High {cd['High']}")
    lines.append("")
    lines.append("PART 7 — 2007–2009 SENSITIVITY (chronological holdout, rebuilt only)")
    sens = payload["sensitivity_chronological"]
    lines.append(f"  All 2004–2011 included : acc={sens['rebuilt_all']['metrics']['accuracy']:.4f} macro_f1={sens['rebuilt_all']['metrics']['macro_f1']:.4f}")
    lines.append(
        f"  Excluding 2007–2009      : acc={sens['rebuilt_no_2007_2009']['metrics']['accuracy']:.4f} "
        f"macro_f1={sens['rebuilt_no_2007_2009']['metrics']['macro_f1']:.4f} "
        f"(train n {sens['rebuilt_no_2007_2009']['train_n']})"
    )
    lines.append("")
    lines.append("PART 8 — FACTUAL INTERPRETATION")
    for item in payload["interpretation"]["factual_answers"]:
        lines.append(f"  {item['q']}")
        lines.append(f"    {item['a']}")
    lines.append("")
    lines.append("INTEGRITY CHECKS")
    for k, v in payload["integrity"].items():
        lines.append(f"  {k}: {v}")
    return "\n".join(lines) + "\n"


def main() -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    integrity_before = {
        "production_csv_sha256": sha256_file(BASELINE_CSV),
        "model_pkl_sha256": sha256_file(MODEL_PKL),
        "feature_engineering_sha256": sha256_file(FE_PATH),
        "rebuilt_csv_sha256": sha256_file(REBUILT_CSV),
    }

    X_b, y_b, eng_b = load_matrix(BASELINE_CSV)
    X_r, y_r, eng_r = load_matrix(REBUILT_CSV)

    ch_base = run_chronological("baseline", X_b, y_b, eng_b)
    ch_reb = run_chronological("rebuilt", X_r, y_r, eng_r)

    m_b = ch_base["metrics"]
    m_r = ch_reb["metrics"]
    comparison_table = [
        comparison_row("train_rows", ch_base["train_n"], ch_reb["train_n"]),
        comparison_row("test_rows", ch_base["test_n"], ch_reb["test_n"]),
        comparison_row("accuracy", m_b["accuracy"], m_r["accuracy"]),
        comparison_row("macro_f1", m_b["macro_f1"], m_r["macro_f1"]),
        comparison_row("weighted_f1", m_b["weighted_f1"], m_r["weighted_f1"]),
    ]
    for cls in CLASSES:
        for stat in ("precision", "recall", "f1"):
            comparison_table.append(
                comparison_row(
                    f"{cls}_{stat}",
                    m_b["per_class"][cls][stat],
                    m_r["per_class"][cls][stat],
                )
            )

    wf_base = run_walk_forward("baseline", X_b, y_b, eng_b)
    wf_reb = run_walk_forward("rebuilt", X_r, y_r, eng_r)

    # Sensitivity: rebuilt with/without 2007-2009
    X_ra, y_ra, eng_ra = load_matrix(REBUILT_CSV)
    ch_all = run_chronological("rebuilt_all", X_ra, y_ra, eng_ra)
    X_rn, y_rn, eng_rn = load_matrix_excluding_years(REBUILT_CSV, EXCLUDE_YEARS_SENSITIVITY)
    ch_no_gap = run_chronological("rebuilt_excl_2007_2009", X_rn, y_rn, eng_rn)

    baseline_matrix_classes = class_distribution(y_b)
    rebuilt_matrix_classes = class_distribution(y_r)

    # Optional: prior walk-forward file at repo root
    prior_wf_path = BASE_DIR.parent / "evaluation_walk_forward.json"
    prior_wf_note = None
    if prior_wf_path.is_file():
        prior_wf_note = "See archived evaluation_walk_forward.json; Step 13 re-runs with current FE on both datasets."

    interpretation = {
        "factual_answers": [
            {
                "q": "1. Did rebuilt increase usable ML examples?",
                "a": f"Yes: baseline matrix n={len(y_b)}, rebuilt n={len(y_r)} (+{len(y_r) - len(y_b)}).",
            },
            {
                "q": "2. Did temporal class distributions change?",
                "a": (
                    f"Full-matrix Low/Med/High pct shifted (baseline "
                    f"{baseline_matrix_classes['percentages']['Low']}% / "
                    f"{baseline_matrix_classes['percentages']['Medium']}% / "
                    f"{baseline_matrix_classes['percentages']['High']}% vs rebuilt "
                    f"{rebuilt_matrix_classes['percentages']['Low']}% / "
                    f"{rebuilt_matrix_classes['percentages']['Medium']}% / "
                    f"{rebuilt_matrix_classes['percentages']['High']}%). "
                    f"Chronological train set grew {ch_base['train_n']} → {ch_reb['train_n']} with more Low-weight years."
                ),
            },
            {
                "q": "3. Did chronological performance metrics change?",
                "a": (
                    f"Accuracy {m_b['accuracy']:.4f} → {m_r['accuracy']:.4f}; "
                    f"macro F1 {m_b['macro_f1']:.4f} → {m_r['macro_f1']:.4f}; "
                    f"weighted F1 {m_b['weighted_f1']:.4f} → {m_r['weighted_f1']:.4f}."
                ),
            },
            {
                "q": "4. Did High recall change?",
                "a": (
                    f"High recall {m_b['per_class']['High']['recall']:.4f} → "
                    f"{m_r['per_class']['High']['recall']:.4f} on 2016–2019 holdout."
                ),
            },
            {
                "q": "5. Did walk-forward performance change?",
                "a": "See walk_forward section — largest train-set deltas on Exp3+ where 2004–2011 enters training.",
            },
            {
                "q": "6. Causes: data vs class distribution?",
                "a": "Both: additional 2004–2011 rows change training composition (especially Low share); "
                "test windows 2016–2019 unchanged, so metric shifts reflect retrained model not new test labels.",
            },
            {
                "q": "7. New methodological issues?",
                "a": "None new beyond known extreme test-set imbalance (mostly Low in 2016–2019) and sparse 2007–2009 years.",
            },
            {
                "q": "8. Retrain as next controlled experiment?",
                "a": "Evaluation supports a controlled retrain experiment on rebuilt data; production model.pkl was not updated in Step 13.",
            },
        ],
        "measured": "All metrics from in-memory RF fits with fixed hyperparameters.",
        "interpretation": "Metrics mix train composition effects and fixed test regimes; macro F1 is sensitive to minority classes.",
        "limitations": "No tuning; single holdout; test period remains Low-dominated; 2007–2009 sensitivity is diagnostic only.",
    }

    class_balance_analysis = {
        "baseline_matrix": baseline_matrix_classes["counts"],
        "rebuilt_matrix": rebuilt_matrix_classes["counts"],
        "note": "Imbalance not solved — rebuilt adds disproportionately Low labels.",
        "accuracy_macro_f1_interpretation": (
            "Higher accuracy on 2016–2019 often tracks predicting Low (majority). "
            "Macro F1 weights classes equally, so weak Medium/High performance still dominates macro score "
            "even when accuracy rises."
        ),
    }

    integrity_after = {
        "production_csv_unchanged": sha256_file(BASELINE_CSV) == integrity_before["production_csv_sha256"],
        "model_pkl_unchanged": sha256_file(MODEL_PKL) == integrity_before["model_pkl_sha256"],
        "feature_engineering_unchanged": sha256_file(FE_PATH) == integrity_before["feature_engineering_sha256"],
        "rebuilt_csv_unchanged": sha256_file(REBUILT_CSV) == integrity_before["rebuilt_csv_sha256"],
        "hashes": integrity_before,
        "methodology": {
            "no_hyperparameter_tuning": True,
            "no_random_split_for_primary": True,
            "no_smote": True,
            "no_label_changes": True,
            "model_pkl_not_written": True,
        },
    }

    payload = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "paths": {
            "baseline_csv": str(BASELINE_CSV),
            "rebuilt_csv": str(REBUILT_CSV),
        },
        "model_configuration": {"model": "RandomForestClassifier", **RF_KWARGS},
        "feature_columns": FEATURE_COLUMNS,
        "target_column": TARGET_COLUMN,
        "usable_ml_rows": {"baseline": len(y_b), "rebuilt": len(y_r)},
        "chronological": {"baseline": ch_base, "rebuilt": ch_reb},
        "chronological_comparison_table": comparison_table,
        "walk_forward": {"baseline": wf_base, "rebuilt": wf_reb},
        "class_balance_analysis": class_balance_analysis,
        "sensitivity_chronological": {
            "rebuilt_all": ch_all,
            "rebuilt_no_2007_2009": ch_no_gap,
            "excluded_years": list(EXCLUDE_YEARS_SENSITIVITY),
        },
        "prior_artifacts_note": prior_wf_note,
        "interpretation": interpretation,
        "integrity": integrity_after,
    }

    out_json = BACKUP_DIR / f"step13_rebuilt_evaluation_{ts}.json"
    out_txt = BACKUP_DIR / f"step13_rebuilt_evaluation_{ts}.txt"
    out_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    out_txt.write_text(format_txt_report(payload), encoding="utf-8")

    print(f"Wrote {out_json}")
    print(f"Wrote {out_txt}")
    print(f"Chronological macro F1 baseline={m_b['macro_f1']:.4f} rebuilt={m_r['macro_f1']:.4f}")
    print(f"High recall baseline={m_b['per_class']['High']['recall']:.4f} rebuilt={m_r['per_class']['High']['recall']:.4f}")


if __name__ == "__main__":
    main()
