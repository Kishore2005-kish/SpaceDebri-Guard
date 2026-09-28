import os

years = range(2004, 2012)
def parse_dsd(year):
    dates = []
    filepath = f"Backend/data/raw/{year}_DSD.txt"
    try:
        with open(filepath, "r") as f:
            for line in f:
                if line.startswith("#") or line.strip() == "": continue
                parts = line.split()
                if len(parts) >= 9:
                    try:
                        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                        xray = parts[8]
                        if xray != "-999":
                            dates.append(f"{y}-{m:02d}-{d:02d}")
                    except:
                        pass
    except Exception as e:
        pass
    return set(dates)

def parse_dpd(year):
    dates = []
    filepath = f"Backend/data/raw/{year}_DPD.txt"
    try:
        with open(filepath, "r") as f:
            for line in f:
                if line.startswith("#") or line.strip() == "": continue
                parts = line.split()
                if len(parts) >= 6:
                    try:
                        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                        pf = float(parts[4])
                        if pf > 0 and pf != -99999.0:
                            dates.append(f"{y}-{m:02d}-{d:02d}")
                    except:
                        pass
    except:
        pass
    return set(dates)

def check_kp(years):
    kp_dates = set()
    with open("Backend/data/raw/kp_data.txt", "r") as f:
        for line in f:
            if line.startswith("#"): continue
            parts = line.split()
            if len(parts) < 15: continue
            try:
                y = int(parts[0])
                if y in years:
                    m = int(parts[1])
                    d = int(parts[2])
                    kp_dates.add(f"{y}-{m:02d}-{d:02d}")
            except:
                pass
    return kp_dates


print("\n5. COVERAGE TABLE")
kp_all = check_kp(years)
print(f"{'Year':<6} | {'DSD':<5} | {'DPD':<5} | {'Kp':<5} | {'Common'}")
for y in years:
    dsd = parse_dsd(y)
    dpd = parse_dpd(y)
    kp_y = set([d for d in kp_all if d.startswith(str(y))])
    common = dsd & dpd & kp_y
    print(f"{y:<6} | {len(dsd):<5} | {len(dpd):<5} | {len(kp_y):<5} | {len(common)}")
    
