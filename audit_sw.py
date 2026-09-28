import pandas as pd

df = pd.read_csv("Backend/data/raw/solar_wind.csv", delim_whitespace=True, header=None)
df.columns = ["year", "doy", "hour", "bz", "sw_speed"]
df["date"] = pd.to_datetime(df["year"], format="%Y") + pd.to_timedelta(df["doy"] - 1, unit="D")

print("Columns:", df.columns.tolist())

print("\nYearly summary:")
print(f"{'Year':<6} | {'Rows':<7} | {'Min Date':<10} | {'Max Date':<10} | {'Days with hour 0':<16} | {'Missing hour 0'}")
for year in range(2000, 2021):
    sub = df[df["year"] == year]
    if sub.empty:
        print(f"{year:<6} | {0:<7} | {'-':<10} | {'-':<10} | {0:<16} | -")
        continue
    
    unique_dates = sub["date"].nunique()
    
    hour0 = sub[sub["hour"] == 0]
    has_hour0 = len(hour0)
    
    # Check if there are days without hour 0
    missing_hour0 = unique_dates - has_hour0
    
    print(f"{year:<6} | {len(sub):<7} | {str(sub['date'].min().date()):<10} | {str(sub['date'].max().date()):<10} | {has_hour0:<16} | {missing_hour0}")

print("\nData check 2004-2011:")
sub2 = df[(df["year"] >= 2004) & (df["year"] <= 2011)]
print("Total rows 2004-2011:", len(sub2))
if not sub2.empty:
    print("Bz exists:", sub2["bz"].notna().any())
    print("SW Speed exists:", sub2["sw_speed"].notna().any())
    print("Duplicates on date+hour:", sub2.duplicated(subset=["date", "hour"]).sum())
    print("\nSample 2004-2011 raw rows (hour=0):")
    hour0_sub = sub2[sub2["hour"] == 0]
    if not hour0_sub.empty:
        print(hour0_sub.head())
