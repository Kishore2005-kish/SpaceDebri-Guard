import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report


df = pd.read_csv("data/processed/final_space_weather_labeled.csv")


# Remove xray_flux because it's used to create labels
X = df[["proton_flux"]]

# Target
y = df["risk_level"]


X_train, X_test, y_train, y_test = train_test_split(
    X, y,
    test_size=0.2,
    shuffle=True,
    random_state=42
)


model = RandomForestClassifier(
    n_estimators=200,
    class_weight="balanced",
    random_state=42
)

model.fit(X_train, y_train)


y_pred = model.predict(X_test)


print("📊 Classification Report:")
print(classification_report(y_test, y_pred))