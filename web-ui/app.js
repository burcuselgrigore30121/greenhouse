// app.js

// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084; // WSS
const MQTT_USER = "";
const MQTT_PASS = "";
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).substr(2, 8);

// STATUS
const TOPIC_STAT_SENZORI = "sera/stare/senzori";

// COMMANDS (manual)
const TOPIC_CMD_MODE = "sera/comenzi/mod";
const TOPIC_CMD_FAN  = "sera/comenzi/ventilator";

const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity"; // numeric step (e.g. "80")
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";     // "cycle"

const TOPIC_CMD_PUMP_POWER  = "sera/comenzi/pompa/power";     // "on"/"off"
const TOPIC_CMD_PUMP_SPEED  = "sera/comenzi/pompa/speed";     // 0..100

const TOPIC_CMD_HEAT_LEVEL  = "sera/comenzi/incalzire/level"; // 0..50

const TOPIC_CMD_HUMIDIFIER_POWER = "sera/comenzi/umidificator/power"; // "on"/"off"
const TOPIC_CMD_FILL_VALVE_POWER = "sera/comenzi/valva/umplere/power"; // "on"/"off"
const TOPIC_CMD_FLOWER_VALVE_POWER = "sera/comenzi/valva/flori/power"; // "on"/"off"

// =====================
// WATER TANK CONFIG (ultrasonic)
// =====================
// Calibrezi cu rigla: distanta in cm de la senzor la apa
// GOL => distanta mai mare, PLIN => distanta mai mica
const TANK_CM_EMPTY = 16.0; // minim: 16 cm (gol)
const TANK_CM_FULL  = 2.0;  // maxim: 2 cm (plin)

const ULTRA_DEADBAND_CM = 2.0;  // eroare ±2 cm
const ULTRA_WINDOW = 6;         // min/max window
const TANK_STEP_PCT = 5;        // “portiuni”: 5% trepte

let ultraBuf = [];
let ultraStable = null;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function ultraToPct(cm) {
  const pct = (TANK_CM_EMPTY - cm) * 100 / (TANK_CM_EMPTY - TANK_CM_FULL);
  return clamp(pct, 0, 100);
}
function quantizePct(pct) {
  return clamp(Math.round(pct / TANK_STEP_PCT) * TANK_STEP_PCT, 0, 100);
}
function pushUltra(cm) {
  ultraBuf.push(cm);
  if (ultraBuf.length > ULTRA_WINDOW) ultraBuf.shift();
}
function bufMinMax() {
  let mn = ultraBuf[0], mx = ultraBuf[0];
  for (let i = 1; i < ultraBuf.length; i++) {
    const v = ultraBuf[i];
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return { mn, mx };
}
function filteredUltra(cm) {
  // HOLD: dacă noua măsurare nu se schimbă cu >= 2 cm, păstrăm valoarea veche
  if (ultraStable === null) {
    ultraStable = cm;
    ultraBuf = [cm];
    return { stable: cm, usedAvg: false };
  }

  pushUltra(cm);

  // dacă schimbarea e mică -> nu actualizăm deloc
  if (Math.abs(cm - ultraStable) < ULTRA_DEADBAND_CM) {
    return { stable: ultraStable, usedAvg: true };
  }

  // schimbare suficientă -> folosim mediană din buffer ca să evităm spike-uri
  const sorted = ultraBuf.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  ultraStable = med;
  return { stable: med, usedAvg: false };
}

  pushUltra(cm);
  const { mn, mx } = bufMinMax();

  if (Math.abs(cm - ultraStable) < ULTRA_DEADBAND_CM) {
    const avg = 0.5 * (mn + mx);
    ultraStable = avg;
    return { stable: avg, usedAvg: true };
  }
  ultraStable = cm;
  return { stable: cm, usedAvg: false };
}
function renderTank(cm, usedAvg) {
  if (!allElements.tankCard) return;
  const pct = quantizePct(ultraToPct(cm));
  allElements.tankPct.textContent = pct.toFixed(0);
  allElements.tankCm.textContent = `${cm.toFixed(1)} cm`;
  allElements.tankStable.textContent = usedAvg ? "avg(min,max)" : "live";
  allElements.tankCard.style.setProperty("--tank-level", pct + "%");
}

// =====================
// STATE
// =====================
let isManualMode   = false;
let hasFirstStatus = false;

