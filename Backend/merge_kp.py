import pandas as pd

# ---------------------------
# LOAD DATA
# ---------------------------
df = pd.read_csv("data/processed/final_space_weather_labeled.csv")
kp = pd.read_csv("data/processed/kp_clean.csv")

# ---------------------------
# FORMAT DATE
# ---------------------------
df["date"] = pd.to_datetime(df["date"])
kp["date"] = pd.to_datetime(kp["date"])

# ---------------------------
# MERGE
# ---------------------------
merged = df.merge(kp, on="date", how="inner")

# ---------------------------
# SAVE
# ---------------------------
merged.to_csv("data/processed/final_with_kp.csv", index=False)

# ---------------------------
# CHECK
# ---------------------------
print("✅ Merge complete")
print("Shape:", merged.shape)
print(merged.head())