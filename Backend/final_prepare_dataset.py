import pandas as pd



df = pd.read_csv("data/processed/final_space_weather.csv")

df["date"] = pd.to_datetime(df["date"])


# Remove invalid xray values (0 or negative)
df = df[df["xray_flux"] > 0]


def get_risk(row):
    if row["xray_flux"] >= 1e-6:   # C-class and above
        return "High"
    elif row["xray_flux"] >= 5e-7:
        return "Medium"
    else:
        return "Low"

df["risk_level"] = df.apply(get_risk, axis=1)


df.to_csv("data/processed/final_space_weather_labeled.csv", index=False)


print("✅ Final Dataset Ready")
print("Total rows:", len(df))

print("\n📊 Risk Distribution:")
print(df["risk_level"].value_counts())

print("\n🔥 X-ray Range:")
print("Min:", df["xray_flux"].min())
print("Max:", df["xray_flux"].max())

print("\n📈 Sample Data:")
print(df.head())