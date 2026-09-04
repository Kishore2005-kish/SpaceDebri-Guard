import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

# Load dataset
df = pd.read_csv("data/processed/final_space_weather_labeled.csv")

# Features
X = df[["proton_flux", "xray_flux"]]

# Target
y = df["risk_level"]

# Split (time-aware)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, shuffle=True, random_state=42
)

# Model with class balancing 🔥
model = RandomForestClassifier(
    n_estimators=200,
    class_weight="balanced",
    random_state=42
)

model.fit(X_train, y_train)

y_pred = model.predict(X_test)

print("📊 Classification Report:")
print(classification_report(y_test, y_pred))