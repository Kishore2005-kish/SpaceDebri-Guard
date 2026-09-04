"""
SpaceGuard AI — Unified Data Pipeline
======================================
Downloads NASA OMNIWeb solar wind + geomagnetic data (2000–2020),
merges with your existing processed CSVs, and outputs one clean
unified dataset ready for model retraining.

Run this on your Mac:
    pip install requests pandas numpy tqdm
    python spaceguard_data_pipeline.py

Output: spaceguard_unified_dataset.csv
"""

import os
import io
import time
import requests
import pandas as pd
import numpy as np
from tqdm import tqdm
from datetime import datetime

# ─────────────────────────────────────────────
# CONFIG — adjust these paths to match yours
# ─────────────────────────────────────────────

EXISTING_CSV_PATHS = [
    # Add your existing processed CSV file paths here
    # "data/processed/spaceguard_2000_2003.csv",
    # "data/processed/spaceguard_2012_2020.csv",
]

OUTPUT_PATH = "data/processed/spaceguard_unified_dataset.csv"
OMNI_CACHE_DIR = "data/raw/omni_cache"   # raw downloads cached here
YEAR_START = 2000
YEAR_END   = 2020


# ─────────────────────────────────────────────
# OMNI2 COLUMN MAP
# NASA OMNIWeb low-res daily data columns (positional)
# Full spec: https://omniweb.gsfc.nasa.gov/html/ow_data.html
# ─────────────────────────────────────────────

# We request these variable IDs from OMNIWeb:
# 23 = Kp index (x10, so divide by 10)
# 24 = R Sunspot Number
# 25 = Dst-index (nT)
# 26 = AE-index (nT)  
# 38 = Proton flux >10 MeV
# 39 = Proton flux >30 MeV
# 40 = Proton flux >60 MeV
# 17 = 1-hour averaged solar wind flow speed (km/s)
# 28 = Scalar B (nT)
# 8  = Bz GSM (nT) — the key negative Bz indicator
# 23 = proton density (n/cc)

OMNI_VARS = "23,24,25,38,17,28,8,24"   # Kp, sunspot, Dst, proton_flux>10, speed, |B|, Bz, density

# Column names after download (order matches vars above)
OMNI_COL_NAMES = [
    "year", "doy",           # always first two in daily OMNI
    "kp_index",              # var 23 (x10 — divide by 10 after)
    "sunspot_number",        # var 24
    "dst_index",             # var 25
    "proton_flux_10mev",     # var 38 (pfu)
    "solar_wind_speed",      # var 17 (km/s)
    "b_scalar",              # var 28 (nT)
    "bz_gsm",                # var 8  (nT) — negative = storm risk
    "proton_density",        # var 24 (n/cc)
]

# Fill values that OMNIWeb uses to indicate missing data
OMNI_FILL_VALUES = {
    "kp_index":           999.9,
    "sunspot_number":     999,
    "dst_index":          99999,
    "proton_flux_10mev":  9999999.0,
    "solar_wind_speed":   9999.0,
    "b_scalar":           999.9,
    "bz_gsm":             999.9,
    "proton_density":     999.9,
}


# ─────────────────────────────────────────────
# STEP 1: DOWNLOAD OMNI DATA YEAR BY YEAR
# ─────────────────────────────────────────────

def build_omni_url(year: int) -> str:
    """
    Build the OMNIWeb CGI URL for a full year of daily data.
    Uses the public form-based endpoint — no API key required.
    """
    base = "https://omniweb.gsfc.nasa.gov/cgi/nx1.cgi"
    params = {
        "activity": "retrieve",
        "res":       "daily",
        "spacecraft": "omni2",
        "start_date": f"{year}0101",
        "end_date":   f"{year}1231",
        "vars":       OMNI_VARS,
        "scale":      "Linear",
        "ymin":       "",
        "ymax":       "",
        "userdefined_vars": "",
        "back":        "",
    }
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"{base}?{query}"


def parse_omni_response(text: str) -> pd.DataFrame:
    """
    OMNIWeb returns data between <pre> tags, space-delimited.
    Extracts and parses it into a DataFrame.
    """
    # Extract content between <pre> tags
    start = text.find("<pre>")
    end   = text.find("</pre>")
    if start == -1 or end == -1:
        raise ValueError("No <pre> block found in OMNIWeb response — check URL or response format.")
    
    raw = text[start + 5 : end].strip()
    lines = [l.strip() for l in raw.splitlines() if l.strip() and not l.strip().startswith("YEAR")]
    
    rows = []
    for line in lines:
        parts = line.split()
        if len(parts) >= len(OMNI_COL_NAMES):
            rows.append(parts[:len(OMNI_COL_NAMES)])
    
    df = pd.DataFrame(rows, columns=OMNI_COL_NAMES)
    
    # Convert all to numeric
    for col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    
    # Build date from year + day-of-year
    df["date"] = pd.to_datetime(
        df["year"].astype(int).astype(str) + df["doy"].astype(int).astype(str).str.zfill(3),
        format="%Y%j"
    )
    
    return df.drop(columns=["year", "doy"])


