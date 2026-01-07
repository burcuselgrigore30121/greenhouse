// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084; // WSS
const MQTT_USER = "";
const MQTT_PASS = "";
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).slice(2);

// Topics (site <-> device)
const TOPIC_CMD_MODE        = "sera/comenzi/mod";
const TOPIC_CMD_FAN         = "sera/comenzi/ventilator";

const TOPIC_CMD_PUMP_POWER  = "sera/comenzi/pompa/power";
const TOPIC_CMD_PUMP_SPEED  = "sera/comenzi/pompa/speed";

const TOPIC_CMD_HEAT_LEVEL  = "sera/comenzi/incalzire/level";

const TOPIC_CMD_LAMP_POWER  = "sera/comenzi/lampa/power";
const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity"; // ms ca string, ex "800"
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";     // "cycle"

const TOPIC_STAT_SENZORI    = "sera/stare/senzori";

// =====================
// DOM
// =====================
const el = {
  btnAuto: document.getElementById("btn-auto"),
  btnManual: document.getElementById("btn-manual"),
  modeChip: document.getElementById("mode-chip"),
  statusPill: document.getElementById("status-pill"),
  statusText: document.getElementById("status-text"),
  ipLabel: document.getElementById("ip-label"),
  lastUpdate: document.getElementById("last-update"),
  topDate: document.getElementById("top-date"),
  topTime: document.getElementById("top-time"),

  controlsCard: document.getElementById("controls-card"),

  // Overview
  tempMain: document.getElementById("temp-main"),
  humidLine: document.getElementById("humid-line"),
  lightLine: document.getElementById("light-line"),
  pressLine: document.getElementById("press-line"),

  metricTemp: document.getElementById("metric-temp"),
  metricHum: document.getElementById("metric-hum"),
  metricLight: document.getElementById("metric-light"),
  metricSoil: document.getElementById("metric-soil"),

  metricTempTag: document.getElementById("metric-temp-tag"),
  metricHumTag: document.getElementById("metric-hum-tag"),
  metricLightTag: document.getElementById("metric-light-tag"),
  metricSoilTag: document.getElementById("metric-soil-tag"),

  // Fan
  fanSlider: document.getElementById("fan-slider"),
  fanMain: document.getElementById("fan-main"),

  // Lamp
  lampToggle: document.getElementById("lamp-toggle"),
  lampToggleLabel: document.getElementById("lamp-toggle-label"),
  lampMain: document.getElementById("lamp-main"),
  lampIntensityBtn: document.getElementById("lamp-intensity-btn"),
  lampColorBtn: document.getElementById("lamp-color-btn"),

  // Pump
  pumpToggle: document.getElementById("pump-toggle"),
  pumpToggleLabel: document.getElementById("pump-toggle-label"),
  pumpMain: document.getElementById("pump-main"),
  pumpSlider: document.getElementById("pump-slider"),
  pumpValue: document.getElementById("pump-value"),

  // Heat
  heatSlider: document.getElementById("heat-slider"),
  heatValue: document.getElementById("heat-value"),
};

let isManualMode = false;
let hasFirstStatus = false;

// =====================
// Helpers (labels)
// =====================
function tag(txt, cls) { return { txt, cls }; }

function labelTemp(t){
  if (t >= 20 && t <= 28) return tag("Optimal", "good");
  if (t < 18) return tag("Too cold", "bad");
  return tag("Too hot", "bad");
}
function labelHum(h){
  if (h >= 40 && h <= 70) return tag("OK", "good");
  if (h < 35) return tag("Dry", "bad");
  return tag("Too humid", "bad");
}
function labelLight(lx){
  if (lx < 200) return tag("Low", "bad");
  if (lx < 800) return tag("Medium", "good");
  return tag("High", "good");
}
function labelSoil(s){
  if (s >= 40 && s <= 80) return tag("Moist", "good");
  if (s < 40) return tag("Dry", "bad");
  return tag("Too wet", "bad");
}

function setModeUI(manual, publish){
  isManualMode = manual;

  el.btnManual.classList.toggle("active", manual);
  el.btnAuto.classList.toggle("active", !manual);

  el.modeChip.textContent = manual ? "MANUAL" : "AUTO";
  el.controlsCard.classList.toggle("hidden", !manual);

  if (publish) publishMessage(TOPIC_CMD_MODE, manual ? "manual" : "auto");
}

function setToggleUI(btn, labelEl, mainEl, on){
  btn.classList.toggle("on", on);
  const txt = on ? "On" : "Off";
  labelEl.textContent = txt;
  mainEl.textContent = txt;
}

function nowHMS(){
  const d = new Date();
  return d.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
}

// =====================
// Clock
// =====================
function updateClock() {
  const d = new Date();
  el.topDate.textContent = d.toLocaleDateString("en-GB", {weekday:"short", day:"2-digit", month:"short", year:"numeric"});
  el.topTime.textContent = d.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit"});
}
setInterval(updateClock, 1000);
updateClock();

// =====================
// MQTT
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

function startConnect(){
  el.statusText.textContent = "Connecting...";
  el.statusPill.classList.add("disconnected");
  client.connect({
    onSuccess: onConnect,
    useSSL: true,
    userName: MQTT_USER,
    password: MQTT_PASS,
    onFailure: () => {
      el.statusText.textContent = "Error";
      setTimeout(startConnect, 3000);
    }
  });
}

function onConnect(){
  client.subscribe(TOPIC_STAT_SENZORI);
  el.statusText.textContent = "Live connected";
  el.statusPill.classList.remove("disconnected");
}

