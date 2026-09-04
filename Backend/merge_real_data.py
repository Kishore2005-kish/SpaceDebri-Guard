import pandas as pd

# Load cleaned datasets
proton = pd.read_csv("data/processed/proton_2020_clean.csv")
xray = pd.read_csv("data/processed/xray_2020_clean.csv")

# Convert date format
proton["date"] = pd.to_datetime(proton["date"])
xray["date"] = pd.to_datetime(xray["date"])

# Merge
df = pd.merge(proton, xray, on="date", how="inner")

# Save
df.to_csv("data/processed/space_weather_2020.csv", index=False)

print("✅ Merged dataset created")
print(df.head())