// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084; // WSS (browser)
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).substr(2, 8);

const TOPIC_CMD_FAN         = "sera/comenzi/ventilator";
const TOPIC_CMD_MODE        = "sera/comenzi/mod";
const TOPIC_CMD_LAMP_POWER  = "sera/comenzi/lampa/power";
const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity";
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";
const TOPIC_CMD_PUMP_POWER  = "sera/comenzi/pompa/power";
const TOPIC_CMD_PUMP_SPEED  = "sera/comenzi/pompa/speed";
const TOPIC_CMD_HEAT_LEVEL  = "sera/comenzi/incalzire/level";
const TOPIC_CMD_HUMIDIFIER  = "sera/comenzi/umidificator/power";
const TOPIC_STAT_SENZORI    = "sera/stare/senzori";

// =====================
// STATE
// =====================
let isManualMode     = false;
let hasFirstStatus   = false;
let waterLocked      = false;

// =====================
// DOM ELEMENTS (Sintaxă Corectată)
// =====================
const allElements = {
    btnAuto: document.getElementById("btn-auto"),
    btnManual: document.getElementById("btn-manual"),
    controlsCard: document.getElementById("controls-card"),
    fanSlider: document.getElementById("fan-slider"),
    fanValue: document.getElementById("fan-value"),
    fanVisual: document.getElementById("fan-visual"),
    tempMain: document.getElementById("temp-main"),
    humidLine: document.getElementById("humid-line"),
    metricTemp: document.getElementById("metric-temp"),
    metricWater: document.getElementById("metric-water"),
    statusPill: document.getElementById("status-pill"),
    statusText: document.getElementById("status-text"),
    lampToggle: document.getElementById("lamp-toggle"),
    lampMain: document.getElementById("lamp-main"),
    lampIntensityUp: document.getElementById("lamp-intensity-up"),
    lampIntensityDown: document.getElementById("lamp-intensity-down"),
    lampColorBtn: document.getElementById("lamp-color-btn"),
    pumpToggle: document.getElementById("pump-toggle"),
    pumpSlider: document.getElementById("pump-slider"),
    pumpCard: document.getElementById("pump-card"),
    heatSlider: document.getElementById("heat-slider"),
    heatValue: document.getElementById("heat-value"),
    heatCard: document.getElementById("heat-card"), // Virgulă corectată
    humToggle: document.getElementById("hum-toggle"),
    humMain: document.getElementById("hum-main"),
    steamContainer: document.getElementById("steam-container"),
    ipLabel: document.getElementById("ip-label"),
    lastUpdate: document.getElementById("last-update")
};

// =====================
// MQTT CLIENT
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// =====================
// CALLBACKS
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

        // 1. Senzori (Actualizare UI)
        if (data.temp !== undefined) allElements.tempMain.innerHTML = `${data.temp.toFixed(1)}<span>°C</span>`;
        if (data.hum !== undefined) allElements.humidLine.textContent = `${data.hum.toFixed(0)} % Air Humidity`;
        if (data.water !== undefined) allElements.metricWater.textContent = data.water.toFixed(0);
        
        waterLocked = (data.water_lock === 1);
        allElements.statusText.textContent = waterLocked ? "TANK EMPTY (LOCKED)" : "Live connected";
        allElements.statusPill.classList.toggle("disconnected", waterLocked);

        // 2. Sincronizare Actuatori (Feedback de la ESP32)
        // Fan
        if (document.activeElement !== allElements.fanSlider) {
            allElements.fanSlider.value = data.fan_pct || 0;
            allElements.fanValue.textContent = `${data.fan_pct || 0}%`;
        }
        // Heat
        if (document.activeElement !== allElements.heatSlider) {
            allElements.heatSlider.value = data.heat_pct || 0;
            allElements.heatValue.textContent = `${data.heat_pct || 0}%`;
        }
        // Lamp Power
        const lampOn = (data.lamp_power === 1);
        allElements.lampToggle.classList.toggle("on", lampOn);
        allElements.lampMain.textContent = lampOn ? "On" : "Off";

        // Humidifier Power
        const humOn = (data.hum_power === 1);
        allElements.humToggle.classList.toggle("on", humOn);
        allElements.humMain.textContent = humOn ? "On" : "Off";
        allElements.steamContainer.classList.toggle("steam-hidden", !humOn);

        // Pump Power
        const pumpOn = (data.pump_power === 1);
        allElements.pumpToggle.classList.toggle("on", pumpOn);
        allElements.pumpCard.classList.toggle("locked", waterLocked);

        // 3. Mod System
        setModeUI(data.mode === "manual", false);
        if (data.ip) allElements.ipLabel.textContent = data.ip;
        
        hasFirstStatus = true;
    } catch (e) { console.error("Data parse error", e); }
}

// =====================
// CONTROL FUNCTIONS
// =====================
function publishMessage(topic, payload) {
    if (!client.isConnected()) return;
    const m = new Paho.MQTT.Message(String(payload));
    m.destinationName = topic;
    client.send(m);
}

function setModeUI(manual, publish) {
    isManualMode = manual;
    allElements.btnManual.classList.toggle("active", manual);
    allElements.btnAuto.classList.toggle("active", !manual);
    allElements.controlsCard.classList.toggle("hidden", !manual);
    if (publish) publishMessage(TOPIC_CMD_MODE, manual ? "manual" : "auto");
}

// =====================
// EVENT LISTENERS (Securizate și Mutate)
// =====================
allElements.btnAuto.addEventListener("click", () => setModeUI(false, true));
allElements.btnManual.addEventListener("click", () => setModeUI(true, true));

// FAN & HEAT Sliders
allElements.fanSlider.addEventListener("change", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
});
allElements.heatSlider.addEventListener("change", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_HEAT_LEVEL, allElements.heatSlider.value);
});

// LAMP Control
allElements.lampToggle.addEventListener("click", () => {
    if (!isManualMode) return;
    const isCurrentlyOn = allElements.lampToggle.classList.contains("on");
    publishMessage(TOPIC_CMD_LAMP_POWER, isCurrentlyOn ? "off" : "on");
});
allElements.lampIntensityUp.addEventListener("click", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_LAMP_BRIGHT, "up");
});
allElements.lampIntensityDown.addEventListener("click", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_LAMP_BRIGHT, "down");
});
allElements.lampColorBtn.addEventListener("click", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");
});

// PUMP Control
allElements.pumpToggle.addEventListener("click", () => {
    if (!isManualMode || waterLocked) return;
    const isCurrentlyOn = allElements.pumpToggle.classList.contains("on");
    publishMessage(TOPIC_CMD_PUMP_POWER, isCurrentlyOn ? "off" : "on");
});

// HUMIDIFIER Control
allElements.humToggle.addEventListener("click", () => {
    if (!isManualMode) return;
    const isCurrentlyOn = allElements.humToggle.classList.contains("on");
    publishMessage(TOPIC_CMD_HUMIDIFIER, isCurrentlyOn ? "off" : "on");
});

// =====================
// INITIALIZATION
// =====================
function startConnect() {
    client.connect({ 
        onSuccess: onConnect, 
        useSSL: true, 
        onFailure: () => setTimeout(startConnect, 5000) 
    });
}

startConnect();
