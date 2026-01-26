import os

MQTT_BROKER = os.getenv("GH_MQTT_BROKER", "broker.emqx.io")
MQTT_PORT   = int(os.getenv("GH_MQTT_PORT", "1883"))
MQTT_USER   = os.getenv("GH_MQTT_USER", "")
MQTT_PASS   = os.getenv("GH_MQTT_PASS", "")

DB_PATH     = os.getenv("GH_DB_PATH", "/var/lib/sera/telemetry.sqlite")
MODEL_PATH  = os.getenv("GH_MODEL_PATH", "/var/lib/sera/model.joblib")

MIN_DAYS_BEFORE_CONTROL = int(os.getenv("GH_MIN_DAYS", "7"))
LOOP_SECONDS            = float(os.getenv("GH_LOOP_S", "5"))

TOPIC_STATE_SENSORS     = "sera/stare/senzori"

TOPIC_CMD_MODE          = "sera/comenzi/mod"
TOPIC_CMD_FAN           = "sera/comenzi/ventilator"
TOPIC_CMD_LAMP_POWER    = "sera/comenzi/lampa/power"
