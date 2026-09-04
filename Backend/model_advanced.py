import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report


df = pd.read_csv("data/processed/final_space_weather_labeled.csv")



# Proton features
df["proton_lag1"] = df["proton_flux"].shift(1)
df["proton_lag2"] = df["proton_flux"].shift(2)
df["proton_roll3"] = df["proton_flux"].rolling(3).mean()

# 🔥 SAFE X-ray features (NO LEAKAGE)
df["xray_lag1"] = df["xray_flux"].shift(1)
df["xray_lag2"] = df["xray_flux"].shift(2)
df["xray_roll3"] = df["xray_flux"].rolling(3).mean()

# Drop NaN
df = df.dropna()


X = df[[
    "proton_flux",
    "proton_lag1",
    "proton_lag2",
    "proton_roll3",
    "xray_lag1",
    "xray_lag2",
    "xray_roll3"
]]

# Target
y = df["risk_level"]


X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    shuffle=True,
    random_state=42
)

model = RandomForestClassifier(
    n_estimators=300,
    class_weight="balanced",
    random_state=42
)

model.fit(X_train, y_train)


y_pred = model.predict(X_test)

print("📊 Classification Report:")
print(classification_report(y_test, y_pred))