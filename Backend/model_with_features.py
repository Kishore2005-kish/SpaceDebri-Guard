import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report


df = pd.read_csv("data/processed/final_space_weather_labeled.csv")



# Lag features (previous days)
df["proton_lag1"] = df["proton_flux"].shift(1)
df["proton_lag2"] = df["proton_flux"].shift(2)

# Rolling averages
df["proton_roll3"] = df["proton_flux"].rolling(window=3).mean()
df["proton_roll7"] = df["proton_flux"].rolling(window=7).mean()

# Drop NaN rows (due to lag)
df = df.dropna()


X = df[[
    "proton_flux",
    "proton_lag1",
    "proton_lag2",
    "proton_roll3",
    "proton_roll7"
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