// =====================
// DOM
// =====================
const allElements = {
  btnAuto: document.getElementById("btn-auto"),
  btnManual: document.getElementById("btn-manual"),
  controlsCard: document.getElementById("controls-card"),

  // fan
  fanSlider: document.getElementById("fan-slider"),
  fanValue: document.getElementById("fan-value"),
  fanVisual: document.getElementById("fan-visual"),

  // overview
  tempMain: document.getElementById("temp-main"),
  humidLine: document.getElementById("humid-line"),
  lightLine: document.getElementById("light-line"),

  metricTemp: document.getElementById("metric-temp"),
  metricLight: document.getElementById("metric-light"),
  metricSoil: document.getElementById("metric-soil"),
  metricWater: document.getElementById("metric-water"),

  metricTempTag: document.getElementById("metric-temp-tag"),
  metricLightTag: document.getElementById("metric-light-tag"),
  metricSoilTag: document.getElementById("metric-soil-tag"),
  metricWaterTag: document.getElementById("metric-water-tag"),

  healthValue: document.getElementById("health-value"),
  healthBadge: document.getElementById("health-badge"),
  healthBarFill: document.getElementById("health-bar-fill"),

  modeChip: document.getElementById("mode-chip"),
  ipLabel: document.getElementById("ip-label"),
  lastUpdate: document.getElementById("last-update"),
  topDate: document.getElementById("top-date"),
  topTime: document.getElementById("top-time"),
  statusPill: document.getElementById("status-pill"),
  statusText: document.getElementById("status-text"),
  splash: document.getElementById("splash"),
  overviewCard: document.getElementById("overview-card"),

  // tank
  tankCard: document.getElementById("tank-card"),
  tankPct: document.getElementById("tank-pct"),
  tankCm: document.getElementById("tank-cm"),
  tankStable: document.getElementById("tank-stable"),

  // lamp
  lampMain: document.getElementById("lamp-main"),
  lampIntensityBtn: document.getElementById("lamp-intensity-btn"),
  lampColorBtn: document.getElementById("lamp-color-btn"),
  lampCard: document.getElementById("lamp-card"),

  // pump
  pumpToggle: document.getElementById("pump-toggle"),
  pumpToggleLabel: document.getElementById("pump-toggle-label"),
  pumpMain: document.getElementById("pump-main"),
  pumpSlider: document.getElementById("pump-slider"),
  pumpValue: document.getElementById("pump-value"),
  pumpCard: document.getElementById("pump-card"),

  // heat
  heatSlider: document.getElementById("heat-slider"),
  heatValue: document.getElementById("heat-value"),
  heatCard: document.getElementById("heat-card"),

  // extra
  humidToggle: document.getElementById("humid-toggle"),
  humidToggleLabel: document.getElementById("humid-toggle-label"),
  fillToggle: document.getElementById("fill-toggle"),
  fillToggleLabel: document.getElementById("fill-toggle-label"),
  flowerToggle: document.getElementById("flower-toggle"),
  flowerToggleLabel: document.getElementById("flower-toggle-label"),
};

// =====================
// MQTT CLIENT
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// =====================
// SPLASH
// =====================
function hideSplash() {
  if (allElements.splash) allElements.splash.classList.add("hide");
}
window.addEventListener("load", () => setTimeout(hideSplash, 1500));

// =====================
// CLOCK
// =====================
function updateClock() {
  const d = new Date();
  allElements.topDate.textContent = d.toLocaleDateString("en-GB", {
    weekday:"short", day:"2-digit", month:"short", year:"numeric"
  });
  allElements.topTime.textContent = d.toLocaleTimeString("en-GB", {
    hour:"2-digit", minute:"2-digit"
  });
}

// =====================
// LABEL HELPERS
// =====================
function labelForTemp(t) {
  if (t >= 20 && t <= 28) return {txt:"Optimal", cls:"good"};
  if (t < 18) return {txt:"Too cold", cls:"bad"};
  return {txt:"Too hot", cls:"bad"};
}
function labelForSoil(s) {
  if (s >= 40 && s <= 80) return {txt:"Moist", cls:"good"};
  if (s < 40) return {txt:"Dry", cls:"bad"};
  return {txt:"Too wet", cls:"bad"};
}
function labelForWater(w) {
  if (w >= 40 && w <= 90) return {txt:"OK", cls:"good"};
  if (w < 40) return {txt:"Low", cls:"bad"};
  return {txt:"OK", cls:"good"};
}
function labelForLight(lx) {
  if (lx < 200) return {txt:"Low", cls:"bad"};
  if (lx < 800) return {txt:"Medium", cls:"good"};
  return {txt:"High", cls:"good"};
}
function healthFromSensors(temp, soil, water) {
  let score = 100;
  if (temp < 18 || temp > 30) score -= 25;
  if (soil < 30 || soil > 80) score -= 25;
  if (water < 30 || water > 90) score -= 20;
  return Math.max(0, Math.min(100, score));
}

