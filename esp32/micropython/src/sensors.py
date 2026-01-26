# sensors.py
import time
from machine import ADC, Pin, I2C, time_pulse_us
import config

def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x

def pct_from_adc(adc, empty_adc, full_adc):
    # 0% = empty, 100% = full (inverseaza automat daca e cazul)
    if empty_adc == full_adc:
        return 0.0
    adc = clamp(adc, min(empty_adc, full_adc), max(empty_adc, full_adc))
    if empty_adc > full_adc:
        return 100.0 * (empty_adc - adc) / (empty_adc - full_adc)
    else:
        return 100.0 * (adc - empty_adc) / (full_adc - empty_adc)

class BH1750:
    def __init__(self, i2c, addr=config.BH1750_ADDR):
        self.i2c = i2c
        self.addr = addr
        # power on + reset + cont H-res
        self.i2c.writeto(self.addr, b'\x01')
        self.i2c.writeto(self.addr, b'\x07')
        self.i2c.writeto(self.addr, b'\x10')

    def lux(self):
        data = self.i2c.readfrom(self.addr, 2)
        raw = (data[0] << 8) | data[1]
        return raw / 1.2

class Sensors:
    def __init__(self):
        self.i2c = I2C(0, scl=Pin(config.I2C_SCL), sda=Pin(config.I2C_SDA), freq=config.I2C_FREQ)

        # BH1750 interior
        self.bh = BH1750(self.i2c)

        # BME280 (necesita bme280.py in lib/)
        try:
            import bme280
            self.bme = bme280.BME280(i2c=self.i2c, address=config.BME280_ADDR)
        except Exception:
            self.bme = None

        # Ultrasonic (HC-SR04)
        self.trig = Pin(config.PIN_TRIG, Pin.OUT, value=0)
        self.echo = Pin(config.PIN_ECHO, Pin.IN)

        # ADC
        self.adc_soil = ADC(Pin(config.PIN_SOIL))
        self.adc_outlux = ADC(Pin(config.PIN_OUT_LUX))
        self.adc_hum_res = ADC(Pin(config.PIN_HUM_RES_LEVEL))

        for a in (self.adc_soil, self.adc_outlux, self.adc_hum_res):
            a.atten(ADC.ATTN_11DB)
            a.width(ADC.WIDTH_12BIT)

        # filtre EMA
        self._lux_in_f = None
        self._out_pct_f = None
        self._soil_pct_f = None
        self._hum_res_pct_f = None
        self._dist_cm_f = None

    def _ema(self, prev, x, alpha=0.25):
        return x if prev is None else (prev + alpha * (x - prev))

    def read_bme(self):
        if self.bme is None:
            return None, None
        try:
            t, p, h = self.bme.values
            temp_c = float(t.replace("C", ""))
            rh = float(h.replace("%", ""))
            return temp_c, rh
        except Exception:
            return None, None

    def read_lux_in(self):
        try:
            x = self.bh.lux()
        except Exception:
            return None
        self._lux_in_f = self._ema(self._lux_in_f, x, alpha=0.2)
        return self._lux_in_f

    def read_out_lux_pct(self):
        adc = self.adc_outlux.read()
        pct = 100.0 * adc / 4095.0
        self._out_pct_f = self._ema(self._out_pct_f, pct, alpha=0.2)
        return self._out_pct_f

    def read_soil_pct(self):
        adc = self.adc_soil.read()

        dr = config.SOIL_ADC_DRY
        wt = config.SOIL_ADC_WET
        adc = clamp(adc, min(dr, wt), max(dr, wt))

        if dr > wt:
            pct = 100.0 * (dr - adc) / (dr - wt)
        else:
            pct = 100.0 * (adc - dr) / (wt - dr)

        self._soil_pct_f = self._ema(self._soil_pct_f, pct, alpha=0.25)
        return self._soil_pct_f

    def read_hum_res_pct(self):
        adc = self.adc_hum_res.read()
        pct = pct_from_adc(adc, config.HUM_RES_ADC_EMPTY, config.HUM_RES_ADC_FULL)
        self._hum_res_pct_f = self._ema(self._hum_res_pct_f, pct, alpha=0.25)
        return self._hum_res_pct_f

    def read_basin_dist_cm(self):
        self.trig.value(0)
        time.sleep_us(2)
        self.trig.value(1)
        time.sleep_us(10)
        self.trig.value(0)

        try:
            t = time_pulse_us(self.echo, 1, 30000)  # 30ms timeout
            if t < 0:
                return None
            cm = t / 58.0
            self._dist_cm_f = self._ema(self._dist_cm_f, cm, alpha=0.3)
            return self._dist_cm_f
        except OSError:
            return None
