import pandas as pd

def clean_proton(file_path, output_path):
    data = []

    with open(file_path, "r") as f:
        for line in f:
            if line.startswith("#") or line.strip() == "":
                continue

            parts = line.split()

            if len(parts) < 6:
                continue

            try:
                year, month, day = parts[0], parts[1], parts[2]
                date = f"{year}-{month}-{day}"

                proton_flux = float(parts[4])

                if proton_flux <= 0:
                    continue

                data.append([date, proton_flux])

            except:
                continue

    df = pd.DataFrame(data, columns=["date", "proton_flux"])
    df["date"] = pd.to_datetime(df["date"])

    df.to_csv(output_path, index=False)

    print(f"✅ Cleaned {file_path}")