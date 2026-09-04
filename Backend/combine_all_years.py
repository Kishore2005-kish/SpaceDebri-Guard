import pandas as pd
import glob

# Load all proton files
proton_files = glob.glob("data/processed/proton_*_clean.csv")
proton_df = pd.concat([pd.read_csv(f) for f in proton_files], ignore_index=True)

# Load all xray files
xray_files = glob.glob("data/processed/xray_*_clean.csv")
xray_df = pd.concat([pd.read_csv(f) for f in xray_files], ignore_index=True)

# Convert dates
proton_df["date"] = pd.to_datetime(proton_df["date"])
xray_df["date"] = pd.to_datetime(xray_df["date"])

# Merge
df = pd.merge(proton_df, xray_df, on="date", how="inner")

# Clean
df = df.drop_duplicates()
df = df.sort_values("date")

# Save
df.to_csv("data/processed/final_space_weather.csv", index=False)

print("✅ Combined dataset ready")
print("Total rows:", len(df))
print(df.head())