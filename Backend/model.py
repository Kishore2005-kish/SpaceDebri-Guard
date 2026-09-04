import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score


df = pd.read_csv("data/processed/final_with_risk.csv")


X = df[["density", "speed", "temperature", "xray_flux", "proton_flux"]]


y = df["risk_level"]


X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestClassifier(n_estimators=100, random_state=42)

# Train
model.fit(X_train, y_train)

# Predict on test set
y_pred = model.predict(X_test)

# Accuracy
accuracy = accuracy_score(y_test, y_pred)

print("✅ Model trained")
print("Accuracy:", accuracy)


new_data = pd.DataFrame([{
    "density": 0.5,
    "speed": 500,
    "temperature": 60000,
    "xray_flux": 1.5e-6,
    "proton_flux": 3.0
}])

prediction = model.predict(new_data)

print("🚀 Predicted Risk Level for new data:", prediction[0])