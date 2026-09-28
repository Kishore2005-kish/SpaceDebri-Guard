from pathlib import Path
import json
import subprocess

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd

try:
    from .feature_engineering import FEATURE_COLUMNS, build_inference_matrix, explain_features
    from .preprocessing import (
        TRAINING_DATA_PATH,
        live_reading_to_frame,
        load_training_data,
        preprocess_space_weather_frame,
    )
except ImportError:
    from feature_engineering import FEATURE_COLUMNS, build_inference_matrix, explain_features
    from preprocessing import (
        TRAINING_DATA_PATH,
        live_reading_to_frame,
        load_training_data,
        preprocess_space_weather_frame,
    )


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"
NOAA_ENDPOINTS = {
    "xrays": "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
    "protons": "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json",
    "kp": "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    "mag": "https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json",
    "wind": "https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json",
}


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_model_artifact(model_path=MODEL_PATH):
    if not model_path.exists():
        raise FileNotFoundError(
            f"Model artifact not found at {model_path}. "
            "Run `python3 -m Backend.model_next_day_final` before starting FastAPI."
        )

    artifact = joblib.load(model_path)
    missing_columns = [column for column in FEATURE_COLUMNS if column not in artifact["feature_columns"]]
    if missing_columns:
        raise ValueError(f"Model artifact is missing feature columns: {missing_columns}")

    return artifact


MODEL_ARTIFACT = load_model_artifact()
MODEL = MODEL_ARTIFACT["model"]
TRAINING_HISTORY = preprocess_space_weather_frame(load_training_data(TRAINING_DATA_PATH))


def fetch_json(url):
    output = subprocess.check_output(
        ["curl", "-fsSL", "--max-time", "10", "-A", "SpaceGuard-ai/1.0", url],
        text=True,
    )
    return json.loads(output)


def latest_record(records, predicate=lambda item: True):
    matches = [item for item in records if predicate(item)]
    if not matches:
        return {}
    return max(matches, key=lambda item: item.get("time_tag", ""))


def xray_class(flux):
    if flux >= 1e-4:
        return f"X{flux / 1e-4:.1f}"
    if flux >= 1e-5:
        return f"M{flux / 1e-5:.1f}"
    if flux >= 1e-6:
        return f"C{flux / 1e-6:.1f}"
    if flux >= 1e-7:
        return f"B{flux / 1e-7:.1f}"
    return f"A{max(flux / 1e-8, 0):.1f}"


def xray_status(value):
    if value >= 1e-4:
        return "critical"
    if value >= 1e-6:
        return "warning"
    return "nominal"


def proton_status(value):
    if value >= 100:
        return "critical"
    if value >= 10:
        return "warning"
    return "nominal"


def kp_status(value):
    if value >= 7:
        return "critical"
    if value >= 5:
        return "warning"
    return "nominal"


def normalize_level(level):
    return str(level).upper()


def status_for_risk_level(risk_level):
    level = normalize_level(risk_level)
    if level == "HIGH":
        return "CRITICAL"
    if level == "MEDIUM":
        return "WARNING"
    return "NORMAL"


def latest_live_reading():
    xrays = fetch_json(NOAA_ENDPOINTS["xrays"])
    protons = fetch_json(NOAA_ENDPOINTS["protons"])
    kp = fetch_json(NOAA_ENDPOINTS["kp"])
    mag = fetch_json(NOAA_ENDPOINTS["mag"])
    wind = fetch_json(NOAA_ENDPOINTS["wind"])

    xray = latest_record(
        xrays,
        lambda item: item.get("energy") == "0.1-0.8nm" and item.get("flux") is not None,
    )
    proton = latest_record(
        protons,
        lambda item: item.get("energy") == ">=10 MeV" and item.get("flux") is not None,
    )
    kp_record = latest_record(kp, lambda item: item.get("estimated_kp") is not None)
    mag_record = latest_record(
        mag,
        lambda item: item.get("active") is True and item.get("bz_gsm") is not None,
    )
    wind_record = latest_record(
        wind,
        lambda item: item.get("active") is True
        and item.get("proton_speed") is not None
        and item.get("proton_density") is not None
        and item.get("proton_temperature") is not None,
    )

    return {
        "date": xray.get("time_tag") or wind_record.get("time_tag") or pd.Timestamp.utcnow().isoformat(),
        "proton_flux": float(proton.get("flux")),
        "xray_flux": float(xray.get("flux")),
        "kp_index": float(kp_record.get("estimated_kp") or kp_record.get("kp_index")),
        "bz": float(mag_record.get("bz_gsm")),
        "sw_speed": float(wind_record.get("proton_speed")),
        "density": float(wind_record.get("proton_density")),
        "temperature": float(wind_record.get("proton_temperature")),
        "bt": float(mag_record.get("bt") or 0),
        "source": mag_record.get("source"),
        "times": {
            "xray": xray.get("time_tag"),
            "proton": proton.get("time_tag"),
            "kp": kp_record.get("time_tag"),
            "mag": mag_record.get("time_tag"),
            "wind": wind_record.get("time_tag"),
        },
    }


