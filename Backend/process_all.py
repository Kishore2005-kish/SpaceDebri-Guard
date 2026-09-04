import os
from clean_proton import clean_proton
from clean_solar import clean_solar

raw_folder = "data/raw"
processed_folder = "data/processed"

for file in os.listdir(raw_folder):
    path = os.path.join(raw_folder, file)

    if file.endswith("_DPD.txt"):
        year = file.split("_")[0]
        output = f"{processed_folder}/proton_{year}_clean.csv"
        clean_proton(path, output)

    elif file.endswith("_DSD.txt"):
        year = file.split("_")[0]
        output = f"{processed_folder}/xray_{year}_clean.csv"
        clean_solar(path, output)