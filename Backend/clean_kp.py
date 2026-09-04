import pandas as pd

file_path = "data/raw/kp_data.txt"  # your file name

rows = []

with open(file_path, "r") as f:
    for line in f:
        parts = line.split()

        # Skip header / invalid lines
        if len(parts) < 15:
            continue

        try:
            year = int(parts[0])
            month = int(parts[1])
            day = int(parts[2])

            # 🔥 Kp values are columns 7–14 (index 6–13)
            kp_values = list(map(float, parts[7:15]))

            # Daily average
            kp_daily = sum(kp_values) / len(kp_values)

            rows.append({
                "date": f"{year}-{month:02d}-{day:02d}",
                "kp_index": kp_daily
            })

        except:
            continue

# Convert to DataFrame
kp_df = pd.DataFrame(rows)

kp_df["date"] = pd.to_datetime(kp_df["date"])

# Save
kp_df.to_csv("data/processed/kp_clean.csv", index=False)

print("✅ Kp cleaned:", kp_df.shape)
print(kp_df.head())