// =====================
// SLIDER HELPERS
// =====================
function updateSliderFill(slider, colorOverride) {
  if (!slider) return;
  const min = slider.min ? Number(slider.min) : 0;
  const max = slider.max ? Number(slider.max) : 100;
  const val = ((Number(slider.value) - min) * 100) / (max - min);
  const c = colorOverride || "var(--accent)";
  slider.style.background =
    `linear-gradient(90deg, ${c} 0%, ${c} ${val}%, #e5e7eb ${val}%, #e5e7eb 100%)`;
}

// =====================
// MQTT CALLBACKS
// =====================
function onConnect() {
  client.subscribe(TOPIC_STAT_SENZORI);
  allElements.statusText.textContent = "Live connected";
  allElements.statusPill.classList.remove("disconnected");
}

function onConnectionLost(res) {
  if (res.errorCode !== 0) {
    allElements.statusText.textContent = "Disconnected";
    allElements.statusPill.classList.add("disconnected");
    setTimeout(startConnect, 3000);
  }
}

function onMessageArrived(message) {
  try {
    const data = JSON.parse(message.payloadString);

    // basics (existing UI)
    const t = Number(data.temp);
    const light = Number(data.light);
    const soil = Number(data.soil);
    const water = Number(data.water);
    const lightOut = Number(data.light_out); // TEMT6000 (%)
    const humAir = Number(data.hum_air);

    if (isFinite(t)) {
      allElements.tempMain.innerHTML = `${t.toFixed(1)}<span>°C</span>`;
      allElements.metricTemp.textContent = t.toFixed(1);
      const lt = labelForTemp(t);
      allElements.metricTempTag.textContent = lt.txt;
      allElements.metricTempTag.className = "metric-tag " + lt.cls;
    }

    if (isFinite(light)) {
      allElements.lightLine.textContent = `Light: ${light} lx`;
      allElements.metricLight.textContent = light.toFixed(0);
      const ll = labelForLight(light);
      allElements.metricLightTag.textContent = ll.txt;
      allElements.metricLightTag.className = "metric-tag " + ll.cls;
    }

   // Air / soil humidity (folosește real hum_air dacă există)
if (isFinite(soil)) {
  if (isFinite(humAir)) {
    allElements.humidLine.textContent =
      `${humAir.toFixed(0)} % / ${soil.toFixed(0)} %`;
  } else {
    allElements.humidLine.textContent =
      `-- % / ${soil.toFixed(0)} %`;
  }
} else {
  allElements.humidLine.textContent = `-- % / -- %`;
}


// Light line: interior lux + exterior %
if (isFinite(light) && isFinite(lightOut)) {
  allElements.lightLine.textContent = `Light (in): ${light.toFixed(0)} lx · Light (out): ${lightOut.toFixed(0)} %`;
} else if (isFinite(light)) {
  allElements.lightLine.textContent = `Light: ${light.toFixed(0)} lx`;
} else {
  allElements.lightLine.textContent = `Light: -- lx`;
}


    if (isFinite(water)) {
      allElements.metricWater.textContent = water.toFixed(0);
      const lw = labelForWater(water);
      allElements.metricWaterTag.textContent = lw.txt;
      allElements.metricWaterTag.className = "metric-tag " + lw.cls;
    }

    if (isFinite(t) && isFinite(soil) && isFinite(water)) {
      const health = healthFromSensors(t, soil, water);
      allElements.healthValue.textContent = `${health}%`;
      allElements.healthBarFill.style.width = `${health}%`;
      if (health >= 80) allElements.healthBadge.textContent = "Very good";
      else if (health >= 60) allElements.healthBadge.textContent = "OK";
      else allElements.healthBadge.textContent = "Attention";
    }

    // mode from device
    const manualFromDevice = (data.mode === "manual");
    setModeUI(manualFromDevice, false);

    // sync fan slider
    if (typeof data.fan_pct === "number" && document.activeElement !== allElements.fanSlider) {
      allElements.fanSlider.value = data.fan_pct;
      allElements.fanValue.textContent = `${data.fan_pct}%`;
      updateSliderFill(allElements.fanSlider);
      updateFanVisual();
    }

    // ultrasonic tank
    if (typeof data.ultra_cm === "number" && isFinite(data.ultra_cm)) {
      const r = filteredUltra(data.ultra_cm);
      renderTank(r.stable, r.usedAvg);
    }

    if (data.ip) allElements.ipLabel.textContent = data.ip;

    const now = new Date();
    allElements.lastUpdate.textContent =
      now.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", second:"2-digit"});

    hasFirstStatus = true;
    hideSplash();
  } catch (e) {
    console.error("JSON parse error:", e);
  }
}

