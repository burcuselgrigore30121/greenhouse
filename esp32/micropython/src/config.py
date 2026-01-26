# config.py

# --- WiFi / MQTT (pentru site) ---
WIFI_SSID = "Galaxy S22 5DBB"
WIFI_PASS = "vetq4897"

MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "sera-esp32"
MQTT_USER = None
MQTT_PASS = None
MQTT_KEEPALIVE = 60

TOPIC_STATE_SENSORS = b"sera/stare/senzori"

TOPIC_CMD_MODE          = b"sera/comenzi/mod"               # "manual" / "auto"
TOPIC_CMD_FAN           = b"sera/comenzi/ventilator"        # "0".."100"
TOPIC_CMD_LAMP_POWER    = b"sera/comenzi/lampa/power"       # "on"/"off"
TOPIC_CMD_LAMP_INTENS   = b"sera/comenzi/lampa/intensity"   # "800" (increase), "400"(decrease)
TOPIC_CMD_LAMP_COLOR    = b"sera/comenzi/lampa/color"       # "cycle"
TOPIC_CMD_PUMP_POWER    = b"sera/comenzi/pompa/power"       # "on"/"off"
TOPIC_CMD_PUMP_SPEED    = b"sera/comenzi/pompa/speed"       # "0".."100"
TOPIC_CMD_HEATER_LEVEL  = b"sera/comenzi/incalzire/level"   # "0".."100"

# --- Time ---
# MicroPython e UTC dupa ntptime.settime(). Pentru Romania (iarna) pune +2.
# Daca vrei DST automat, trebuie RTC/NTP + tz handling extern; aici e manual.
TZ_OFFSET_HOURS = 2
USE_NTP = True

# --- I2C ---
I2C_SDA = 21
I2C_SCL = 22
I2C_FREQ = 400_000
BME280_ADDR = 0x76
BH1750_ADDR = 0x23

# --- Actuatoare ---
PIN_LAMP_BLUE = 18   # L298N IN1 (albastru)
PIN_LAMP_RED  = 19   # L298N IN2 (rosu)

PIN_PUMP      = 26   # MOSFET pump (PWM)
PIN_FAN       = 25   # MOSFET fan (PWM high freq)
PIN_HEATER    = 27   # MOSFET heat pad (PWM)

PIN_VALVE_FILL_HUM = 13  # Relay active-LOW (umplere rezervor umidificator)
PIN_VALVE_WATER    = 14  # Relay active-LOW (udare flori)

# --- Ultrasonic (bazin principal) ---
PIN_TRIG = 32
PIN_ECHO = 33

# --- ADC (ADC1 recommended) ---
PIN_SOIL = 39        # VN
PIN_OUT_LUX = 34     # TEMT6000 exterior
PIN_HUM_RES_LEVEL = 36  # VP nivel rezistiv rezervor umidificator (analog)

# --- PWM Frequencies ---
PWM_FREQ_LAMP = 2000
PWM_FREQ_PUMP = 1000
PWM_FREQ_HEATER = 1000
PWM_FREQ_FAN = 25000

# --- Lampa: mapping culoare ---
LAMP_RED_RATIO_ON_BLUE = 0.08
LAMP_BLUE_RATIO_ON_RED = 0.08

# --- Program lumina ---
LIGHT_ON_HOUR = 8
LIGHT_OFF_HOUR = 20

# --- Lux targets (interior BH1750) ---
LUX_TARGET_DAY = 15000.0
LUX_TARGET_CLOUDY = 18000.0
LUX_TARGET_EVENING = 8000.0

OUT_LUX_ROOM_BRIGHT_PCT = 35.0
OUT_LUX_ROOM_DARK_PCT   = 15.0

# --- Control lamp ---
LAMP_KP = 0.00006
LAMP_RAMP_PER_S = 0.03
LAMP_MIN_INT = 0.0
LAMP_MAX_INT = 1.0

# Manual mapping pentru UI (increase/decrease)
# Site trimite 800 pentru +, 400 pentru -. Aici decizi cat se modifica.
LAMP_UI_STEP_PER_SEC = 0.20

# --- Temperatura ---
T_DAY = 24.0
T_NIGHT = 20.0
T_HYST = 0.5

HEATER_MAX = 0.60
HEATER_BOOST_MAX = 0.60
HEATER_BOOST_SECONDS = 8 * 60

# --- Ventilator ---
FAN_MIN = 0.0
FAN_MAX = 1.0
FAN_ON_OVER_T = 1.0
FAN_ON_OVER_RH = 75.0
FAN_BOOST = 0.9

# --- Udare flori (soil moisture) ---
SOIL_ADC_DRY = 3200
SOIL_ADC_WET = 1400
SOIL_DRY_PCT = 35.0
WATER_PULSE_SECONDS = 5
WATER_PAUSE_SECONDS = 20
WATER_MAX_PULSES = 4
WATER_COOLDOWN_S = 30 * 60

# --- Umplere rezervor umidificator (nivel rezistiv ADC36) ---
HUM_RES_ADC_EMPTY = 3200
HUM_RES_ADC_FULL  = 1500
HUM_RES_START_FILL_PCT = 25.0
HUM_RES_STOP_FILL_PCT  = 85.0
HUM_RES_FILL_MAX_S = 180

# --- Protecție bazin principal (ultrasonic) ---
BASIN_STOP_CM = 16.5
BASIN_RELEASE_CM = 14.0
BASIN_REARM_DELTA_CM = 2.5
BASIN_FAULT_HOLD_S = 60

# --- Humidificator (placeholder) ---
HUM_PULSE_EVERY_S = 60 * 60
HUM_PULSE_S = 10
RH_STOP = 85.0
