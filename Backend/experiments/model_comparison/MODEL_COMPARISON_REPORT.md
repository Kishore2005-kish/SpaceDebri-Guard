# Model Comparison Report

## Executive summary

This is an isolated evaluation. No production model, serving code, dataset, or existing report was modified.

## Protocol

Features and next-day target are imported from the existing `Backend/feature_engineering.py`. Primary holdout: train through 2015-12-31; test 2016-01-01 through 2019-12-31. Walk-forward windows reproduce the existing Step 13 windows (Exp2–Exp5). All models use the same rows per dataset.

## Primary holdout results

### baseline

Train/test: 2717 / 1071; test classes: {'Low': 1058, 'Medium': 8, 'High': 5}

| Model | Accuracy | Macro F1 | Weighted F1 | Balanced acc. | High precision | High recall | High correct / n |
|---|---:|---:|---:|---:|---:|---:|---:|
| majority_baseline | 0.9879 | 0.3313 | 0.9818 | 0.3333 | 0.0000 | 0.0000 | 0 / 5 |
| random_forest | 0.9860 | 0.4424 | 0.9843 | 0.4568 | 0.0000 | 0.0000 | 0 / 5 |
| logistic_regression | 0.9692 | 0.4703 | 0.9768 | 0.5011 | 0.3333 | 0.4000 | 2 / 5 |
| extra_trees | 0.9851 | 0.4313 | 0.9840 | 0.4564 | 0.0000 | 0.0000 | 0 / 5 |
| hist_gradient_boosting | 0.9879 | 0.6332 | 0.9879 | 0.5901 | 1.0000 | 0.4000 | 2 / 5 |

Confusion matrices and all per-class metrics are in `model_comparison_results.json`.

### rebuilt_step11

Train/test: 4506 / 1071; test classes: {'Low': 1058, 'Medium': 8, 'High': 5}

| Model | Accuracy | Macro F1 | Weighted F1 | Balanced acc. | High precision | High recall | High correct / n |
|---|---:|---:|---:|---:|---:|---:|---:|
| majority_baseline | 0.9879 | 0.3313 | 0.9818 | 0.3333 | 0.0000 | 0.0000 | 0 / 5 |
| random_forest | 0.9860 | 0.4100 | 0.9845 | 0.4154 | 0.0000 | 0.0000 | 0 / 5 |
| logistic_regression | 0.9813 | 0.4421 | 0.9824 | 0.4638 | 0.2857 | 0.4000 | 2 / 5 |
| extra_trees | 0.9869 | 0.4427 | 0.9852 | 0.4571 | 0.0000 | 0.0000 | 0 / 5 |
| hist_gradient_boosting | 0.9869 | 0.6764 | 0.9873 | 0.6811 | 0.8000 | 0.8000 | 4 / 5 |

Confusion matrices and all per-class metrics are in `model_comparison_results.json`.

## Walk-forward results

The JSON artifact contains every window, class distribution, confusion matrix, and model metric. Windows with zero High examples are explicitly marked; those cannot support a High-risk comparison.

## Interpretation and limitations

Accuracy is not a suitable sole selection criterion because the 2016–2019 test period is overwhelmingly Low-risk. Macro F1 and balanced accuracy weight minority classes more fairly. High recall with low precision can create excessive false alarms. The five High-risk holdout cases make all High-risk estimates fragile, so no production winner is declared from this experiment alone.

## Model settings

- Random Forest: existing 500-tree configuration with fixed class weights.
- Logistic Regression: training-fitted MinMaxScaler pipeline, fixed class weights.
- Extra Trees: 500 trees with fixed class weights.
- HistGradientBoosting: fixed configuration with inverse-frequency training sample weights; estimator has no native `class_weight`.
- No SMOTE, random split, test-set tuning, threshold tuning, or production artifact writes.
