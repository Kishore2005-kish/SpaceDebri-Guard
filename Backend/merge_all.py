import pandas as pd

df = pd.read_csv("data/processed/final_with_kp.csv")
sw = pd.read_csv("data/processed/solar_wind_clean.csv")

df["date"] = pd.to_datetime(df["date"])
sw["date"] = pd.to_datetime(sw["date"])

# Merge
df = df.merge(sw, on="date", how="inner")

df.to_csv("data/processed/final_with_kp_sw.csv", index=False)

print("✅ Final merged:", df.shape)
print(df.head())