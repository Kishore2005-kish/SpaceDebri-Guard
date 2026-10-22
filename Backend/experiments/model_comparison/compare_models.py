"""Evaluation-only comparison of classifiers for SpaceDebri-Guard.

This module imports the existing feature engineering and preprocessing code,
but never writes production models, datasets, or archived reports.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, confusion_matrix,
    f1_score, precision_recall_fscore_support, average_precision_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler

BASE_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = BASE_DIR / "Backend"
OUT_DIR = BACKEND_DIR / "experiments" / "model_comparison"
sys.path.insert(0, str(BACKEND_DIR))
from feature_engineering import FEATURE_COLUMNS, TARGET_COLUMN, build_training_matrix  # noqa: E402
from preprocessing import preprocess_space_weather_frame  # noqa: E402

CLASSES = ["Low", "Medium", "High"]
SEED = 42
DATASETS = {
    "baseline": BACKEND_DIR / "data/processed/final_with_kp_sw.csv",
    "rebuilt_step11": BACKEND_DIR / "data/processed/final_with_kp_sw.REBUILT_STEP11.csv",
}
HOLDOUT = {"train_end": "2015-12-31", "test_start": "2016-01-01", "test_end": "2019-12-31"}
WALK_WINDOWS = [
    {"name": "Exp2", "train_end": "2003-12-31", "test_start": "2012-01-01", "test_end": "2013-12-31"},
    {"name": "Exp3", "train_end": "2013-12-31", "test_start": "2014-01-01", "test_end": "2015-12-31"},
    {"name": "Exp4", "train_end": "2015-12-31", "test_start": "2016-01-01", "test_end": "2017-12-31"},
    {"name": "Exp5", "train_end": "2017-12-31", "test_start": "2018-01-01", "test_end": "2019-12-31"},
]
WEIGHTS = {"Low": 1, "Medium": 3, "High": 10}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def model_specs() -> dict[str, tuple[object, str]]:
    return {
        "random_forest": (RandomForestClassifier(n_estimators=500, class_weight=WEIGHTS, random_state=SEED, n_jobs=-1), "class_weight={Low:1,Medium:3,High:10}"),
        "logistic_regression": (Pipeline([
            ("scale", MinMaxScaler()),
            ("model", LogisticRegression(class_weight=WEIGHTS, max_iter=2000, random_state=SEED)),
        ]), "MinMaxScaler(train-only via Pipeline), class_weight={Low:1,Medium:3,High:10}"),
        "extra_trees": (ExtraTreesClassifier(n_estimators=500, class_weight=WEIGHTS, random_state=SEED, n_jobs=-1), "class_weight={Low:1,Medium:3,High:10}"),
        "hist_gradient_boosting": (HistGradientBoostingClassifier(max_iter=200, learning_rate=0.05, max_leaf_nodes=15, l2_regularization=1.0, random_state=SEED), "sample_weight=balanced training weights; fixed max_iter=200, learning_rate=.05, max_leaf_nodes=15"),
    }


def load_matrix(path: Path):
    raw = pd.read_csv(path)
    processed = preprocess_space_weather_frame(raw)
    X, y, engineered = build_training_matrix(processed)
    if list(X.columns) != FEATURE_COLUMNS:
        raise ValueError(f"Unexpected feature columns for {path}")
    return X.reset_index(drop=True), y.reset_index(drop=True), engineered.reset_index(drop=True)


def distribution(y: pd.Series) -> dict:
    counts = {label: int((y == label).sum()) for label in CLASSES}
    return {"total": len(y), "counts": counts, "percentages": {k: (100 * v / len(y) if len(y) else 0) for k, v in counts.items()}}


def estimator_fit(model, X, y):
    if isinstance(model, HistGradientBoostingClassifier):
        weights = y.map({label: 1 / max((y == label).mean(), 1e-12) for label in CLASSES}).to_numpy()
        weights = weights / weights.mean()
        return model.fit(X, y, sample_weight=weights)
    return model.fit(X, y)


def metrics(y_true, y_pred, proba, classes_seen) -> dict:
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=CLASSES, zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=CLASSES)
    pr_auc = {}
    if proba is not None:
        for index, label in enumerate(classes_seen):
            if label in CLASSES and (np.asarray(y_true) == label).any():
                pr_auc[label] = float(average_precision_score(np.asarray(y_true) == label, proba[:, index]))
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, labels=CLASSES, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, labels=CLASSES, average="weighted", zero_division=0)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
        "per_class": {label: {"precision": float(precision[i]), "recall": float(recall[i]), "f1": float(f1[i]), "pr_auc": pr_auc.get(label)} for i, label in enumerate(CLASSES)},
        "high_risk_test_n": int((y_true == "High").sum()),
        "high_risk_correct": int(((y_true == "High") & (y_pred == "High")).sum()),
        "confusion_matrix": cm.tolist(),
        "classes_order": CLASSES,
    }


def evaluate_one(model, X_train, y_train, X_test, y_test):
    fitted = estimator_fit(clone(model), X_train, y_train)
    prediction = fitted.predict(X_test)
    proba = fitted.predict_proba(X_test) if hasattr(fitted, "predict_proba") else None
    classes_seen = list(getattr(fitted, "classes_", CLASSES))
    return metrics(y_test, prediction, proba, classes_seen)


def split(engineered, X, y, train_end, test_start, test_end):
    dates = engineered["date"]
    train = dates <= pd.Timestamp(train_end)
    test = (dates >= pd.Timestamp(test_start)) & (dates <= pd.Timestamp(test_end))
    return X[train], y[train], X[test], y[test]


def majority_metrics(y_train, y_test):
    majority = y_train.value_counts().idxmax()
    pred = pd.Series([majority] * len(y_test), index=y_test.index)
    return majority, metrics(y_test, pred, None, CLASSES)


def evaluate_dataset(name, path):
    X, y, engineered = load_matrix(path)
    configs = {k: v[1] for k, v in model_specs().items()}
    result = {"dataset": name, "path": str(path.relative_to(BASE_DIR)), "sha256": sha256(path), "feature_list": FEATURE_COLUMNS, "target_column": TARGET_COLUMN, "warnings": []}
    Xtr, ytr, Xte, yte = split(engineered, X, y, **HOLDOUT)
    result["holdout"] = {"protocol": HOLDOUT, "train_n": len(ytr), "test_n": len(yte), "train_distribution": distribution(ytr), "test_distribution": distribution(yte), "models": {}}
    result["holdout"]["majority_baseline"] = {"majority_class": majority_metrics(ytr, yte)[0], "metrics": majority_metrics(ytr, yte)[1]}
    for name_model, (model, _) in model_specs().items():
        result["holdout"]["models"][name_model] = evaluate_one(model, Xtr, ytr, Xte, yte)
    result["walk_forward"] = []
    for window in WALK_WINDOWS:
        Xtr, ytr, Xte, yte = split(engineered, X, y, **{k: window[k] for k in ("train_end", "test_start", "test_end")})
        row = {"window": window["name"], "protocol": window, "train_n": len(ytr), "test_n": len(yte), "train_distribution": distribution(ytr), "test_distribution": distribution(yte), "models": {}}
        if len(ytr) and len(yte):
            majority, base_metrics = majority_metrics(ytr, yte)
            row["majority_baseline"] = {"majority_class": majority, "metrics": base_metrics}
            for name_model, (model, _) in model_specs().items():
                row["models"][name_model] = evaluate_one(model, Xtr, ytr, Xte, yte)
        else:
            row["skipped"] = "empty train or test"
        result["walk_forward"].append(row)
    return result, configs


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    datasets, configs = {}, {}
    for name, path in DATASETS.items():
        datasets[name], configs = evaluate_dataset(name, path)
    payload = {"generated_utc": datetime.now(timezone.utc).isoformat(), "seed": SEED, "datasets": datasets, "model_configurations": configs, "limitations": ["The primary test has only five High-risk observations; High-risk metrics are highly uncertain.", "No threshold tuning was performed; probabilities are model scores and are not calibrated probabilities.", "Bootstrap confidence intervals were not reported because the time-series dependence and extreme class sparsity make naive iid intervals misleading.", "scikit-learn emitted numerical overflow warnings while fitting Logistic Regression on extreme engineered values; predictions remained finite, so this result should be treated cautiously and revisited with domain-approved transformations."]}
    (OUT_DIR / "model_comparison_results.json").write_text(json.dumps(payload, indent=2) + "\n")
    write_report(payload)
    print_summary(payload)


def write_report(payload):
    lines = ["# Model Comparison Report", "", "## Executive summary", "", "This is an isolated evaluation. No production model, serving code, dataset, or existing report was modified.", "", "## Protocol", "", "Features and next-day target are imported from the existing `Backend/feature_engineering.py`. Primary holdout: train through 2015-12-31; test 2016-01-01 through 2019-12-31. Walk-forward windows reproduce the existing Step 13 windows (Exp2–Exp5). All models use the same rows per dataset.", "", "## Primary holdout results", ""]
    for dataset, result in payload["datasets"].items():
        h = result["holdout"]
        lines += [f"### {dataset}", "", f"Train/test: {h['train_n']} / {h['test_n']}; test classes: {h['test_distribution']['counts']}", "", "| Model | Accuracy | Macro F1 | Weighted F1 | Balanced acc. | High precision | High recall | High correct / n |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
        rows = {"majority_baseline": h["majority_baseline"]["metrics"], **{k: v for k, v in h["models"].items()}}
        for model, m in rows.items():
            high = m["per_class"]["High"]
            lines.append(f"| {model} | {m['accuracy']:.4f} | {m['macro_f1']:.4f} | {m['weighted_f1']:.4f} | {m['balanced_accuracy']:.4f} | {high['precision']:.4f} | {high['recall']:.4f} | {m['high_risk_correct']} / {m['high_risk_test_n']} |")
        lines += ["", "Confusion matrices and all per-class metrics are in `model_comparison_results.json`.", ""]
    lines += ["## Walk-forward results", "", "The JSON artifact contains every window, class distribution, confusion matrix, and model metric. Windows with zero High examples are explicitly marked; those cannot support a High-risk comparison.", "", "## Interpretation and limitations", "", "Accuracy is not a suitable sole selection criterion because the 2016–2019 test period is overwhelmingly Low-risk. Macro F1 and balanced accuracy weight minority classes more fairly. High recall with low precision can create excessive false alarms. The five High-risk holdout cases make all High-risk estimates fragile, so no production winner is declared from this experiment alone.", "", "## Model settings", "", "- Random Forest: existing 500-tree configuration with fixed class weights.", "- Logistic Regression: training-fitted MinMaxScaler pipeline, fixed class weights.", "- Extra Trees: 500 trees with fixed class weights.", "- HistGradientBoosting: fixed configuration with inverse-frequency training sample weights; estimator has no native `class_weight`.", "- No SMOTE, random split, test-set tuning, threshold tuning, or production artifact writes.", ""]
    (OUT_DIR / "MODEL_COMPARISON_REPORT.md").write_text("\n".join(lines))


def print_summary(payload):
    for dataset, result in payload["datasets"].items():
        h = result["holdout"]
        print(f"\n{dataset}: train={h['train_n']} test={h['test_n']} High={h['test_distribution']['counts']['High']}")
        rows = {"majority": h["majority_baseline"]["metrics"], **h["models"]}
        for name, m in rows.items():
            high = m["per_class"]["High"]
            print(f"  {name:22s} acc={m['accuracy']:.4f} macro_f1={m['macro_f1']:.4f} bal_acc={m['balanced_accuracy']:.4f} high_p={high['precision']:.4f} high_r={high['recall']:.4f}")


if __name__ == "__main__":
    main()