def weather_payload(reading):
    bz_value = reading["bz"]
    kp_value = reading["kp_index"]
    xray_flux = reading["xray_flux"]
    proton_flux = reading["proton_flux"]

    return {
        "xrayFlux": {
            "value": xray_class(xray_flux),
            "status": xray_status(xray_flux),
            "raw": xray_flux,
            "time": reading["times"]["xray"],
        },
        "protonFlux": {
            "value": f"{proton_flux:.2f} pfu",
            "status": proton_status(proton_flux),
            "raw": proton_flux,
            "time": reading["times"]["proton"],
        },
        "kpIndex": {
            "value": f"{kp_value:.2f}",
            "status": kp_status(kp_value),
            "raw": kp_value,
            "time": reading["times"]["kp"],
        },
        "solarWindBz": {
            "value": f"{bz_value:+.2f} nT",
            "status": "critical" if bz_value <= -15 else "warning" if bz_value < 0 else "nominal",
            "raw": bz_value,
            "time": reading["times"]["mag"],
            "source": reading["source"],
        },
        "windSpeed": f"{reading['sw_speed']:.0f} km/s",
        "density": f"{reading['density']:.2f} p/cm3",
        "temperature": f"{reading['temperature']:.2e} K",
        "sunspots": int(max(0, round(kp_value * 18))),
        "magneticFieldStrength": f"{reading['bt']:.2f} nT",
    }


def predict_from_features(features):
    predicted_level = MODEL.predict(features)[0]
    probabilities = MODEL.predict_proba(features)[0]
    class_probabilities = {
        normalize_level(class_name): round(float(probability) * 100, 2)
        for class_name, probability in zip(MODEL.classes_, probabilities)
    }
    confidence = class_probabilities[normalize_level(predicted_level)]

    return normalize_level(predicted_level), confidence, class_probabilities


def override_manual_features(features, feature_row, data):
    enriched = features.copy()
    enriched_row = feature_row.copy()

    for column in FEATURE_COLUMNS:
        if column in data and data[column] is not None:
            enriched.at[enriched.index[0], column] = float(data[column])
            enriched_row[column] = float(data[column])

    if "xray_lag1" in data and "xray_lag2" in data:
        enriched.at[enriched.index[0], "xray_trend"] = float(data["xray_lag1"]) - float(data["xray_lag2"])
        enriched_row["xray_trend"] = float(data["xray_lag1"]) - float(data["xray_lag2"])

    if "proton_lag1" in data and "proton_lag2" in data:
        enriched.at[enriched.index[0], "proton_trend"] = float(data["proton_lag1"]) - float(data["proton_lag2"])
        enriched_row["proton_trend"] = float(data["proton_lag1"]) - float(data["proton_lag2"])

    if "kp_lag1" in data and "kp_lag2" in data:
        enriched.at[enriched.index[0], "kp_trend"] = float(data["kp_lag1"]) - float(data["kp_lag2"])
        enriched_row["kp_trend"] = float(data["kp_lag1"]) - float(data["kp_lag2"])

    if "xray_flux" in data and "xray_roll3" in data:
        spike = int(float(data["xray_flux"]) > float(data["xray_roll3"]) * 1.3)
        enriched.at[enriched.index[0], "xray_spike"] = spike
        enriched_row["xray_spike"] = spike

    if "proton_flux" in data and "proton_roll3" in data:
        spike = int(float(data["proton_flux"]) > float(data["proton_roll3"]) * 1.3)
        enriched.at[enriched.index[0], "proton_spike"] = spike
        enriched_row["proton_spike"] = spike

    return enriched[FEATURE_COLUMNS], enriched_row