// =====================
// MQTT CONNECT
// =====================
function startConnect() {
  allElements.statusText.textContent = "Connecting...";
  allElements.statusPill.classList.add("disconnected");
  client.connect({
    onSuccess: onConnect,
    useSSL: true,
    userName: MQTT_USER,
    password: MQTT_PASS,
    onFailure: () => {
      allElements.statusText.textContent = "Error";
      setTimeout(startConnect, 5000);
    }
  });
}

function publishMessage(topic, payload) {
  if (!client.isConnected()) return;
  const m = new Paho.MQTT.Message(payload.toString());
  m.destinationName = topic;
  client.send(m);
}

// =====================
// MODE AUTO / MANUAL
// =====================
function setModeUI(manual, publish) {
  isManualMode = !!manual;

  if (isManualMode) {
    allElements.btnManual.classList.add("active");
    allElements.btnAuto.classList.remove("active");
    if (allElements.modeChip) allElements.modeChip.textContent = "MANUAL";
    allElements.controlsCard.classList.remove("hidden");
    allElements.overviewCard.classList.add("manual-mode");
  } else {
    allElements.btnManual.classList.remove("active");
    allElements.btnAuto.classList.add("active");
    if (allElements.modeChip) allElements.modeChip.textContent = "AUTO";
    allElements.controlsCard.classList.add("hidden");
    allElements.overviewCard.classList.remove("manual-mode");
    resetManualControls();
  }

  updateSliderFill(allElements.fanSlider);
  updateFanVisual();

  if (publish) {
    publishMessage(TOPIC_CMD_MODE, isManualMode ? "manual" : "auto");
    if (isManualMode) publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
  }
}

// =====================
// FAN
// =====================
function updateFanVisual() {
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

// =====================
// RESET MANUAL
// =====================
function resetManualControls() {
  // FAN
  allElements.fanSlider.value = 0;
  allElements.fanValue.textContent = "0%";
  updateSliderFill(allElements.fanSlider);
  updateFanVisual();

  // PUMP
  allElements.pumpToggle.classList.remove("on");
  allElements.pumpToggleLabel.textContent = "Off";
  allElements.pumpMain.textContent = "Off";
  allElements.pumpSlider.value = 0;
  allElements.pumpValue.textContent = "0%";
  updateSliderFill(allElements.pumpSlider, "#3b82f6");
  allElements.pumpCard.style.setProperty("--pump-level", "0%");

  // HEAT
  allElements.heatSlider.value = 0;
  allElements.heatValue.textContent = "0%";
  allElements.heatCard.style.background = "#f9fafb";
  allElements.heatCard.style.borderColor = "#e5e7eb";
  allElements.heatCard.style.boxShadow = "0 10px 24px rgba(15,23,42,0.14)";

  // EXTRA
  if (allElements.humidToggle) {
    allElements.humidToggle.classList.remove("on");
    allElements.humidToggleLabel.textContent = "Off";
  }
  if (allElements.fillToggle) {
    allElements.fillToggle.classList.remove("on");
    allElements.fillToggleLabel.textContent = "Off";
  }
  if (allElements.flowerToggle) {
    allElements.flowerToggle.classList.remove("on");
    allElements.flowerToggleLabel.textContent = "Off";
  }
}

// =====================
// EVENT LISTENERS
// =====================

// mode buttons
allElements.btnAuto.addEventListener("click", () => setModeUI(false, true));
allElements.btnManual.addEventListener("click", () => setModeUI(true, true));

// fan
allElements.fanSlider.addEventListener("input", () => {
  allElements.fanValue.textContent = `${allElements.fanSlider.value}%`;
  updateSliderFill(allElements.fanSlider);
  updateFanVisual();
});
allElements.fanSlider.addEventListener("change", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;
  publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
});

