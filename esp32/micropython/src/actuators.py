# actuators.py
from machine import Pin, PWM
import config

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

def u16(x01):
    return int(clamp(x01, 0.0, 1.0) * 65535)

class RelayActiveLow:
    def __init__(self, pin_no: int):
        self.pin = Pin(pin_no, Pin.OUT, value=1)  # OFF (active-low)

    def set(self, on: bool):
        self.pin.value(0 if on else 1)

class PWMLoad:
    def __init__(self, pin_no: int, freq: int):
        self.pwm = PWM(Pin(pin_no), freq=freq, duty_u16=0)
        self.last = 0.0

    def set(self, x01: float):
        x01 = clamp(x01, 0.0, 1.0)
        self.last = x01
        self.pwm.duty_u16(u16(x01))

    def off(self):
        self.set(0.0)

class LampL298N:
    def __init__(self, pin_blue: int, pin_red: int, freq: int):
        self.pwm_b = PWM(Pin(pin_blue), freq=freq, duty_u16=0)
        self.pwm_r = PWM(Pin(pin_red),  freq=freq, duty_u16=0)
        self.intensity = 0.0
        self.color = "off"

    def set(self, color: str, intensity01: float):
        I = clamp(intensity01, 0.0, 1.0)
        self.intensity = I
        self.color = color

        if color == "off" or I <= 0.0001:
            self.pwm_b.duty_u16(0)
            self.pwm_r.duty_u16(0)
            return

        if color == "violet":
            b = I
            r = I
        elif color == "red":
            r = I
            b = I * config.LAMP_RED_RATIO_ON_BLUE
        elif color == "blue":
            b = I
            r = I * config.LAMP_BLUE_RATIO_ON_RED
        else:
            b = I
            r = I

        self.pwm_b.duty_u16(u16(b))
        self.pwm_r.duty_u16(u16(r))

    def off(self):
        self.set("off", 0.0)

class Actuators:
    def __init__(self):
        self.lamp = LampL298N(config.PIN_LAMP_BLUE, config.PIN_LAMP_RED, config.PWM_FREQ_LAMP)
        self.pump = PWMLoad(config.PIN_PUMP, config.PWM_FREQ_PUMP)
        self.fan = PWMLoad(config.PIN_FAN, config.PWM_FREQ_FAN)
        self.heater = PWMLoad(config.PIN_HEATER, config.PWM_FREQ_HEATER)
        self.valve_fill_hum = RelayActiveLow(config.PIN_VALVE_FILL_HUM)
        self.valve_water = RelayActiveLow(config.PIN_VALVE_WATER)

    def fail_safe_off(self):
        self.lamp.off()
        self.pump.off()
        self.fan.off()
        self.heater.off()
        self.valve_fill_hum.set(False)
        self.valve_water.set(False)
