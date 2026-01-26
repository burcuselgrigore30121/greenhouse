import time
import json
import paho.mqtt.client as mqtt

from db import connect, insert
import config_local as cfg

def main():
    con = connect(cfg.DB_PATH)

    def on_connect(client, userdata, flags, rc):
        client.subscribe(cfg.TOPIC_STATE_SENSORS)

    def on_message(client, userdata, msg):
        try:
            payload = msg.payload.decode("utf-8", errors="replace").strip()
            json.loads(payload)  # validare minimă
            insert(con, int(time.time()), msg.topic, payload)
        except Exception:
            pass

    client = mqtt.Client(client_id=f"pi-logger-{int(time.time())}")
    if cfg.MQTT_USER:
        client.username_pw_set(cfg.MQTT_USER, cfg.MQTT_PASS)

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(cfg.MQTT_BROKER, cfg.MQTT_PORT, keepalive=60)
    client.loop_forever()

if __name__ == "__main__":
    main()