def replace_fill_values(df: pd.DataFrame) -> pd.DataFrame:
    """Replace OMNIWeb fill values (9999...) with NaN."""
    for col, fill in OMNI_FILL_VALUES.items():
        if col in df.columns:
            df[col] = df[col].where(df[col] < fill * 0.99, other=np.nan)
    return df


def download_omni_year(year: int, session: requests.Session) -> pd.DataFrame:
    """Download one year of OMNI daily data, with local caching."""
    os.makedirs(OMNI_CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(OMNI_CACHE_DIR, f"omni_{year}.csv")
    
    # Use cached file if it exists
    if os.path.exists(cache_file):
        return pd.read_csv(cache_file, parse_dates=["date"])
    
    url = build_omni_url(year)
    headers = {"User-Agent": "SpaceGuardAI/1.0 (research project; contact kishkeerthi24@gmail.com)"}
    
    try:
        resp = session.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        df = parse_omni_response(resp.text)
        df = replace_fill_values(df)
        
        # Fix Kp: OMNIWeb stores it as integer x10
        if "kp_index" in df.columns:
            df["kp_index"] = df["kp_index"] / 10.0
        
        df.to_csv(cache_file, index=False)
        time.sleep(1.5)  # be polite to NASA servers
        return df
        
    except requests.HTTPError as e:
        print(f"  ⚠ HTTP error for {year}: {e}")
        return pd.DataFrame()
    except Exception as e:
        print(f"  ⚠ Failed to parse {year}: {e}")
        return pd.DataFrame()


def download_all_omni(year_start: int, year_end: int) -> pd.DataFrame:
    """Download all years and concatenate."""
    print(f"\n📡 Downloading NASA OMNIWeb daily data ({year_start}–{year_end})...")
    print("   (Already-downloaded years load from cache — safe to re-run)\n")
    
    all_frames = []
    session = requests.Session()
    
    for year in tqdm(range(year_start, year_end + 1), desc="Years"):
        df = download_omni_year(year, session)
        if not df.empty:
            all_frames.append(df)
    
    if not all_frames:
        raise RuntimeError("No OMNI data downloaded. Check your internet connection.")
    
    combined = pd.concat(all_frames, ignore_index=True)
    combined = combined.sort_values("date").reset_index(drop=True)
    print(f"\n✅ OMNI data loaded: {len(combined):,} daily records ({combined['date'].min().date()} → {combined['date'].max().date()})")
    return combined


# ─────────────────────────────────────────────
# STEP 2: LOAD & NORMALIZE YOUR EXISTING DATA
# ─────────────────────────────────────────────

def detect_schema(df: pd.DataFrame) -> str:
    """Detect which of your three schemas this CSV is."""
    cols = set(df.columns)
    if "density" in cols and "speed" in cols:
        return "live"       # Schema 2 — live prediction output
    elif "kp_index" in cols:
        return "historical_kp"   # Schema 3
    else:
        return "historical_simple"  # Schema 1


def normalize_existing_csv(path: str) -> pd.DataFrame:
    """
    Load one of your existing CSVs and normalize it to a common schema:
        date, proton_flux, xray_flux, kp_index, risk_level
    """
    df = pd.read_csv(path, parse_dates=["date"])
    schema = detect_schema(df)
    print(f"  {os.path.basename(path)} → schema: {schema}")
    
    # Rename inconsistently-named columns
    rename_map = {}
    if "solar_wind_speed" not in df.columns and "speed" in df.columns:
        rename_map["speed"] = "solar_wind_speed"
    if "proton_density" not in df.columns and "density" in df.columns:
        rename_map["density"] = "proton_density"
    df = df.rename(columns=rename_map)
    
    # For live schema — proton_flux might be normalized (0–10 range)
    # Detect and flag for merging (don't rescale — OMNI will provide raw values)
    if schema == "live" and "proton_flux" in df.columns:
        if df["proton_flux"].max() < 100:
            print(f"    ⚠ proton_flux appears normalized (max={df['proton_flux'].max():.2f}) — "
                  "will use OMNI raw values instead for training.")
            df = df.drop(columns=["proton_flux"])

    # Drop columns we don't need for training
    drop_cols = [c for c in ["risk_score", "explanation", "speed_norm",
                              "proton_norm", "xray_norm"] if c in df.columns]
    df = df.drop(columns=drop_cols, errors="ignore")
    
    return df


def load_existing_data(paths: list) -> pd.DataFrame:
    """Load all your existing CSVs and merge into one frame."""
    if not paths:
        print("\nℹ No existing CSVs configured — will build purely from OMNI data.")
        return pd.DataFrame()
    
    print(f"\n📂 Loading {len(paths)} existing CSV(s)...")
    frames = []
    for path in paths:
        if not os.path.exists(path):
            print(f"  ⚠ Not found: {path} — skipping")
            continue
        df = normalize_existing_csv(path)
        frames.append(df)
    
    if not frames:
        return pd.DataFrame()
    
    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["date"]).sort_values("date").reset_index(drop=True)
    print(f"✅ Existing data loaded: {len(combined):,} records")
    return combined


