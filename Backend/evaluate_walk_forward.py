import json
import datetime
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
from sklearn.metrics import average_precision_score
from feature_engineering import build_training_matrix, FEATURE_COLUMNS
from preprocessing import load_training_data, preprocess_space_weather_frame, TRAINING_DATA_PATH

def evaluate_model(y_true, y_pred, y_proba, classes):
    if len(y_true) == 0:
        return None
        
    acc = accuracy_score(y_true, y_pred)
    p, r, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=classes, zero_division=0)
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(y_true, y_pred, average='macro', zero_division=0)
    cm = confusion_matrix(y_true, y_pred, labels=classes)
    
    pr_auc_scores = {}
    for i, cls in enumerate(classes):
        if cls in y_true.values:
            y_true_bin = (np.array(y_true) == cls).astype(int)
            y_proba_cls = y_proba[:, i]
            try:
                pr_auc_scores[cls] = average_precision_score(y_true_bin, y_proba_cls)
            except Exception:
                pr_auc_scores[cls] = None
        else:
            pr_auc_scores[cls] = None
            
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
                "pr_auc": float(pr_auc_scores[cls]) if pr_auc_scores[cls] is not None else None
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
    
    experiments = [
        {"name": "Exp1", "train_end": "2009-12-31", "test_start": "2010-01-01", "test_end": "2011-12-31"},
        {"name": "Exp2", "train_end": "2011-12-31", "test_start": "2012-01-01", "test_end": "2013-12-31"},
        {"name": "Exp3", "train_end": "2013-12-31", "test_start": "2014-01-01", "test_end": "2015-12-31"},
        {"name": "Exp4", "train_end": "2015-12-31", "test_start": "2016-01-01", "test_end": "2017-12-31"},
        {"name": "Exp5", "train_end": "2017-12-31", "test_start": "2018-01-01", "test_end": "2019-12-31"},
    ]
    
    windows_results = []
    
    for exp in experiments:
        train_mask = engineered_df['date'] <= pd.to_datetime(exp["train_end"])
        test_mask = (engineered_df['date'] >= pd.to_datetime(exp["test_start"])) & (engineered_df['date'] <= pd.to_datetime(exp["test_end"]))
        
        X_train, y_train = X[train_mask], y[train_mask]
        X_test, y_test = X[test_mask], y[test_mask]
        
        if len(y_train) == 0 or len(y_test) == 0:
            continue
            
        model = RandomForestClassifier(
            n_estimators=500,
            class_weight={"Low": 1, "Medium": 3, "High": 10},
            random_state=42
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)
        
        metrics = evaluate_model(y_test, y_pred, y_proba, model.classes_)
        
        train_counts = y_train.value_counts().to_dict()
        test_counts = y_test.value_counts().to_dict()
        
        # Ensure all classes are present in dict
        for c in classes:
            train_counts.setdefault(c, 0)
            test_counts.setdefault(c, 0)
            
        windows_results.append({
            "window": exp["name"],
            "train_period": {"start": str(engineered_df[train_mask]['date'].min()), "end": str(engineered_df[train_mask]['date'].max())},
            "test_period": {"start": str(engineered_df[test_mask]['date'].min()), "end": str(engineered_df[test_mask]['date'].max())},
            "train_samples": len(y_train),
            "test_samples": len(y_test),
            "train_class_distribution": {
                "counts": train_counts,
                "percentages": {k: float(v)/len(y_train) for k, v in train_counts.items()}
            },
            "test_class_distribution": {
                "counts": test_counts,
                "percentages": {k: float(v)/len(y_test) for k, v in test_counts.items()}
            },
            "metrics": metrics
        })

    regimes = [
        {"name": "2000-2003", "start": "2000-01-01", "end": "2003-12-31"},
        {"name": "2004-2007", "start": "2004-01-01", "end": "2007-12-31"},
        {"name": "2008-2011", "start": "2008-01-01", "end": "2011-12-31"},
        {"name": "2012-2015", "start": "2012-01-01", "end": "2015-12-31"},
        {"name": "2016-2019", "start": "2016-01-01", "end": "2019-12-31"},
    ]
    
    regime_results = []
    for reg in regimes:
        mask = (engineered_df['date'] >= pd.to_datetime(reg["start"])) & (engineered_df['date'] <= pd.to_datetime(reg["end"]))
        y_reg = y[mask]
        counts = y_reg.value_counts().to_dict()
        for c in classes:
            counts.setdefault(c, 0)
        total = len(y_reg)
        
        regime_results.append({
            "period": reg["name"],
            "samples": total,
            "counts": counts,
            "percentages": {k: (float(v)/total if total > 0 else 0) for k, v in counts.items()}
        })
        
    report = {
        "dataset_time_range": {
            "start": str(engineered_df['date'].min()),
            "end": str(engineered_df['date'].max())
        },
        "windows": windows_results,
        "regime_distributions": regime_results,
        "model_configuration": {
            "model": "RandomForestClassifier",
            "n_estimators": 500,
            "class_weight": {"Low": 1, "Medium": 3, "High": 10},
            "random_state": 42
        },
        "feature_list": FEATURE_COLUMNS,
        "evaluation_timestamp": datetime.datetime.now().isoformat()
    }
    
    with open('evaluation_walk_forward.json', 'w') as f:
        json.dump(report, f, indent=2)
        
    print("=== REGIME DISTRIBUTIONS ===")
    for r in regime_results:
        print(f"{r['period']}: Total {r['samples']} | Low {r['percentages']['Low']*100:.1f}% | Medium {r['percentages']['Medium']*100:.1f}% | High {r['percentages']['High']*100:.1f}%")
        
    print("\n=== WALK-FORWARD SUMMARY TABLE ===")
    header = f"{'Window':<8} | {'Train End':<10} | {'Test Period':<23} | {'Test Low %':<10} | {'Test Med %':<10} | {'Test High %':<11} | {'Acc':<6} | {'Mac F1':<6} | {'H Recall':<8}"
    print(header)
    print("-" * len(header))
    
    for w in windows_results:
        name = w["window"]
        t_end = w["train_period"]["end"][:10]
        test_p = w["test_period"]["start"][:10] + " to " + w["test_period"]["end"][:10]
        low_p = w["test_class_distribution"]["percentages"]["Low"] * 100
        med_p = w["test_class_distribution"]["percentages"]["Medium"] * 100
        high_p = w["test_class_distribution"]["percentages"]["High"] * 100
        acc = w["metrics"]["accuracy"]
        mac_f1 = w["metrics"]["macro_f1"]
        high_rec = w["metrics"]["per_class"]["High"]["recall"]
        
        print(f"{name:<8} | {t_end:<10} | {test_p:<23} | {low_p:>9.1f}% | {med_p:>9.1f}% | {high_p:>10.1f}% | {acc:>6.3f} | {mac_f1:>6.3f} | {high_rec:>8.3f}")

if __name__ == "__main__":
    main()
