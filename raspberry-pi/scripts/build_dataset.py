import json
import sqlite3
import math
from datetime import datetime

import config_local as cfg

def featurize(d: dict) -> list[float]:
    temp  = float(d.get("temp") or 0.0)
    light = float(d.get("light") or 0.0)
    soil  = float(d.get("soil") or 0.0)
    water = float(d.get("water") or 0.0)

    now = datetime.utcnow()
    h = now.hour + now.minute / 60.0
    sin_h = math.sin(2 * math.pi * h / 24.0)
    cos_h = math.cos(2 * math.pi * h / 24.0)

    return [temp, light, soil, water, sin_h, cos_h]

def load_xy(db_path: str):
    con = sqlite3.connect(db_path)
    rows = con.execute("SELECT payload FROM telemetry WHERE topic = ?", (cfg.TOPIC_STATE_SENSORS,)).fetchall()

    X, y_fan, y_lamp = [], [], []
    for (p,) in rows:
        try:
            d = json.loads(p)
        except Exception:
            continue

        if str(d.get("mode", "")).lower() != "auto":
            continue
        if "fan_pct" not in d or "lamp_power" not in d:
            continue

        X.append(featurize(d))
        y_fan.append(float(d["fan_pct"]))        # 0..100
        y_lamp.append(int(d["lamp_power"]))      # 0/1

    return X, y_fan, y_lamp

if __name__ == "__main__":
    X, y_fan, y_lamp = load_xy(cfg.DB_PATH)
    print(f"rows={len(X)} fan_labels={len(y_fan)} lamp_labels={len(y_lamp)}")