# ─────────────────────────────────────────────
# STEP 3: MERGE OMNI + EXISTING DATA
# ─────────────────────────────────────────────

def merge_datasets(omni_df: pd.DataFrame, existing_df: pd.DataFrame) -> pd.DataFrame:
    """
    Left-join OMNI data (authoritative for space weather params)
    with your existing labels (risk_level) where available.
    OMNI values take priority for numeric features.
    """
    print("\n🔀 Merging datasets...")
    
    # Ensure date columns are datetime
    omni_df["date"] = pd.to_datetime(omni_df["date"])
    
    if existing_df.empty:
        print("  Building from OMNI only — risk labels will be generated from thresholds.")
        return omni_df
    
    existing_df["date"] = pd.to_datetime(existing_df["date"])
    
    # Merge: OMNI as base, bring in existing risk_level and xray_flux where available
    existing_slim = existing_df[
        [c for c in ["date", "risk_level", "xray_flux"] if c in existing_df.columns]
    ]
    
    merged = omni_df.merge(existing_slim, on="date", how="left")
    
    matched = merged["risk_level"].notna().sum()
    print(f"  ✅ Matched {matched:,} dates with existing risk labels")
    print(f"  ℹ {merged['risk_level'].isna().sum():,} dates will get threshold-derived labels")
    
    return merged


# ─────────────────────────────────────────────
# STEP 4: GENERATE RISK LABELS (for unlabelled rows)
# ─────────────────────────────────────────────

def classify_risk(row: pd.Series) -> str:
    """
    Rule-based risk classification matching your existing labeling logic.
    Used only for rows that don't have an existing label.
    
    Based on established NOAA space weather scales:
    https://www.swpc.noaa.gov/noaa-scales-explanation
    """
    score = 0
    
    # Kp Index (geomagnetic storm)
    kp = row.get("kp_index", np.nan)
    if pd.notna(kp):
        if kp >= 7:    score += 40   # Severe storm
        elif kp >= 5:  score += 25   # Geomagnetic storm
        elif kp >= 3:  score += 10   # Unsettled
    
    # Bz GSM (negative = energy coupling into magnetosphere)
    bz = row.get("bz_gsm", np.nan)
    if pd.notna(bz):
        if bz <= -20:  score += 35   # Extreme southward
        elif bz <= -10: score += 20  # Strong southward
        elif bz <= -5:  score += 10  # Moderate southward
    
    # Proton Flux >10 MeV (radiation storm)
    pf = row.get("proton_flux_10mev", np.nan)
    if pd.notna(pf):
        if pf >= 10000:  score += 40   # S4-S5 radiation storm
        elif pf >= 1000: score += 30   # S3
        elif pf >= 100:  score += 20   # S2
        elif pf >= 10:   score += 10   # S1
    
    # Solar wind speed (increased drag risk)
    speed = row.get("solar_wind_speed", np.nan)
    if pd.notna(speed):
        if speed >= 700:   score += 20
        elif speed >= 600: score += 12
        elif speed >= 500: score += 5
    
    # X-ray flux (if present from existing data)
    xray = row.get("xray_flux", np.nan)
    if pd.notna(xray):
        if xray >= 1e-4:   score += 40   # X-class
        elif xray >= 1e-5: score += 25   # M-class
        elif xray >= 1e-6: score += 10   # C-class
    
    # Classify
    if score >= 55:   return "High"
    elif score >= 25: return "Medium"
    else:             return "Low"


def apply_risk_labels(df: pd.DataFrame) -> pd.DataFrame:
    """Fill missing risk labels using threshold classification."""
    mask = df["risk_level"].isna()
    if mask.sum() > 0:
        print(f"  Generating labels for {mask.sum():,} unlabelled rows...")
        df.loc[mask, "risk_level"] = df[mask].apply(classify_risk, axis=1)
    return df


