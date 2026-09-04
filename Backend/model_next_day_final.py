from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

try:
    from .feature_engineering import FEATURE_COLUMNS, build_training_matrix, explain_features
    from .preprocessing import TRAINING_DATA_PATH, load_training_data, preprocess_space_weather_frame
except ImportError:
    from feature_engineering import FEATURE_COLUMNS, build_training_matrix, explain_features
    from preprocessing import TRAINING_DATA_PATH, load_training_data, preprocess_space_weather_frame


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"


def train_model(data_path=TRAINING_DATA_PATH):
    raw_df = load_training_data(data_path)
    processed_df = preprocess_space_weather_frame(raw_df)
    X, y, engineered_df = build_training_matrix(processed_df)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, shuffle=True, random_state=42
    )

    model = RandomForestClassifier(
        n_estimators=500,
        class_weight={
            "Low": 1,
            "Medium": 3,
            "High": 10,
        },
        random_state=42,
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    report = classification_report(y_test, y_pred, output_dict=True)

    return model, report, engineered_df


def save_model(model, report, model_path=MODEL_PATH):
    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "classification_report": report,
        "training_data": str(TRAINING_DATA_PATH),
        "target": "next_day_risk_level",
    }
    joblib.dump(artifact, model_path)
    return model_path


def train_and_save_model(data_path=TRAINING_DATA_PATH, model_path=MODEL_PATH):
    model, report, engineered_df = train_model(data_path)
    saved_path = save_model(model, report, model_path)
    sample = engineered_df.iloc[-1]
    prediction = model.predict(pd.DataFrame([sample[FEATURE_COLUMNS]]))[0]

    print("\n" + "=" * 50)
    print("MODEL PERFORMANCE SUMMARY")
    print("=" * 50)
    print(f"Accuracy: {report['accuracy']:.2f}")
    print(f"Macro F1 Score: {report['macro avg']['f1-score']:.2f}")
    print("\nHigh-Risk Detection:")
    print(f"   Precision: {report['High']['precision']:.2f}")
    print(f"   Recall:    {report['High']['recall']:.2f}")
    print(f"   F1 Score:  {report['High']['f1-score']:.2f}")
    print("\nNEXT-DAY PREDICTION")
    print(f"Predicted Risk Level : {prediction}")
    print("\nEXPLANATION")
    print(explain_features(sample))
    print(f"\nSaved model artifact: {saved_path}")
    print("=" * 50)

    return saved_path


if __name__ == "__main__":
    train_and_save_model()