def build_live_prediction():
    reading = latest_live_reading()
    live_df = preprocess_space_weather_frame(live_reading_to_frame(reading))
    features, feature_row = build_inference_matrix(TRAINING_HISTORY, live_df)
    risk_level, confidence, class_probabilities = predict_from_features(features)

    return {
        "date": reading["date"],
        "risk_level": risk_level,
        "confidence": confidence,
        "class_probabilities": class_probabilities,
        "explanation": explain_features(feature_row),
        "weather": weather_payload(reading),
    }


def row_to_history(row):
    return {
        "date": row["date"].strftime("%Y-%m-%d") if hasattr(row["date"], "strftime") else row["date"],
        "risk": 0,
        "riskLabel": normalize_level(row["risk_level"]),
        "confidence": 0,
    }


def model_history():
    processed = preprocess_space_weather_frame(load_training_data(TRAINING_DATA_PATH))
    rows = processed.tail(30)
    history = []

    for _, row in rows.iterrows():
        live_df = pd.DataFrame([row])
        try:
            features, _ = build_inference_matrix(processed.loc[: row.name - 1], live_df)
            risk_level, confidence, _ = predict_from_features(features)
            probabilities = MODEL.predict_proba(features)[0]
            probability_map = {
                normalize_level(class_name): float(probability)
                for class_name, probability in zip(MODEL.classes_, probabilities)
            }
            severity = (
                probability_map.get("HIGH", 0) * 100
                + probability_map.get("MEDIUM", 0) * 50
            )
            history.append(
                {
                    "date": row["date"].strftime("%Y-%m-%d"),
                    "risk": round(severity),
                    "riskLabel": risk_level,
                    "confidence": round(confidence),
                }
            )
        except Exception:
            history.append(row_to_history(row))

    return history


def alerts_for_prediction(date, risk_level, confidence, explanation):
    if risk_level == "LOW":
        return []

    alert_type = "CRITICAL" if risk_level == "HIGH" else "WARNING"
    return [
        {
            "id": f"{date}-risk",
            "type": alert_type,
            "time": f"{date} UTC",
            "message": f"{risk_level} next-day space weather risk predicted with {confidence}% confidence. {explanation}",
        }
    ]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_file": str(MODEL_PATH),
        "training_data": str(TRAINING_DATA_PATH),
        "feature_columns": FEATURE_COLUMNS,
    }


@app.get("/current")
def current():
    prediction = build_live_prediction()
    risk_level = prediction["risk_level"]
    confidence = prediction["confidence"]

    return {
        "date": prediction["date"],
        "name": "NOAA SWPC Live Feeds",
        "status": status_for_risk_level(risk_level),
        "tomorrowPrediction": f"{risk_level} ({confidence}% Confidence)",
        "noaaStatus": "ONLINE",
        "databaseStatus": "CONNECTED",
        "currentStatusText": f"{risk_level.title()} Risk Conditions",
        "prediction": {
            "risk_score": confidence,
            "risk_level": risk_level,
            "explanation": prediction["explanation"],
            "class_probabilities": prediction["class_probabilities"],
        },
        "weather": prediction["weather"],
        "alerts": alerts_for_prediction(
            prediction["date"], risk_level, confidence, prediction["explanation"]
        ),
    }


@app.get("/history")
def history():
    return model_history()


@app.get("/alerts")
def alerts():
    current_data = current()
    return current_data["alerts"]


@app.post("/predict")
def predict(data: dict):
    live_df = preprocess_space_weather_frame(live_reading_to_frame(data))
    features, feature_row = build_inference_matrix(TRAINING_HISTORY, live_df)
    features, feature_row = override_manual_features(features, feature_row, data)
    risk_level, confidence, class_probabilities = predict_from_features(features)

    return {
        "risk_score": confidence,
        "risk_level": risk_level,
        "explanation": explain_features(feature_row),
        "class_probabilities": class_probabilities,
    }
