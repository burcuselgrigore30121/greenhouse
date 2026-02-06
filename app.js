// app.js

// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084; // WSS
const MQTT_PATH = "/mqtt"; // IMPORTANT for most brokers / EMQX
const MQTT_USER = "";
const MQTT_PASS = "";
const MQTT_CLIENT_ID =
  "WebAppClient_" + Math.random().toString(16).substr(2, 8);

// STATUS
const TOPIC_STAT_SENZORI = "sera/stare/senzori";

// COMMANDS (manual)
const TOPIC_CMD_MODE = "sera/comenzi/mod";
const TOPIC_CMD_FAN = "sera/comenzi/ventilator";

const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity"; // numeric step
const TOPIC_CMD_LAMP_COLOR = "sera/comenzi/lampa/color"; // "cycle"

const TOPIC_CMD_PUMP_POWER = "sera/comenzi/pompa/power"; // "on"/"off"
const TOPIC_CMD_PUMP_SPEED = "sera/comenzi/pompa/speed"; // 0..100

const TOPIC_CMD_HEAT_LEVEL = "sera/comenzi/incalzire/level"; // 0..50

const TOPIC_CMD_HUMIDIFIER_POWER = "sera/comenzi/umidificator/power"; // "on"/"off"
const TOPIC_CMD_FILL_VALVE_POWER = "sera/comenzi/valva/umplere/power"; // "on"/"off"
const TOPIC_CMD_FLOWER_VALVE_POWER = "sera/comenzi/valva/flori/power"; // "on"/"off"

// =====================
// WATER TANK CONFIG (ultrasonic)
// =====================
const TANK_CM_EMPTY = 16.0;
const TANK_CM_FULL = 2.0;

const ULTRA_DEADBAND_CM = 2.0;
const ULTRA_WINDOW = 6;
const TANK_STEP_PCT = 5;

let ultraBuf = [];
let ultraStable = null;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function ultraToPct(cm) {
  const pct =
    ((TANK_CM_EMPTY - cm) * 100) / (TANK_CM_EMPTY - TANK_CM_FULL);
  return clamp(pct, 0, 100);
}

function quantizePct(pct) {
  return clamp(Math.round(pct / TANK_STEP_PCT) * TANK_STEP_PCT, 0, 100);
}

function pushUltra(cm) {
  ultraBuf.push(cm);
  if (ultraBuf.length > ULTRA_WINDOW) ultraBuf.shift();
}

function filteredUltra(cm) {
  if (ultraStable === null) {
    ultraStable = cm;
    ultraBuf = [cm];
    return { stable: cm, usedAvg: false };
  }

  pushUltra(cm);

  if (Math.abs(cm - ultraStable) < ULTRA_DEADBAND_CM) {
    return { stable: ultraStable, usedAvg: true };
  }

  const sorted = ultraBuf.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  ultraStable = med;
  return { stable: med, usedAvg: false };
}

// =====================
// STATE
// =====================
let isManualMode = false;
let hasFirstStatus = false;

// =====================
// DOM SAFE GETTERS
// =====================
const $ = (id) => document.getElementById(id);

const allElements = {
  btnAuto: $("btn-auto"),
  btnManual: $("btn-manual"),
  controlsCard: $("controls-card"),

  fanSlider: $("fan-slider"),
  fanValue: $("fan-value"),
  fanVisual: $("fan-visual"),

  tempMain: $("temp-main"),
  humidLine: $("humid-line"),
  lightLine: $("light-line"),

  metricTemp: $("metric-temp"),
  metricLight: $("metric-light"),
  metricSoil: $("metric-soil"),
  metricWater: $("metric-water"),

  metricTempTag: $("metric-temp-tag"),
  metricLightTag: $("metric-light-tag"),
  metricSoilTag: $("metric-soil-tag"),
  metricWaterTag: $("metric-water-tag"),

  healthValue: $("health-value"),
  healthBadge: $("health-badge"),
  healthBarFill: $("health-bar-fill"),

  modeChip: $("mode-chip"),
  ipLabel: $("ip-label"),
  lastUpdate: $("last-update"),
  topDate: $("top-date"),
  topTime: $("top-time"),
  statusPill: $("status-pill"),
  statusText: $("status-text"),
  splash: $("splash"),
  overviewCard: $("overview-card"),

  tankCard: $("tank-card"),
  tankPct: $("tank-pct"),
  tankCm: $("tank-cm"),
  tankStable: $("tank-stable"),

  lampMain: $("lamp-main"),
  lampIntensityBtn: $("lamp-intensity-btn"),
  lampColorBtn: $("lamp-color-btn"),
  lampCard: $("lamp-card"),

  pumpToggle: $("pump-toggle"),
  pumpToggleLabel: $("pump-toggle-label"),
  pumpMain: $("pump-main"),
  pumpSlider: $("pump-slider"),
  pumpValue: $("pump-value"),
  pumpCard: $("pump-card"),

  heatSlider: $("heat-slider"),
  heatValue: $("heat-value"),
  heatCard: $("heat-card"),

  humidToggle: $("humid-toggle"),
  humidToggleLabel: $("humid-toggle-label"),
  fillToggle: $("fill-toggle"),
  fillToggleLabel: $("fill-toggle-label"),
  flowerToggle: $("flower-toggle"),
  flowerToggleLabel: $("flower-toggle-label"),
};

