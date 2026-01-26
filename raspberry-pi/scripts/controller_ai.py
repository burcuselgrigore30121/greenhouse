import time
import json
from joblib import load
import paho.mqtt.client as mqtt

import config_local as cfg
from db import connect, days_covered
from build_dataset import featurize

_last = {"d": None, "ts": 0}

def clamp01_100(x: float) -> int:
    if x < 0.0: return 0
    if x > 100.0: return 100
    return int(round(x))

def main():
    con = connect(cfg.DB_PATH)

    def on_connect(client, userdata, flags, rc):
        client.subscribe(cfg.TOPIC_STATE_SENSORS)

    def on_message(client, userdata, msg):
        try:
            d = json.loads(msg.payload.decode("utf-8", errors="replace"))
            _last["d"] = d
            _last["ts"] = int(time.time())
        except Exception:
            pass

    client = mqtt.Client(client_id=f"pi-ai-{int(time.time())}")
    if cfg.MQTT_USER:
        client.username_pw_set(cfg.MQTT_USER, cfg.MQTT_PASS)

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(cfg.MQTT_BROKER, cfg.MQTT_PORT, keepalive=60)
    client.loop_start()

    while True:
        if days_covered(con) < cfg.MIN_DAYS_BEFORE_CONTROL:
            time.sleep(cfg.LOOP_SECONDS)
            continue

        d = _last["d"]
        if not isinstance(d, dict):
            time.sleep(cfg.LOOP_SECONDS)
            continue

        # Nu te bagi peste utilizator: dacă e MANUAL, nu publici nimic
        if str(d.get("mode", "")).lower() != "auto":
            time.sleep(cfg.LOOP_SECONDS)
            continue

        # Încarcă modelul (poți optimiza să-l ții în RAM; așa e sigur și simplu)
        try:
            model = load(cfg.MODEL_PATH)
        except Exception:
            time.sleep(cfg.LOOP_SECONDS)
            continue

        x = featurize(d)
        fan_pct = float(model["fan"].predict([x])[0])
        lamp_on = int(model["lamp"].predict([x])[0])  # 0/1

        fan_pct_i = clamp01_100(fan_pct)
        lamp_str = "on" if lamp_on else "off"

        # Preluare control: comuți în manual + setezi ventilator/lampă
        client.publish(cfg.TOPIC_CMD_MODE, "manual", qos=0, retain=False)
        client.publish(cfg.TOPIC_CMD_FAN, str(fan_pct_i), qos=0, retain=False)
        client.publish(cfg.TOPIC_CMD_LAMP_POWER, lamp_str, qos=0, retain=False)

        time.sleep(cfg.LOOP_SECONDS)

if __name__ == "__main__":
    main()
