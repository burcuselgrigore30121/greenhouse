# mqtt_bridge.py
import time
import network
import ubinascii
import ujson as json
from umqtt.robust import MQTTClient
import config

def _b(x):
    return x if isinstance(x, bytes) else x.encode()

def wifi_connect():
    sta = network.WLAN(network.STA_IF)
    if not sta.active():
        sta.active(True)
    if not sta.isconnected():
        sta.connect(config.WIFI_SSID, config.WIFI_PASS)
        t0 = time.ticks_ms()
        while not sta.isconnected():
            if time.ticks_diff(time.ticks_ms(), t0) > 20000:
                raise RuntimeError("WiFi connect timeout")
            time.sleep_ms(250)
    return sta

def get_ip():
    sta = network.WLAN(network.STA_IF)
    if sta.isconnected():
        return sta.ifconfig()[0]
    return None

class MqttBridge:
    def __init__(self, controller):
        self.ctrl = controller
        self.client = None

    def connect(self):
        cid = config.MQTT_CLIENT_ID
        if cid == "sera-esp32":
            # stabil, dar diferit pe device
            try:
                import machine
                cid = "sera-" + ubinascii.hexlify(machine.unique_id()).decode()
            except Exception:
                pass

        self.client = MQTTClient(
            client_id=_b(cid),
            server=_b(config.MQTT_BROKER),
            port=config.MQTT_PORT,
            user=_b(config.MQTT_USER) if config.MQTT_USER else None,
            password=_b(config.MQTT_PASS) if config.MQTT_PASS else None,
            keepalive=config.MQTT_KEEPALIVE
        )
        self.client.set_callback(self._on_msg)
        self.client.connect()

        # subscribe exact ca in site
        self.client.subscribe(config.TOPIC_CMD_MODE)
        self.client.subscribe(config.TOPIC_CMD_FAN)
        self.client.subscribe(config.TOPIC_CMD_LAMP_POWER)
        self.client.subscribe(config.TOPIC_CMD_LAMP_INTENS)
        self.client.subscribe(config.TOPIC_CMD_LAMP_COLOR)
        self.client.subscribe(config.TOPIC_CMD_PUMP_POWER)
        self.client.subscribe(config.TOPIC_CMD_PUMP_SPEED)
        self.client.subscribe(config.TOPIC_CMD_HEATER_LEVEL)

    def _parse_int(self, payload, lo, hi, default=None):
        try:
            v = int(payload)
            if v < lo: v = lo
            if v > hi: v = hi
            return v
        except Exception:
            return default

    def _on_msg(self, topic, msg):
        t = topic
        p = msg.decode().strip().lower()

        # --- mode ---
        if t == config.TOPIC_CMD_MODE:
            if p == "manual":
                self.ctrl.mode = "MANUAL"
            elif p == "auto":
                self.ctrl.mode = "AUTO"
            return

        # --- fan ---
        if t == config.TOPIC_CMD_FAN:
            v = self._parse_int(p, 0, 100, None)
            if v is not None:
                self.ctrl.manual["fan"] = v / 100.0
            return

        # --- heater ---
        if t == config.TOPIC_CMD_HEATER_LEVEL:
            v = self._parse_int(p, 0, 100, None)
            if v is not None:
                self.ctrl.manual["heater"] = v / 100.0
            return

        # --- pump power ---
        if t == config.TOPIC_CMD_PUMP_POWER:
            if p == "on":
                # daca nu ai speed setata, ramai pe ultima
                if self.ctrl.manual["pump"] <= 0.0:
                    self.ctrl.manual["pump"] = 0.7
                # UI nu are valve; alegem implicit udare
                self.ctrl.manual["valve_water"] = True
                self.ctrl.manual["valve_fill_hum"] = False
            elif p == "off":
                self.ctrl.manual["pump"] = 0.0
                self.ctrl.manual["valve_water"] = False
                self.ctrl.manual["valve_fill_hum"] = False
            return

        # --- pump speed ---
        if t == config.TOPIC_CMD_PUMP_SPEED:
            v = self._parse_int(p, 0, 100, None)
            if v is not None:
                self.ctrl.manual["pump"] = v / 100.0
                # daca speed > 0, asigura o valva implicita
                if self.ctrl.manual["pump"] > 0.0:
                    self.ctrl.manual["valve_water"] = True
                    self.ctrl.manual["valve_fill_hum"] = False
            return

        # --- lamp power ---
        if t == config.TOPIC_CMD_LAMP_POWER:
            if p == "on":
                if self.ctrl.manual["lamp_int"] <= 0.01:
                    self.ctrl.manual["lamp_int"] = 0.35
                if self.ctrl.manual.get("lamp_color") in (None, "off"):
                    self.ctrl.manual["lamp_color"] = "violet"
            elif p == "off":
                self.ctrl.manual["lamp_int"] = 0.0
                self.ctrl.manual["lamp_color"] = "off"
            return

        # --- lamp intensity (UI: 800 = increase, 400 = decrease) ---
        if t == config.TOPIC_CMD_LAMP_INTENS:
            ms = self._parse_int(p, 0, 5000, None)
            if ms is None:
                return
            # conventie fixa pentru UI-ul tau:
            inc = (ms >= 600)
            delta = config.LAMP_UI_STEP_PER_SEC * (ms / 1000.0)
            cur = float(self.ctrl.manual.get("lamp_int", 0.0))
            cur = cur + delta if inc else cur - delta
            if cur < 0.0: cur = 0.0
            if cur > 1.0: cur = 1.0
            self.ctrl.manual["lamp_int"] = cur
            if cur <= 0.01:
                self.ctrl.manual["lamp_color"] = "off"
            elif self.ctrl.manual.get("lamp_color") == "off":
                self.ctrl.manual["lamp_color"] = "violet"
            return

        # --- lamp color cycle ---
        if t == config.TOPIC_CMD_LAMP_COLOR:
            if p == "cycle":
                seq = ["violet", "red", "blue"]
                cur = self.ctrl.manual.get("lamp_color", "violet")
                if cur not in seq:
                    cur = "violet"
                nxt = seq[(seq.index(cur) + 1) % len(seq)]
                self.ctrl.manual["lamp_color"] = nxt
                if self.ctrl.manual.get("lamp_int", 0.0) <= 0.01:
                    self.ctrl.manual["lamp_int"] = 0.35
            return

    def poll(self):
        if self.client:
            # non-blocking; proceseaza 0 sau 1 mesaj
            self.client.check_msg()

    def publish_state(self, payload_dict):
        if not self.client:
            return
        b = json.dumps(payload_dict)
        self.client.publish(config.TOPIC_STATE_SENSORS, b)

    def reconnect_if_needed(self):
        try:
            self.poll()
        except Exception:
            try:
                self.client.reconnect()
            except Exception:
                # lasa main sa continue; se va incerca iar la urmatorul tick
                pass
