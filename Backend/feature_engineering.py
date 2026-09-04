import pandas as pd


FEATURE_COLUMNS = [
    "proton_flux",
    "proton_lag1",
    "proton_lag2",
    "proton_roll3",
    "proton_roll7",
    "proton_trend",
    "proton_spike",
    "xray_lag1",
    "xray_lag2",
    "xray_roll3",
    "xray_roll7",
    "xray_trend",
    "xray_spike",
    "kp_index",
    "kp_lag1",
    "kp_lag2",
    "kp_roll3",
    "kp_trend",
    "bz",
    "bz_lag1",
]

TARGET_COLUMN = "target_next_day"


def add_engineered_features(df):
    engineered = df.copy()

    engineered["proton_lag1"] = engineered["proton_flux"].shift(1)
    engineered["proton_lag2"] = engineered["proton_flux"].shift(2)
    engineered["proton_roll3"] = engineered["proton_flux"].rolling(3).mean()
    engineered["proton_roll7"] = engineered["proton_flux"].rolling(7).mean()

    engineered["xray_lag1"] = engineered["xray_flux"].shift(1)
    engineered["xray_lag2"] = engineered["xray_flux"].shift(2)
    engineered["xray_roll3"] = engineered["xray_flux"].rolling(3).mean()
    engineered["xray_roll7"] = engineered["xray_flux"].rolling(7).mean()

    engineered["kp_lag1"] = engineered["kp_index"].shift(1)
    engineered["kp_lag2"] = engineered["kp_index"].shift(2)
    engineered["kp_roll3"] = engineered["kp_index"].rolling(3).mean()

    engineered["bz_lag1"] = engineered["bz"].shift(1)

    engineered["xray_trend"] = engineered["xray_lag1"] - engineered["xray_lag2"]
    engineered["proton_trend"] = engineered["proton_lag1"] - engineered["proton_lag2"]
    engineered["kp_trend"] = engineered["kp_lag1"] - engineered["kp_lag2"]

    engineered["xray_spike"] = (engineered["xray_flux"] > engineered["xray_roll3"] * 1.3).astype(int)
    engineered["proton_spike"] = (engineered["proton_flux"] > engineered["proton_roll3"] * 1.3).astype(int)

    return engineered


def build_training_matrix(df):
    engineered = add_engineered_features(df)
    engineered[TARGET_COLUMN] = engineered["risk_level"].shift(-1)
    engineered = engineered.dropna(subset=FEATURE_COLUMNS + [TARGET_COLUMN])

    return engineered[FEATURE_COLUMNS], engineered[TARGET_COLUMN], engineered


def build_inference_matrix(historical_df, live_df):
    combined = add_engineered_features(pd.concat([historical_df.tail(10).copy(), live_df], ignore_index=True))
    inference_rows = combined.dropna(subset=FEATURE_COLUMNS)
    if inference_rows.empty:
        raise ValueError("Not enough historical data to build engineered inference features.")

    latest = inference_rows.iloc[[-1]]
    return latest[FEATURE_COLUMNS], latest.iloc[0]


def explain_features(row):
    reasons = []

    if row["xray_trend"] > 0:
        reasons.append("X-ray increasing")

    if row["proton_trend"] > 0:
        reasons.append("Proton rising")

    if row["kp_index"] > 4:
        reasons.append("Geomagnetic disturbance (High Kp)")

    if row["bz"] < 0:
        reasons.append("Southward magnetic field (Bz negative)")

    if row["xray_spike"] == 1:
        reasons.append("X-ray spike detected")

    if row["proton_spike"] == 1:
        reasons.append("Proton spike detected")

    if not reasons:
        reasons.append("Stable space weather")

    return " | ".join(reasons)
