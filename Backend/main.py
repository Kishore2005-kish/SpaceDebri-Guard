import requests
import pandas as pd
import os

# Create folder if not exists
os.makedirs("data/processed", exist_ok=True)

solar_url = "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json"
solar_data = requests.get(solar_url).json()

solar_columns = solar_data[0]
solar_rows = solar_data[1:]

df_solar = pd.DataFrame(solar_rows, columns=solar_columns)

df_solar["time_tag"] = pd.to_datetime(df_solar["time_tag"])
df_solar["density"] = pd.to_numeric(df_solar["density"], errors='coerce')
df_solar["speed"] = pd.to_numeric(df_solar["speed"], errors='coerce')
df_solar["temperature"] = pd.to_numeric(df_solar["temperature"], errors='coerce')

df_solar["date"] = df_solar["time_tag"].dt.date

solar_daily = df_solar.groupby("date")[["density", "speed", "temperature"]].mean().reset_index()

solar_daily.to_csv("data/processed/solar_wind_daily.csv", index=False)

print("✅ Solar wind done")


xray_url = "https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json"
xray_data = requests.get(xray_url).json()

df_xray = pd.DataFrame(xray_data)

df_xray["time_tag"] = pd.to_datetime(df_xray["time_tag"])
df_xray["flux"] = pd.to_numeric(df_xray["flux"], errors='coerce')

df_xray["date"] = df_xray["time_tag"].dt.date

xray_daily = df_xray.groupby("date")[["flux"]].mean().reset_index()
xray_daily.rename(columns={"flux": "xray_flux"}, inplace=True)

xray_daily.to_csv("data/processed/xray_daily.csv", index=False)

print("✅ X-ray done")



proton_url = "https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json"
proton_data = requests.get(proton_url).json()

df_proton = pd.DataFrame(proton_data)

df_proton["time_tag"] = pd.to_datetime(df_proton["time_tag"])
df_proton["flux"] = pd.to_numeric(df_proton["flux"], errors='coerce')

df_proton["date"] = df_proton["time_tag"].dt.date

proton_daily = df_proton.groupby("date")[["flux"]].mean().reset_index()
proton_daily.rename(columns={"flux": "proton_flux"}, inplace=True)

proton_daily.to_csv("data/processed/proton_daily.csv", index=False)

print("✅ Proton done")



print("🔥 All datasets created in data/processed/")