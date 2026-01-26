# Smart Greenhouse

Modular IoT project for monitoring and controlling a small greenhouse using ESP32, Raspberry Pi, and MQTT.

- **ESP32** handles sensors, actuators, and local fail-safe logic  
- **Raspberry Pi** logs data and performs simple decision logic  
- **Web UI** provides real-time monitoring and manual control  

The system is designed to be fault-tolerant and easy to extend.

---

## Repository Structure

- `web-ui/` – Web dashboard (MQTT-based)  
- `esp32/` – ESP32 firmware (MicroPython)  
- `raspberry-pi/` – Data logging and control logic  
- `docs/` – Architecture and deployment notes  
- `ml/` – Experiments and future work  
