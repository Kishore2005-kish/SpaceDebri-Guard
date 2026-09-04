import pandas as pd

# Load dataset
df = pd.read_csv("data/processed/final_dataset.csv")


df["speed_norm"] = df["speed"] / df["speed"].max()
df["proton_norm"] = df["proton_flux"] / df["proton_flux"].max()
df["xray_norm"] = df["xray_flux"] / df["xray_flux"].max()


df["risk_score"] = (
    0.4 * df["speed_norm"] +
    0.4 * df["proton_norm"] +
    0.2 * df["xray_norm"]
) * 100

df["risk_score"] = df["risk_score"].round(2)


def get_risk_level(score):
    if score < 30:
        return "Low"
    elif score < 70:
        return "Medium"
    else:
        return "High"

df["risk_level"] = df["risk_score"].apply(get_risk_level)


def get_explanation(row):
    contributions = {
        "Solar Wind": row["speed_norm"] * 0.4,
        "Proton Flux": row["proton_norm"] * 0.4,
        "X-ray Flux": row["xray_norm"] * 0.2
    }

    # Sort by contribution
    sorted_factors = sorted(contributions.items(), key=lambda x: x[1], reverse=True)

    top_2 = sorted_factors[:2]

    explanations = []

    for factor, value in top_2:
        percent = round(value * 100, 1)

        if factor == "Solar Wind":
            explanations.append(f"Solar wind impact ({percent}%) increasing satellite drag")
        elif factor == "Proton Flux":
            explanations.append(f"Proton flux impact ({percent}%) causing radiation risk")
        elif factor == "X-ray Flux":
            explanations.append(f"X-ray flux impact ({percent}%) affecting communication")

    return " | ".join(explanations)

df["explanation"] = df.apply(get_explanation, axis=1)


df.to_csv("data/processed/final_with_risk.csv", index=False)

print("✅ Final dataset with risk + explanation ready")
print(df[["date", "risk_score", "risk_level", "explanation"]].head())