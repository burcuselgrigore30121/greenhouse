# Raspberry Pi Node

Raspberry Pi acts as a supervisory node in the Smart Greenhouse system.

- Subscribes to sensor data via MQTT
- Logs telemetry data for later analysis
- Runs simple control logic based on collected data
- Can send control commands to the ESP32 when enabled

The node is designed to run continuously with low resource usage and does not interfere with manual control from the Web UI.

## Structure

- `scripts/` – MQTT logger, data processing, and control logic
- `services/` – systemd service files for background execution
- `config_local.py` – local configuration (MQTT, paths, limits)