function onConnectionLost(res){
  if (res.errorCode !== 0){
    el.statusText.textContent = "Disconnected";
    el.statusPill.classList.add("disconnected");
    setTimeout(startConnect, 2000);
  }
}

function publishMessage(topic, payload){
  if (!client.isConnected()) return;
  const m = new Paho.MQTT.Message(String(payload));
  m.destinationName = topic;
  client.send(m);
}

function onMessageArrived(message){
  try{
    const data = JSON.parse(message.payloadString);

    // Sensors
    const t = Number(data.temp ?? NaN);
    const h = Number(data.hum ?? NaN);
    const lx = Number(data.light ?? NaN);
    const soil = Number(data.soil ?? NaN);
    const press = Number(data.press ?? NaN);

    if (Number.isFinite(t)){
      el.tempMain.innerHTML = `${t.toFixed(1)}<span>°C</span>`;
      el.metricTemp.textContent = t.toFixed(1);
      const lt = labelTemp(t);
      el.metricTempTag.textContent = lt.txt;
      el.metricTempTag.className = "metric-tag " + lt.cls;
    }

    if (Number.isFinite(h)){
      el.metricHum.textContent = h.toFixed(0);
      const lh = labelHum(h);
      el.metricHumTag.textContent = lh.txt;
      el.metricHumTag.className = "metric-tag " + lh.cls;
    }

    if (Number.isFinite(lx)){
      el.metricLight.textContent = lx.toFixed(0);
      const ll = labelLight(lx);
      el.metricLightTag.textContent = ll.txt;
      el.metricLightTag.className = "metric-tag " + ll.cls;
    }

    if (Number.isFinite(soil)){
      el.metricSoil.textContent = soil.toFixed(0);
      const ls = labelSoil(soil);
      el.metricSoilTag.textContent = ls.txt;
      el.metricSoilTag.className = "metric-tag " + ls.cls;
    }

    el.humidLine.textContent = `Air: ${Number.isFinite(h) ? h.toFixed(0) : "--"} % · Soil: ${Number.isFinite(soil) ? soil.toFixed(0) : "--"} %`;
    el.lightLine.textContent = `Light: ${Number.isFinite(lx) ? lx.toFixed(0) : "--"} lx`;
    el.pressLine.textContent = `Pressure: ${Number.isFinite(press) ? press.toFixed(0) : "--"} hPa`;

    // Mode
    const manualFromDevice = (data.mode === "manual");
    setModeUI(manualFromDevice, false);

    // Fan sync
    if (typeof data.fan_pct === "number" && document.activeElement !== el.fanSlider){
      el.fanSlider.value = String(data.fan_pct);
      el.fanMain.textContent = `${data.fan_pct}%`;
    }

    // Pump sync
    if (typeof data.pump_on === "number"){
      setToggleUI(el.pumpToggle, el.pumpToggleLabel, el.pumpMain, data.pump_on === 1);
    }
    if (typeof data.pump_pct === "number" && document.activeElement !== el.pumpSlider){
      el.pumpSlider.value = String(data.pump_pct);
      el.pumpValue.textContent = `${data.pump_pct}%`;
    }

    // Heat sync
    if (typeof data.heat_pct === "number" && document.activeElement !== el.heatSlider){
      el.heatSlider.value = String(data.heat_pct);
      el.heatValue.textContent = `${data.heat_pct}%`;
    }

    // Lamp sync
    if (typeof data.lamp_on === "number"){
      setToggleUI(el.lampToggle, el.lampToggleLabel, el.lampMain, data.lamp_on === 1);
    }

    // Meta
    if (data.ip) el.ipLabel.textContent = data.ip;
    el.lastUpdate.textContent = nowHMS();

    hasFirstStatus = true;
  }catch(e){
    console.error("JSON parse error:", e);
  }
}

// =====================
// UI events
// =====================
el.btnAuto.addEventListener("click", () => setModeUI(false, true));
el.btnManual.addEventListener("click", () => setModeUI(true, true));

// Fan
el.fanSlider.addEventListener("input", () => {
  el.fanMain.textContent = `${el.fanSlider.value}%`;
});
el.fanSlider.addEventListener("change", () => {
  if (!isManualMode) return;
  publishMessage(TOPIC_CMD_FAN, el.fanSlider.value);
});

// Lamp
el.lampToggle.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  const on = !el.lampToggle.classList.contains("on");
  setToggleUI(el.lampToggle, el.lampToggleLabel, el.lampMain, on);
  publishMessage(TOPIC_CMD_LAMP_POWER, on ? "on" : "off");
});
el.lampIntensityBtn.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  publishMessage(TOPIC_CMD_LAMP_BRIGHT, "800"); // ms
});
el.lampColorBtn.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");
});

// Pump
el.pumpToggle.addEventListener("click", () => {
  if (!hasFirstStatus) return;
  const on = !el.pumpToggle.classList.contains("on");
  setToggleUI(el.pumpToggle, el.pumpToggleLabel, el.pumpMain, on);
  publishMessage(TOPIC_CMD_PUMP_POWER, on ? "on" : "off");
});
el.pumpSlider.addEventListener("input", () => {
  el.pumpValue.textContent = `${el.pumpSlider.value}%`;
});
el.pumpSlider.addEventListener("change", () => {
  if (!hasFirstStatus) return;
  publishMessage(TOPIC_CMD_PUMP_SPEED, el.pumpSlider.value);
});

// Heat
el.heatSlider.addEventListener("input", () => {
  el.heatValue.textContent = `${el.heatSlider.value}%`;
});
el.heatSlider.addEventListener("change", () => {
  if (!hasFirstStatus) return;
  publishMessage(TOPIC_CMD_HEAT_LEVEL, el.heatSlider.value);
});

// Init
startConnect();
