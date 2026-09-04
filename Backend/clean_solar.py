import pandas as pd

def convert_xray(value):
    try:
        value = value.strip()
        scale = value[0].upper()
        num = float(value[1:])

        mapping = {
            "A": 1e-8,
            "B": 1e-7,
            "C": 1e-6,
            "M": 1e-5,
            "X": 1e-4
        }

        return num * mapping.get(scale, 0)

    except:
        return None


def clean_solar(file_path, output_path):
    data = []

    with open(file_path, "r") as f:
        for line in f:
            if line.startswith("#") or line.strip() == "":
                continue

            parts = line.split()

            if len(parts) < 9:
                continue

            try:
                year, month, day = parts[0], parts[1], parts[2]
                date = f"{year}-{month}-{day}"

                xray_raw = parts[8]
                xray_flux = convert_xray(xray_raw)

                if xray_flux is None:
                    continue

                data.append([date, xray_flux])

            except:
                continue

    df = pd.DataFrame(data, columns=["date", "xray_flux"])
    df["date"] = pd.to_datetime(df["date"])

    df.to_csv(output_path, index=False)
    print(f"✅ Cleaned {file_path}")


# Example run
clean_solar("data/raw/2020_DSD.txt", "data/processed/xray_2020_clean.csv")