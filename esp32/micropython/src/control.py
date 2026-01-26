# control.py
import time
import config

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

def in_light_window(hour):
    return (hour >= config.LIGHT_ON_HOUR) and (hour < config.LIGHT_OFF_HOUR)

def local_hour():
    # MicroPython NTP = UTC; aplicam offset fix din config
    h = time.localtime()[3]
    return (h + config.TZ_OFFSET_HOURS) % 24

class Controller:
    def __init__(self):
        self.mode = "AUTO"  # AUTO / MANUAL
        self.manual = {
            "lamp_color": "violet",
            "lamp_int": 0.0,
            "fan": 0.0,
            "heater": 0.0,
            "pump": 0.0,
            "valve_water": False,
            "valve_fill_hum": False,
        }

        self.lamp_int = 0.0
        self.heater_int = 0.0
        self.heater_boost_until = 0
        self.last_watering_s = -10**9

        self.basin_fault = False
        self.basin_fault_until = 0
        self.basin_last_bad_cm = None

        self.fill_active = False
        self.fill_started_s = 0

        self.water_pulses = 0
        self.water_phase = "IDLE"
        self.water_phase_until = 0

    def update_basin_fault(self, dist_cm):
        if dist_cm is None:
            return
        if dist_cm >= config.BASIN_STOP_CM:
            self.basin_fault = True
            self.basin_fault_until = time.time() + config.BASIN_FAULT_HOLD_S
            self.basin_last_bad_cm = dist_cm

        if self.basin_fault:
            if time.time() >= self.basin_fault_until:
                if dist_cm <= min(config.BASIN_RELEASE_CM, config.BASIN_STOP_CM - config.BASIN_REARM_DELTA_CM):
                    self.basin_fault = False

    def compute_lamp_target(self, lux_in, out_pct):
        h = local_hour()

        if not in_light_window(h):
            return 0.0, "off"

        if h >= (config.LIGHT_OFF_HOUR - 2):
            lux_t = config.LUX_TARGET_EVENING
            color = "red"
        else:
            lux_t = config.LUX_TARGET_DAY
            color = "violet"

        if out_pct is not None and out_pct < config.OUT_LUX_ROOM_DARK_PCT:
            lux_t = config.LUX_TARGET_CLOUDY

        return lux_t, color

    def lamp_control(self, lux_in, out_pct):
        lux_t, color = self.compute_lamp_target(lux_in, out_pct)
        if lux_t <= 0.1 or lux_in is None:
            if lux_t > 0.1:
                target_int = 0.35
                color = "violet"
            else:
                target_int = 0.0
                color = "off"
        else:
            err = lux_t - lux_in
            target_int = self.lamp_int + config.LAMP_KP * err
            target_int = clamp(target_int, config.LAMP_MIN_INT, config.LAMP_MAX_INT)

        step = config.LAMP_RAMP_PER_S
        if target_int > self.lamp_int:
            self.lamp_int = min(self.lamp_int + step, target_int)
        else:
            self.lamp_int = max(self.lamp_int - step, target_int)

        return color, self.lamp_int

    def temp_setpoint(self):
        return config.T_DAY if in_light_window(local_hour()) else config.T_NIGHT

    def heater_and_fan_control(self, temp_c, rh):
        t_sp = self.temp_setpoint()

        if temp_c is not None and temp_c < (t_sp - 2.0) and time.time() > self.heater_boost_until:
            self.heater_boost_until = time.time() + config.HEATER_BOOST_SECONDS

        if temp_c is None:
            heater = 0.0
        else:
            if temp_c < (t_sp - config.T_HYST):
                heater = config.HEATER_MAX
            elif temp_c > (t_sp + config.T_HYST):
                heater = 0.0
            else:
                heater = self.heater_int

            if time.time() < self.heater_boost_until:
                heater = max(heater, config.HEATER_BOOST_MAX)

        heater = clamp(heater, 0.0, config.HEATER_MAX)
        self.heater_int = heater

        fan = 0.0
        if temp_c is not None and temp_c > (t_sp + config.FAN_ON_OVER_T):
            fan = config.FAN_BOOST
        if rh is not None and rh >= config.FAN_ON_OVER_RH:
            fan = max(fan, config.FAN_BOOST)

        fan = clamp(fan, config.FAN_MIN, config.FAN_MAX)
        return heater, fan

    def watering_step(self, soil_pct):
        now = time.time()

        if (now - self.last_watering_s) < config.WATER_COOLDOWN_S:
            return False, 0.0, False

        if soil_pct is None:
            return False, 0.0, False

        if self.water_phase != "IDLE":
            if now >= self.water_phase_until:
                if self.water_phase == "PULSE":
                    self.water_phase = "PAUSE"
                    self.water_phase_until = now + config.WATER_PAUSE_SECONDS
                    return False, 0.0, True
                elif self.water_phase == "PAUSE":
                    if soil_pct < config.SOIL_DRY_PCT and self.water_pulses < config.WATER_MAX_PULSES:
                        self.water_phase = "PULSE"
                        self.water_phase_until = now + config.WATER_PULSE_SECONDS
                        self.water_pulses += 1
                        return True, 1.0, True
                    else:
                        self.water_phase = "IDLE"
                        self.water_pulses = 0
                        self.last_watering_s = now
                        return False, 0.0, False
            else:
                if self.water_phase == "PULSE":
                    return True, 1.0, True
                else:
                    return False, 0.0, True

        if soil_pct < config.SOIL_DRY_PCT:
            self.water_phase = "PULSE"
            self.water_phase_until = now + config.WATER_PULSE_SECONDS
            self.water_pulses = 1
            return True, 1.0, True

        return False, 0.0, False

    def hum_res_fill_step(self, hum_res_pct):
        now = time.time()
        if hum_res_pct is None:
            return False, 0.0, False

        if not self.fill_active and hum_res_pct <= config.HUM_RES_START_FILL_PCT:
            self.fill_active = True
            self.fill_started_s = now

        if self.fill_active:
            if (now - self.fill_started_s) >= config.HUM_RES_FILL_MAX_S:
                self.fill_active = False
                return False, 0.0, False

            if hum_res_pct >= config.HUM_RES_STOP_FILL_PCT:
                self.fill_active = False
                return False, 0.0, False

            return True, 1.0, True

        return False, 0.0, False

    def tick_auto(self, s):
        self.update_basin_fault(s.get("basin_cm"))

        lamp_color, lamp_int = self.lamp_control(s.get("lux_in"), s.get("out_pct"))
        heater, fan = self.heater_and_fan_control(s.get("temp_c"), s.get("rh"))

        water_valve, water_pump, watering_active = self.watering_step(s.get("soil_pct"))
        fill_valve, fill_pump, fill_active = self.hum_res_fill_step(s.get("hum_res_pct"))

        pump = max(water_pump, fill_pump)
        valve_water = water_valve
        valve_fill = fill_valve

        if self.basin_fault:
            pump = 0.0
            valve_water = False
            valve_fill = False

        if fill_active and watering_active:
            valve_water = False

        if not valve_water and not valve_fill:
            pump = 0.0

        return {
            "lamp_color": lamp_color,
            "lamp_int": lamp_int,
            "fan": fan,
            "heater": heater,
            "pump": pump,
            "valve_water": valve_water,
            "valve_fill_hum": valve_fill,
            "basin_fault": self.basin_fault,
        }

    def tick(self, s):
        # basin protection se aplica in ambele moduri
        self.update_basin_fault(s.get("basin_cm"))

        if self.mode == "MANUAL":
            cmd = dict(self.manual, basin_fault=self.basin_fault)
            # fail-safe in manual: nu lasi pompa/valve cand e fault bazin
            if self.basin_fault:
                cmd["pump"] = 0.0
                cmd["valve_water"] = False
                cmd["valve_fill_hum"] = False
            # daca nu ai valve, tai pompa (aceeasi regula ca in auto)
            if not cmd.get("valve_water") and not cmd.get("valve_fill_hum"):
                cmd["pump"] = 0.0
            return cmd

        return self.tick_auto(s)
