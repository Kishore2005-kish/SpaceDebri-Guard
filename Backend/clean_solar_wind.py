import pandas as pd

# Load raw file (space-separated)
df = pd.read_csv(
    "data/raw/solar_wind.csv",
    delim_whitespace=True,
    header=None
)

# Assign column names
df.columns = ["year", "doy", "hour", "bz", "sw_speed"]

# ---------------------------
# CONVERT TO DATE
# ---------------------------
df["date"] = pd.to_datetime(df["year"], format="%Y") + pd.to_timedelta(df["doy"] - 1, unit="D")

# ---------------------------
# KEEP ONLY DAILY (hour = 0)
# ---------------------------
df = df[df["hour"] == 0]

# ---------------------------
# SELECT REQUIRED COLUMNS
# ---------------------------
df = df[["date", "bz", "sw_speed"]]

# ---------------------------
# SAVE CLEAN DATA
# ---------------------------
df.to_csv("data/processed/solar_wind_clean.csv", index=False)

print("✅ Cleaned solar wind:", df.shape)
print(df.head())