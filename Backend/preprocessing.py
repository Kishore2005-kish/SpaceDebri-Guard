from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
PROCESSED_DIR = BASE_DIR / "data" / "processed"
TRAINING_DATA_PATH = PROCESSED_DIR / "final_with_kp_sw.csv"

BASE_COLUMNS = ["date", "proton_flux", "xray_flux", "risk_level", "kp_index", "bz", "sw_speed"]
NUMERIC_COLUMNS = ["proton_flux", "xray_flux", "kp_index", "bz", "sw_speed"]


def load_training_data(path=TRAINING_DATA_PATH):
    return pd.read_csv(path)


def preprocess_space_weather_frame(df):
    processed = df.copy()

    if "date" in processed.columns:
        processed["date"] = pd.to_datetime(processed["date"], errors="coerce")

    for column in NUMERIC_COLUMNS:
        if column in processed.columns:
            processed[column] = pd.to_numeric(processed[column], errors="coerce")

    sort_columns = [column for column in ["date"] if column in processed.columns]
    if sort_columns:
        processed = processed.sort_values(sort_columns).reset_index(drop=True)

    return processed


def live_reading_to_frame(reading):
    return pd.DataFrame(
        [
            {
                "date": reading.get("date", pd.Timestamp.utcnow().isoformat()),
                "proton_flux": reading["proton_flux"],
                "xray_flux": reading["xray_flux"],
                "risk_level": None,
                "kp_index": reading["kp_index"],
                "bz": reading["bz"],
                "sw_speed": reading.get("sw_speed"),
            }
        ]
    )