// =====================
// UI HELPERS
// =====================
function hideSplash() {
  if (allElements.splash) allElements.splash.classList.add("hide");
}

function updateClock() {
  const d = new Date();
  if (allElements.topDate) {
    allElements.topDate.textContent = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  if (allElements.topTime) {
    allElements.topTime.textContent = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function labelForTemp(t) {
  if (t >= 20 && t <= 28) return { txt: "Optimal", cls: "good" };
  if (t < 18) return { txt: "Too cold", cls: "bad" };
  return { txt: "Too hot", cls: "bad" };
}

function labelForWater(w) {
  if (w >= 40 && w <= 90) return { txt: "OK", cls: "good" };
  if (w < 40) return { txt: "Low", cls: "bad" };
  return { txt: "OK", cls: "good" };
}

function healthFromSensors(temp, soil, water) {
  let score = 100;
  if (temp < 18 || temp > 30) score -= 25;
  if (soil < 30 || soil > 80) score -= 25;
  if (water < 30 || water > 90) score -= 20;
  return clamp(score, 0, 100);
}

function updateSliderFill(slider, colorOverride) {
  if (!slider) return;
  const min = slider.min ? Number(slider.min) : 0;
  const max = slider.max ? Number(slider.max) : 100;
  const val = ((Number(slider.value) - min) * 100) / (max - min);
  const c = colorOverride || "var(--accent)";
  slider.style.background = `linear-gradient(90deg, ${c} 0%, ${c} ${val}%, #e5e7eb ${val}%, #e5e7eb 100%)`;
}

function updateFanVisual() {
  if (!allElements.fanSlider || !allElements.fanVisual) return;
  const val = Number(allElements.fanSlider.value);
  if (isManualMode && val > 0) {
    allElements.fanVisual.classList.add("spin");
    const base = 1.0;
    const min = 0.25;
    const speed = Math.max(min, base - 0.75 * (val / 100));
    allElements.fanVisual.style.setProperty("--fan-speed", `${speed}s`);
  } else {
    allElements.fanVisual.classList.remove("spin");
  }
}

function renderTank(cm, usedAvg) {
  if (!allElements.tankCard || !allElements.tankPct || !allElements.tankCm)
    return;
  const pct = quantizePct(ultraToPct(cm));
  allElements.tankPct.textContent = pct.toFixed(0);
  allElements.tankCm.textContent = `${cm.toFixed(1)} cm`;
  if (allElements.tankStable)
    allElements.tankStable.textContent = usedAvg ? "avg(min,max)" : "live";
  allElements.tankCard.style.setProperty("--tank-level", pct + "%");
}

function publishStatus(text, connected) {
  if (allElements.statusText) allElements.statusText.textContent = text;
  if (allElements.statusPill) {
    allElements.statusPill.classList.toggle("disconnected", !connected);
  }
}

// =====================
// MQTT CLIENT (SAFE)
// =====================
let client = null;

function setupMqttClient() {
  if (typeof Paho === "undefined" || !Paho.MQTT) {
    console.error(
      "Paho MQTT not loaded. Add mqttws31.min.js before app.js in index.html."
    );
    publishStatus("MQTT lib missing", false);
    return null;
  }

  const c = new Paho.MQTT.Client(
    MQTT_HOST,
    Number(MQTT_PORT),
    MQTT_PATH,
    MQTT_CLIENT_ID
  );

  c.onConnectionLost = onConnectionLost;
  c.onMessageArrived = onMessageArrived;
  return c;
}

function onConnect() {
  if (!client) return;
  client.subscribe(TOPIC_STAT_SENZORI);
  publishStatus("Live connected", true);
}

function onConnectionLost(res) {
  if (res && res.errorCode !== 0) {
    publishStatus("Disconnected", false);
    setTimeout(startConnect, 3000);
  }
}

function onMessageArrived(message) {
  try {
    const data = JSON.parse(message.payloadString);

    const t = Number(data.temp);
    const light = Number(data.light);
    const soil = Number(data.soil);
    const water = Number(data.water);
    const lightOut = Number(data.light_out);
    const humAir = Number(data.hum_air);

    // Temp UI
    if (isFinite(t)) {
      if (allElements.tempMain)
        allElements.tempMain.innerHTML = `${t.toFixed(
          1
        )}<span>°C</span>`;
      if (allElements.metricTemp) allElements.metricTemp.textContent = t.toFixed(1);
      if (allElements.metricTempTag) {
        const lt = labelForTemp(t);
        allElements.metricTempTag.textContent = lt.txt;
        allElements.metricTempTag.className = "metric-tag " + lt.cls;
      }
    }

    // Light line
    if (isFinite(light) && allElements.lightLine) {
      let txt = `Light (in): ${light.toFixed(0)} lx`;
      if (isFinite(lightOut)) txt += ` · Light (out): ${lightOut.toFixed(0)} %`;
      allElements.lightLine.textContent = txt;
    }

    // Humid line
    if (isFinite(soil) && allElements.humidLine) {
      const airPart = isFinite(humAir) ? `${humAir.toFixed(0)} %` : "-- %";
      allElements.humidLine.textContent = `${airPart} / ${soil.toFixed(0)} %`;
    }

    // Water metric
    if (isFinite(water)) {
      if (allElements.metricWater) allElements.metricWater.textContent = water.toFixed(0);
      if (allElements.metricWaterTag) {
        const lw = labelForWater(water);
        allElements.metricWaterTag.textContent = lw.txt;
        allElements.metricWaterTag.className = "metric-tag " + lw.cls;
      }
    }

    // Health
    if (isFinite(t) && isFinite(soil) && isFinite(water)) {
      const health = healthFromSensors(t, soil, water);
      if (allElements.healthValue) allElements.healthValue.textContent = `${health}%`;
      if (allElements.healthBarFill) allElements.healthBarFill.style.width = `${health}%`;
      if (allElements.healthBadge) {
        allElements.healthBadge.textContent =
          health >= 80 ? "Very good" : health >= 60 ? "OK" : "Attention";
      }
    }

    // Mode sync
    const manualFromDevice = data.mode === "manual";
    setModeUI(manualFromDevice, false);

    // Sync fan slider
    if (
      typeof data.fan_pct === "number" &&
      allElements.fanSlider &&
      document.activeElement !== allElements.fanSlider
    ) {
      allElements.fanSlider.value = data.fan_pct;
      if (allElements.fanValue) allElements.fanValue.textContent = `${data.fan_pct}%`;
      updateSliderFill(allElements.fanSlider);
      updateFanVisual();
    }

    // Ultrasonic tank
    if (typeof data.ultra_cm === "number" && isFinite(data.ultra_cm)) {
      const r = filteredUltra(data.ultra_cm);
      renderTank(r.stable, r.usedAvg);
    }

    if (data.ip && allElements.ipLabel) allElements.ipLabel.textContent = data.ip;

    if (allElements.lastUpdate) {
      const now = new Date();
      allElements.lastUpdate.textContent = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }

    hasFirstStatus = true;
    hideSplash();
  } catch (e) {
    console.error("JSON parse error:", e);
  }
}

function startConnect() {
  if (!client) client = setupMqttClient();
  if (!client) return;

  publishStatus("Connecting...", false);

  client.connect({
    onSuccess: onConnect,
    useSSL: true,
    userName: MQTT_USER,
    password: MQTT_PASS,
    onFailure: () => {
      publishStatus("Error", false);
      setTimeout(startConnect, 5000);
    },
  });
}

function publishMessage(topic, payload) {
  if (!client || !client.isConnected()) return;
  const m = new Paho.MQTT.Message(String(payload));
  m.destinationName = topic;
  client.send(m);
}

// =====================
// MODE AUTO / MANUAL
// =====================
function resetManualControls() {
  if (allElements.fanSlider) allElements.fanSlider.value = 0;
  if (allElements.fanValue) allElements.fanValue.textContent = "0%";
  updateSliderFill(allElements.fanSlider);
  updateFanVisual();

  if (allElements.pumpToggle) allElements.pumpToggle.classList.remove("on");
  if (allElements.pumpToggleLabel) allElements.pumpToggleLabel.textContent = "Off";
  if (allElements.pumpMain) allElements.pumpMain.textContent = "Off";
  if (allElements.pumpSlider) allElements.pumpSlider.value = 0;
  if (allElements.pumpValue) allElements.pumpValue.textContent = "0%";
  updateSliderFill(allElements.pumpSlider, "#3b82f6");
  if (allElements.pumpCard) allElements.pumpCard.style.setProperty("--pump-level", "0%");

  if (allElements.heatSlider) allElements.heatSlider.value = 0;
  if (allElements.heatValue) allElements.heatValue.textContent = "0%";
  if (allElements.heatCard) {
    allElements.heatCard.style.background = "#f9fafb";
    allElements.heatCard.style.borderColor = "#e5e7eb";
    allElements.heatCard.style.boxShadow = "0 10px 24px rgba(15,23,42,0.14)";
  }

  if (allElements.humidToggle) {
    allElements.humidToggle.classList.remove("on");
    if (allElements.humidToggleLabel) allElements.humidToggleLabel.textContent = "Off";
  }
  if (allElements.fillToggle) {
    allElements.fillToggle.classList.remove("on");
    if (allElements.fillToggleLabel) allElements.fillToggleLabel.textContent = "Off";
  }
  if (allElements.flowerToggle) {
    allElements.flowerToggle.classList.remove("on");
    if (allElements.flowerToggleLabel) allElements.flowerToggleLabel.textContent = "Off";
  }
}

function setModeUI(manual, publish) {
  isManualMode = !!manual;

  if (isManualMode) {
    if (allElements.btnManual) allElements.btnManual.classList.add("active");
    if (allElements.btnAuto) allElements.btnAuto.classList.remove("active");
    if (allElements.modeChip) allElements.modeChip.textContent = "MANUAL";
    if (allElements.controlsCard) allElements.controlsCard.classList.remove("hidden");
    if (allElements.overviewCard) allElements.overviewCard.classList.add("manual-mode");
  } else {
    if (allElements.btnManual) allElements.btnManual.classList.remove("active");
    if (allElements.btnAuto) allElements.btnAuto.classList.add("active");
    if (allElements.modeChip) allElements.modeChip.textContent = "AUTO";
    if (allElements.controlsCard) allElements.controlsCard.classList.add("hidden");
    if (allElements.overviewCard) allElements.overviewCard.classList.remove("manual-mode");
    resetManualControls();
  }

  updateSliderFill(allElements.fanSlider);
  updateFanVisual();

  if (publish) {
    publishMessage(TOPIC_CMD_MODE, isManualMode ? "manual" : "auto");
    if (isManualMode && allElements.fanSlider)
      publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
  }
}

// =====================
// EVENTS (SAFE BINDS)
// =====================
function bindEvents() {
  if (allElements.btnAuto)
    allElements.btnAuto.addEventListener("click", () => setModeUI(false, true));
  if (allElements.btnManual)
    allElements.btnManual.addEventListener("click", () => setModeUI(true, true));

  if (allElements.fanSlider) {
    allElements.fanSlider.addEventListener("input", () => {
      if (allElements.fanValue)
        allElements.fanValue.textContent = `${allElements.fanSlider.value}%`;
      updateSliderFill(allElements.fanSlider);
      updateFanVisual();
    });
    allElements.fanSlider.addEventListener("change", () => {
      if (!hasFirstStatus || !isManualMode) return;
      publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
    });
  }

  if (allElements.lampIntensityBtn) {
    allElements.lampIntensityBtn.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      allElements.lampIntensityBtn.classList.add("active-hold");
      setTimeout(
        () => allElements.lampIntensityBtn.classList.remove("active-hold"),
        220
      );
      publishMessage(TOPIC_CMD_LAMP_BRIGHT, "80");
    });
  }

  if (allElements.lampColorBtn) {
    allElements.lampColorBtn.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");
      allElements.lampColorBtn.classList.add("pulse");
      setTimeout(() => allElements.lampColorBtn.classList.remove("pulse"), 220);
    });
  }

  if (allElements.pumpToggle) {
    allElements.pumpToggle.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      const on = !allElements.pumpToggle.classList.contains("on");
      allElements.pumpToggle.classList.toggle("on", on);
      const label = on ? "On" : "Off";
      if (allElements.pumpToggleLabel) allElements.pumpToggleLabel.textContent = label;
      if (allElements.pumpMain) allElements.pumpMain.textContent = label;
      publishMessage(TOPIC_CMD_PUMP_POWER, on ? "on" : "off");
    });
  }

  if (allElements.pumpSlider) {
    allElements.pumpSlider.addEventListener("input", () => {
      const v = Number(allElements.pumpSlider.value);
      if (allElements.pumpValue) allElements.pumpValue.textContent = `${v}%`;
      updateSliderFill(allElements.pumpSlider, "#3b82f6");
      if (allElements.pumpCard)
        allElements.pumpCard.style.setProperty("--pump-level", v + "%");
    });
    allElements.pumpSlider.addEventListener("change", () => {
      if (!hasFirstStatus || !isManualMode) return;
      publishMessage(TOPIC_CMD_PUMP_SPEED, allElements.pumpSlider.value);
    });
  }

  if (allElements.heatSlider) {
    allElements.heatSlider.addEventListener("input", () => {
      const v = Number(allElements.heatSlider.value);
      if (allElements.heatValue) allElements.heatValue.textContent = `${v}%`;
      updateSliderFill(allElements.heatSlider, "#f97316");

      if (!allElements.heatCard) return;

      if (v === 0) {
        allElements.heatCard.style.background = "#f9fafb";
        allElements.heatCard.style.borderColor = "#e5e7eb";
        allElements.heatCard.style.boxShadow = "0 10px 24px rgba(15,23,42,0.14)";
        return;
      }
      const r = v / 50;
      const alpha = 0.15 + 0.35 * r;
      const shadow = 12 + 18 * r;
      const borderAlpha = 0.3 + 0.5 * r;
      allElements.heatCard.style.background = `radial-gradient(circle at 0% 0%, rgba(249,115,22,${alpha}), #fefce8 50%, #f9fafb 100%)`;
      allElements.heatCard.style.borderColor = `rgba(248,171,89,${borderAlpha})`;
      allElements.heatCard.style.boxShadow = `0 ${shadow}px ${shadow * 2}px rgba(248,171,89,0.6)`;
    });

    allElements.heatSlider.addEventListener("change", () => {
      if (!hasFirstStatus || !isManualMode) return;
      publishMessage(TOPIC_CMD_HEAT_LEVEL, allElements.heatSlider.value);
    });
  }

  if (allElements.humidToggle) {
    allElements.humidToggle.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      const on = !allElements.humidToggle.classList.contains("on");
      allElements.humidToggle.classList.toggle("on", on);
      if (allElements.humidToggleLabel)
        allElements.humidToggleLabel.textContent = on ? "On" : "Off";
      publishMessage(TOPIC_CMD_HUMIDIFIER_POWER, on ? "on" : "off");
    });
  }

  if (allElements.fillToggle) {
    allElements.fillToggle.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      const on = !allElements.fillToggle.classList.contains("on");
      allElements.fillToggle.classList.toggle("on", on);
      if (allElements.fillToggleLabel)
        allElements.fillToggleLabel.textContent = on ? "On" : "Off";
      publishMessage(TOPIC_CMD_FILL_VALVE_POWER, on ? "on" : "off");
    });
  }

  if (allElements.flowerToggle) {
    allElements.flowerToggle.addEventListener("click", () => {
      if (!hasFirstStatus || !isManualMode) return;
      const on = !allElements.flowerToggle.classList.contains("on");
      allElements.flowerToggle.classList.toggle("on", on);
      if (allElements.flowerToggleLabel)
        allElements.flowerToggleLabel.textContent = on ? "On" : "Off";
      publishMessage(TOPIC_CMD_FLOWER_VALVE_POWER, on ? "on" : "off");
    });
  }
}

// =====================
// INIT (RUN AFTER DOM READY)
// =====================
function init() {
  // sliders initial fill
  [allElements.fanSlider, allElements.pumpSlider, allElements.heatSlider].forEach(
    (s) => s && updateSliderFill(s)
  );

  bindEvents();

  setInterval(updateClock, 1000);
  updateClock();

  window.addEventListener("load", () => setTimeout(hideSplash, 1500));

  startConnect();
}

document.addEventListener("DOMContentLoaded", init);
