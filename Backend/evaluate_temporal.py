import json
import datetime
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from sklearn.metrics import average_precision_score
from sklearn.model_selection import train_test_split
from feature_engineering import build_training_matrix, FEATURE_COLUMNS
from preprocessing import load_training_data, preprocess_space_weather_frame, TRAINING_DATA_PATH

def evaluate_model(y_true, y_pred, y_proba, classes):
    acc = accuracy_score(y_true, y_pred)
    p, r, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=classes, zero_division=0)
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(y_true, y_pred, average='macro', zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=classes)
    
    pr_auc_scores = {}
    for i, cls in enumerate(classes):
        y_true_bin = (np.array(y_true) == cls).astype(int)
        y_proba_cls = y_proba[:, i]
        pr_auc_scores[cls] = average_precision_score(y_true_bin, y_proba_cls)
        
    return {
        "accuracy": acc,
        "macro_precision": macro_p,
        "macro_recall": macro_r,
        "macro_f1": macro_f1,
        "per_class": {
            str(cls): {
                "precision": float(p[i]),
                "recall": float(r[i]),
                "f1": float(f1[i]),
                "pr_auc": float(pr_auc_scores[cls])
            } for i, cls in enumerate(classes)
        },
        "confusion_matrix": cm.tolist(),
        "classes_order": list(classes)
    }

def main():
    raw_df = load_training_data(TRAINING_DATA_PATH)
    processed_df = preprocess_space_weather_frame(raw_df)
    X, y, engineered_df = build_training_matrix(processed_df)
    
    classes = ["Low", "Medium", "High"]
    
    # 1. Random Split Evaluation (Baseline)
    X_train_rand, X_test_rand, y_train_rand, y_test_rand = train_test_split(
        X, y, test_size=0.2, shuffle=True, random_state=42
    )
    model_rand = RandomForestClassifier(
        n_estimators=500,
        class_weight={"Low": 1, "Medium": 3, "High": 10},
        random_state=42
    )
    model_rand.fit(X_train_rand, y_train_rand)
    y_pred_rand = model_rand.predict(X_test_rand)
    y_proba_rand = model_rand.predict_proba(X_test_rand)
    
    metrics_rand = evaluate_model(y_test_rand, y_pred_rand, y_proba_rand, model_rand.classes_)
    
    # 2. Chronological Split (Primary)
    train_mask = engineered_df['date'] <= pd.to_datetime('2015-12-31')
    test_mask = engineered_df['date'] >= pd.to_datetime('2016-01-01')
    
    X_train_chron = X[train_mask]
    y_train_chron = y[train_mask]
    X_test_chron = X[test_mask]
    y_test_chron = y[test_mask]
    
    model_chron = RandomForestClassifier(
        n_estimators=500,
        class_weight={"Low": 1, "Medium": 3, "High": 10},
        random_state=42
    )
    model_chron.fit(X_train_chron, y_train_chron)
    y_pred_chron = model_chron.predict(X_test_chron)
    y_proba_chron = model_chron.predict_proba(X_test_chron)
    
    metrics_chron = evaluate_model(y_test_chron, y_pred_chron, y_proba_chron, model_chron.classes_)
    
    total_train = len(y_train_chron)
    total_test = len(y_test_chron)
    train_counts = y_train_chron.value_counts().to_dict()
    test_counts = y_test_chron.value_counts().to_dict()
    
    report = {
        "dataset_time_range": {
            "start": str(engineered_df['date'].min()),
            "end": str(engineered_df['date'].max())
        },
        "train_period": {
            "start": str(engineered_df[train_mask]['date'].min()),
            "end": str(engineered_df[train_mask]['date'].max())
        },
        "test_period": {
            "start": str(engineered_df[test_mask]['date'].min()),
            "end": str(engineered_df[test_mask]['date'].max())
        },
        "training_class_distribution": {
            "total": total_train,
            "counts": train_counts,
            "percentages": {k: float(v)/total_train for k, v in train_counts.items()}
        },
        "test_class_distribution": {
            "total": total_test,
            "counts": test_counts,
            "percentages": {k: float(v)/total_test for k, v in test_counts.items()}
        },
        "random_split_metrics": metrics_rand,
        "chronological_metrics": metrics_chron,
        "model_configuration": {
            "model": "RandomForestClassifier",
            "n_estimators": 500,
            "class_weight": {"Low": 1, "Medium": 3, "High": 10},
            "random_state": 42
        },
        "feature_list": FEATURE_COLUMNS,
        "evaluation_timestamp": datetime.datetime.now().isoformat()
    }
    
    with open('evaluation_results.json', 'w') as f:
        json.dump(report, f, indent=2)
        
    print("Evaluation Results Saved to evaluation_results.json")
    print("\n--- SUMMARY ---")
    print(f"Random Macro F1: {metrics_rand['macro_f1']:.4f}")
    print(f"Chronological Macro F1: {metrics_chron['macro_f1']:.4f}")
    print("--- END SUMMARY ---")

if __name__ == "__main__":
    main()
