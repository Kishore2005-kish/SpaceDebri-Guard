import pandas as pd
import matplotlib.pyplot as plt


df = pd.read_csv("data/processed/final_space_weather.csv")

df["date"] = pd.to_datetime(df["date"])


def get_risk(row):
    if row["xray_flux"] >= 1e-5:   # M/X class
        return "High"
    elif row["xray_flux"] >= 1e-6: # C class
        return "Medium"
    else:
        return "Low"

df["risk_level"] = df.apply(get_risk, axis=1)

# Save labeled dataset
df.to_csv("data/processed/final_space_weather_labeled.csv", index=False)


print("✅ Dataset Loaded")
print("Total rows:", len(df))


print("\n📊 Risk Distribution:")
print(df["risk_level"].value_counts())


print("\n📈 Data Summary:")
print(df.describe())


print("\n🔥 X-ray min/max:")
print("Min:", df["xray_flux"].min())
print("Max:", df["xray_flux"].max())


plt.figure()
plt.plot(df["date"], df["xray_flux"])
plt.title("X-ray Flux Over Time")
plt.xlabel("Date")
plt.ylabel("X-ray Flux")
plt.show()