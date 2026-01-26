from joblib import dump
import numpy as np
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier

import config_local as cfg
from build_dataset import load_xy

def main():
    X, y_fan, y_lamp = load_xy(cfg.DB_PATH)

    if len(X) < 500:
        raise SystemExit("Not enough data yet (need >= 500 samples in AUTO)")

    X = np.asarray(X, dtype=np.float32)
    y_fan = np.asarray(y_fan, dtype=np.float32)
    y_lamp = np.asarray(y_lamp, dtype=np.int32)

    # Modele mici: 1GB RAM safe
    fan_model = RandomForestRegressor(
        n_estimators=120,
        max_depth=10,
        random_state=42,
        n_jobs=1
    )
    lamp_model = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        random_state=42,
        n_jobs=1
    )

    fan_model.fit(X, y_fan)
    lamp_model.fit(X, y_lamp)

    dump({"fan": fan_model, "lamp": lamp_model}, cfg.MODEL_PATH)
    print(f"Saved model to {cfg.MODEL_PATH}")

if __name__ == "__main__":
    main()
