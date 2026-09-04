import os
print("Current working directory:", os.getcwd())
import pandas as pd

# Load datasets
solar = pd.read_csv("data/processed/solar_wind_daily.csv")
xray = pd.read_csv("data/processed/xray_daily.csv")
proton = pd.read_csv("data/processed/proton_daily.csv")

# Merge step by step
df = pd.merge(solar, xray, on="date", how="inner")
df = pd.merge(df, proton, on="date", how="inner")

# Save final dataset
df.to_csv("data/processed/final_dataset.csv", index=False)

print("✅ Final dataset created")
print(df.head())