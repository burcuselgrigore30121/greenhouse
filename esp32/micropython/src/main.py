# main.py
import uasyncio as asyncio
import time
import ujson as json

import config
from actuators import Actuators
from sensors import Sensors
from control import Controller
from mqtt_bridge import wifi_connect, get_ip, MqttBridge

def _safe_float(x):
    try:
        if x is None:
            return None
        return float(x)
    except Exception:
        return None

async def setup_time():
    if not config.USE_NTP:
        return
    try:
        import ntptime
        ntptime.settime()  # seteaza UTC
    except Exception:
        pass

async def loop():
    # WiFi + time
    wifi_connect()
    await setup_time()

    act = Actuators()
    sens = Sensors()
    ctrl = Controller()
    mqtt = MqttBridge(ctrl)
    mqtt.connect()

    act.fail_safe_off()

    last_pub = 0

    while True:
        # --- MQTT poll (comenzi UI) ---
        mqtt.reconnect_if_needed()

        # --- read sensors ---
        temp_c, rh = sens.read_bme()
        lux_in = sens.read_lux_in()
        out_pct = sens.read_out_lux_pct()
        soil_pct = sens.read_soil_pct()
        hum_res_pct = sens.read_hum_res_pct()
        basin_cm = sens.read_basin_dist_cm()

        s = {
            "temp_c": temp_c,
            "rh": rh,
            "lux_in": lux_in,
            "out_pct": out_pct,
            "soil_pct": soil_pct,
            "hum_res_pct": hum_res_pct,
            "basin_cm": basin_cm,
        }

        # --- control ---
        cmd = ctrl.tick(s)

        # --- apply ---
        act.lamp.set(cmd["lamp_color"], cmd["lamp_int"])
        act.fan.set(cmd["fan"])
        act.heater.set(cmd["heater"])

        act.valve_water.set(bool(cmd["valve_water"]))
        act.valve_fill_hum.set(bool(cmd["valve_fill_hum"]))
        act.pump.set(cmd["pump"])

        # --- publish state to match site expectations ---
        now = time.time()
        if (now - last_pub) >= 1:
            last_pub = now

            # UI expects: temp, light, soil, water, mode, (optional) ip, fan_pct, lamp_power
            mode_str = "manual" if ctrl.mode == "MANUAL" else "auto"

            lamp_power = 1 if (cmd["lamp_color"] != "off" and cmd["lamp_int"] > 0.01) else 0
            fan_pct = int(max(0.0, min(1.0, cmd["fan"])) * 100.0)

            payload = {
                "temp": _safe_float(temp_c),
                "light": _safe_float(lux_in),
                "soil": _safe_float(soil_pct),
                "water": _safe_float(hum_res_pct),   # water level din UI = rezervor umidificator (%)
                "mode": mode_str,
                "fan_pct": fan_pct,
                "lamp_power": lamp_power,
                "ip": get_ip(),
            }
            mqtt.publish_state(payload)

        await asyncio.sleep(1)

try:
    asyncio.run(loop())
finally:
    asyncio.new_event_loop()