# ─────────────────────────────────────────────
# STEP 5: FEATURE ENGINEERING
# ─────────────────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add lag, trend, and rolling average features.
    These are the features your model was already trained on —
    now extended to all 6 space weather parameters.
    """
    print("\n⚙️  Engineering features...")
    df = df.sort_values("date").reset_index(drop=True)
    
    feature_cols = [
        "kp_index", "bz_gsm", "proton_flux_10mev",
        "solar_wind_speed", "proton_density", "xray_flux"
    ]
    feature_cols = [c for c in feature_cols if c in df.columns]
    
    for col in feature_cols:
        # Lag features (previous 1, 2, 3 days)
        for lag in [1, 2, 3]:
            df[f"{col}_lag{lag}"] = df[col].shift(lag)
        
        # Trend feature (today vs yesterday)
        df[f"{col}_trend"] = df[col] - df[col].shift(1)
        
        # Rolling averages (3-day and 7-day)
        df[f"{col}_roll3"] = df[col].shift(1).rolling(window=3).mean()
        df[f"{col}_roll7"] = df[col].shift(1).rolling(window=7).mean()
    
    # Drop first 7 rows (insufficient history for rolling features)
    df = df.iloc[7:].reset_index(drop=True)
    
    print(f"  ✅ Feature engineering complete — {len(df.columns)} total columns")
    return df


# ─────────────────────────────────────────────
# STEP 6: FINAL CLEANUP & SAVE
# ─────────────────────────────────────────────

def final_cleanup(df: pd.DataFrame) -> pd.DataFrame:
    """Drop rows with too many NaNs, validate labels, report stats."""
    print("\n🧹 Final cleanup...")
    
    before = len(df)
    
    # Drop rows where core features are all missing
    core_cols = ["kp_index", "bz_gsm", "proton_flux_10mev", "solar_wind_speed"]
    core_cols = [c for c in core_cols if c in df.columns]
    df = df.dropna(subset=core_cols, how="all")
    
    # Validate risk labels
    valid_labels = {"Low", "Medium", "High"}
    df = df[df["risk_level"].isin(valid_labels)]
    
    after = len(df)
    print(f"  Dropped {before - after:,} rows (missing core features or invalid labels)")
    
    return df


def print_dataset_summary(df: pd.DataFrame):
    """Print a summary of the final dataset."""
    print("\n" + "="*55)
    print("📊 FINAL DATASET SUMMARY")
    print("="*55)
    print(f"  Total records:   {len(df):,}")
    print(f"  Date range:      {df['date'].min().date()} → {df['date'].max().date()}")
    print(f"  Total features:  {len(df.columns) - 2}")  # minus date + risk_level
    print()
    
    # Class distribution
    dist = df["risk_level"].value_counts()
    total = len(df)
    print("  Risk Label Distribution:")
    for label in ["Low", "Medium", "High"]:
        n = dist.get(label, 0)
        pct = 100 * n / total
        bar = "█" * int(pct / 2)
        print(f"    {label:8s} {n:5,}  ({pct:4.1f}%)  {bar}")
    
    print()
    print("  Missing values per feature:")
    missing = df.isnull().sum()
    missing = missing[missing > 0].sort_values(ascending=False)
    for col, n in missing.items():
        if col not in ["date", "risk_level"]:
            print(f"    {col:<35} {n:5,}  ({100*n/len(df):.1f}%)")
    
    if missing.empty:
        print("    None — dataset is clean ✅")
    
    print("="*55)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════╗")
    print("║    SpaceGuard AI — Unified Data Pipeline     ║")
    print("╚══════════════════════════════════════════════╝")
    
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    
    # 1. Download OMNI data
    omni_df = download_all_omni(YEAR_START, YEAR_END)
    
    # 2. Load your existing CSVs
    existing_df = load_existing_data(EXISTING_CSV_PATHS)
    
    # 3. Merge
    merged = merge_datasets(omni_df, existing_df)
    
    # 4. Apply risk labels to unlabelled rows
    if "risk_level" not in merged.columns:
        merged["risk_level"] = np.nan
    merged = apply_risk_labels(merged)
    
    # 5. Feature engineering
    merged = engineer_features(merged)
    
    # 6. Final cleanup
    merged = final_cleanup(merged)
    
    # 7. Print summary
    print_dataset_summary(merged)
    
    # 8. Save
    merged.to_csv(OUTPUT_PATH, index=False)
    print(f"\n💾 Saved → {OUTPUT_PATH}")
    print("\nNext steps:")
    print("  1. Run your model_next_day_final.py with this new dataset")
    print("  2. Use class_weight='balanced' in RandomForestClassifier")
    print("  3. Use chronological train/test split (not random k-fold)")
    print("  4. Compare High Risk recall before vs after")


if __name__ == "__main__":
    main()