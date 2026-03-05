# Smart Greenhouse

Modular IoT project for monitoring and controlling a small greenhouse using ESP32, Raspberry Pi, and MQTT.

- **ESP32** handles sensors, actuators, and local fail-safe logic  
- **Raspberry Pi** collected operational data streams used as datasets for AI model training.
- **Web UI** provides real-time monitoring and manual control  

The system is designed to be fault-tolerant and easy to extend.

---

## Repository Structure

- `web-ui/` – Web dashboard (MQTT-based)  
- `esp32/` – ESP32 firmware (MicroPython)  
- `raspberry-pi/` – Data logging and control logic  
- `docs/` – Architecture and deployment notes  
- `ml/` – Experiments and future work  

- **ESP32** handles sensors, actuators, and local fail-safe logic  
- **Raspberry Pi** collects operational data streams used as datasets for AI model training  
- **Web UI** provides real-time monitoring and manual control  

The system is designed to be fault-tolerant and easy to extend.

---

## Hardware Components

### Controllers

- **ESP32 DevKit** – Main microcontroller for sensors and actuators  
- **Raspberry Pi** – Central server for data logging and AI processing  

### Sensors

- **BME280** – Measures temperature, humidity, and atmospheric pressure  
- **BH1750** – Measures light intensity (Lux)  
- **Ultrasonic Distance Sensor** – Measures distance  
- **Water Level Sensor** – Measures water level in the reservoir  
- **Soil Moisture Sensor** – Measures soil moisture

### Actuators

- **Submersible Water Pump** – Irrigation system water pump  
- **Solenoid Valve** – Electronic control of water flow  
- **Ultrasonic Atomizer** – Generates mist to increase humidity  
- **Heating Pad** – Maintains soil or ambient temperature  
- **LED Grow Lights** – Provides required light spectrum for plant growth  
- **DC Fan** – Air circulation and temperature regulation  

### Control Modules

- **4-Channel Relay Module** – Switching high-power components (lights, pump, heater)  
- **MOSFET Driver Module** – PWM control for DC loads (fan, pump)