// lamp intensity
allElements.lampIntensityBtn.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;

  allElements.lampIntensityBtn.classList.add("active-hold");
  setTimeout(() => allElements.lampIntensityBtn.classList.remove("active-hold"), 220);

  publishMessage(TOPIC_CMD_LAMP_BRIGHT, "80");
});

// lamp color
allElements.lampColorBtn.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;

  publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");
  allElements.lampColorBtn.classList.add("pulse");
  setTimeout(() => allElements.lampColorBtn.classList.remove("pulse"), 220);
});

// pump toggle
allElements.pumpToggle.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;

  const on = !allElements.pumpToggle.classList.contains("on");
  allElements.pumpToggle.classList.toggle("on", on);
  const label = on ? "On" : "Off";
  allElements.pumpToggleLabel.textContent = label;
  allElements.pumpMain.textContent = label;

  publishMessage(TOPIC_CMD_PUMP_POWER, on ? "on" : "off");
});

// pump slider
allElements.pumpSlider.addEventListener("input", () => {
  const v = Number(allElements.pumpSlider.value);
  allElements.pumpValue.textContent = `${v}%`;
  updateSliderFill(allElements.pumpSlider, "#3b82f6");
  allElements.pumpCard.style.setProperty("--pump-level", v + "%");
});
allElements.pumpSlider.addEventListener("change", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;
  publishMessage(TOPIC_CMD_PUMP_SPEED, allElements.pumpSlider.value);
});

// heat slider (0..50)
allElements.heatSlider.addEventListener("input", () => {
  const v = Number(allElements.heatSlider.value);
  allElements.heatValue.textContent = `${v}%`;
  updateSliderFill(allElements.heatSlider, "#f97316");

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

  allElements.heatCard.style.background =
    `radial-gradient(circle at 0% 0%, rgba(249,115,22,${alpha}), #fefce8 50%, #f9fafb 100%)`;
  allElements.heatCard.style.borderColor = `rgba(248,171,89,${borderAlpha})`;
  allElements.heatCard.style.boxShadow = `0 ${shadow}px ${shadow*2}px rgba(248,171,89,0.6)`;
});
allElements.heatSlider.addEventListener("change", () => {
  if (!hasFirstStatus) return;
  if (!isManualMode) return;
  publishMessage(TOPIC_CMD_HEAT_LEVEL, allElements.heatSlider.value);
});

// humidifier toggle
if (allElements.humidToggle) {
  allElements.humidToggle.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    if (!isManualMode) return;

    const on = !allElements.humidToggle.classList.contains("on");
    allElements.humidToggle.classList.toggle("on", on);
    allElements.humidToggleLabel.textContent = on ? "On" : "Off";
    publishMessage(TOPIC_CMD_HUMIDIFIER_POWER, on ? "on" : "off");
  });
}

// fill valve toggle
if (allElements.fillToggle) {
  allElements.fillToggle.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    if (!isManualMode) return;

    const on = !allElements.fillToggle.classList.contains("on");
    allElements.fillToggle.classList.toggle("on", on);
    allElements.fillToggleLabel.textContent = on ? "On" : "Off";
    publishMessage(TOPIC_CMD_FILL_VALVE_POWER, on ? "on" : "off");
  });
}

// flower valve toggle
if (allElements.flowerToggle) {
  allElements.flowerToggle.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    if (!isManualMode) return;

    const on = !allElements.flowerToggle.classList.contains("on");
    allElements.flowerToggle.classList.toggle("on", on);
    allElements.flowerToggleLabel.textContent = on ? "On" : "Off";
    publishMessage(TOPIC_CMD_FLOWER_VALVE_POWER, on ? "on" : "off");
  });
}

// =====================
// INIT
// =====================
[allElements.fanSlider, allElements.pumpSlider, allElements.heatSlider].forEach(s => {
  if (s) updateSliderFill(s);
});

setInterval(updateClock, 1000);
updateClock();
startConnect();
