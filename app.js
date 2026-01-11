// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084; 
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).substr(2, 8);

const TOPIC_CMD_FAN         = "sera/comenzi/ventilator";
const TOPIC_CMD_MODE        = "sera/comenzi/mod";
const TOPIC_CMD_LAMP_POWER  = "sera/comenzi/lampa/power";
const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity";
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";
const TOPIC_CMD_PUMP_POWER  = "sera/comenzi/pompa/power";
const TOPIC_CMD_HEAT_LEVEL  = "sera/comenzi/incalzire/level";
const TOPIC_CMD_HUMIDIFIER  = "sera/comenzi/umidificator/power";
const TOPIC_STAT_SENZORI    = "sera/stare/senzori";

// =====================
// STATE
// =====================
let isManualMode = false;
let waterLocked  = false;

// =====================
// DOM ELEMENTS
// =====================
const el = {
    splash:         document.getElementById("splash"),
    btnAuto:        document.getElementById("btn-auto"),
    btnManual:      document.getElementById("btn-manual"),
    controlsCard:   document.getElementById("controls-card"),
    fanSlider:      document.getElementById("fan-slider"),
    fanValue:       document.getElementById("fan-value"),
    fanVisual:      document.getElementById("fan-visual"),
    tempMain:       document.getElementById("temp-main"),
    humidLine:      document.getElementById("humid-line"),
    lightLine:      document.getElementById("light-line"),
    metricTemp:     document.getElementById("metric-temp"),
    metricWater:    document.getElementById("metric-water"),
    statusPill:     document.getElementById("status-pill"),
    statusText:     document.getElementById("status-text"),
    lampToggle:     document.getElementById("lamp-toggle"),
    lampMain:       document.getElementById("lamp-main"),
    pumpToggle:     document.getElementById("pump-toggle"),
    pumpCard:       document.getElementById("pump-card"),
    heatSlider:     document.getElementById("heat-slider"),
    heatValue:      document.getElementById("heat-value"),
    humToggle:      document.getElementById("hum-toggle"),
    humMain:        document.getElementById("hum-main"),
    steamContainer: document.getElementById("steam-container"),
    ipLabel:        document.getElementById("ip-label"),
    lastUpdate:     document.getElementById("last-update"),
    topDate:        document.getElementById("top-date"),
    topTime:        document.getElementById("top-time")
};

// =====================
// UTILS
// =====================
function updateTime() {
    const now = new Date();
    if (el.topDate) el.topDate.textContent = now.toLocaleDateString('ro-RO', { day:'2-digit', month:'short' });
    if (el.topTime) el.topTime.textContent = now.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
}
setInterval(updateTime, 1000);

// =====================
// MQTT CLIENT
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);

function onConnect() {
    client.subscribe(TOPIC_STAT_SENZORI);
    el.statusText.textContent = "Live connected";
    el.statusPill.classList.remove("disconnected");
    // ASCUNDE SPLASH SCREEN
    if (el.splash) el.splash.classList.add("hide");
}

function onConnectionLost(res) {
    el.statusText.textContent = "Disconnected";
    el.statusPill.classList.add("disconnected");
    if (res.errorCode !== 0) setTimeout(startConnect, 3000);
}

function onMessageArrived(message) {
    try {
        const data = JSON.parse(message.payloadString);
        const now = new Date();
        if (el.lastUpdate) el.lastUpdate.textContent = now.toLocaleTimeString();

        // 1. Senzori
        if (data.temp !== undefined) el.tempMain.innerHTML = `${data.temp.toFixed(1)}<span>°C</span>`;
        if (data.hum !== undefined) el.humidLine.textContent = `${data.hum.toFixed(0)} % / ${data.soil || 0} %`;
        if (data.water !== undefined) {
            el.metricWater.textContent = data.water.toFixed(0);
            // Update CSS Variable for wave animation
            document.documentElement.style.setProperty('--water-fill', data.water + '%');
        }
        
        waterLocked = (data.water_lock === 1);
        el.statusText.textContent = waterLocked ? "TANK EMPTY" : "Live connected";
        el.statusPill.classList.toggle("disconnected", waterLocked);

        // 2. Sincronizare Actuatori
        if (document.activeElement !== el.fanSlider) {
            const fVal = data.fan_pct || 0;
            el.fanSlider.value = fVal;
            el.fanValue.textContent = `${fVal}%`;
            el.fanVisual.classList.toggle("spin", fVal > 0);
            document.documentElement.style.setProperty('--fan-speed', (1.5 - (fVal/100)) + 's');
        }

        if (document.activeElement !== el.heatSlider) {
            el.heatSlider.value = data.heat_pct || 0;
            el.heatValue.textContent = `${data.heat_pct || 0}%`;
        }

        el.lampToggle.classList.toggle("on", data.lamp_power === 1);
        el.lampMain.textContent = data.lamp_power === 1 ? "On" : "Off";

        el.humToggle.classList.toggle("on", data.hum_power === 1);
        el.humMain.textContent = data.hum_power === 1 ? "On" : "Off";
        el.steamContainer.classList.toggle("steam-hidden", data.hum_power !== 1);

        el.pumpToggle.classList.toggle("on", data.pump_power === 1);
        el.pumpCard.classList.toggle("locked", waterLocked);

        // 3. Mod System
        setModeUI(data.mode === "manual", false);
        if (data.ip) el.ipLabel.textContent = data.ip;

    } catch (e) { console.error("Data parse error", e); }
}

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

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
    el.btnManual.classList.toggle("active", manual);
    el.btnAuto.classList.toggle("active", !manual);
    el.controlsCard.classList.toggle("hidden", !manual);
    if (publish) publishMessage(TOPIC_CMD_MODE, manual ? "manual" : "auto");
}

// =====================
// EVENT LISTENERS
// =====================
el.btnAuto.onclick = () => setModeUI(false, true);
el.btnManual.onclick = () => setModeUI(true, true);

el.fanSlider.onchange = () => isManualMode && publishMessage(TOPIC_CMD_FAN, el.fanSlider.value);
el.heatSlider.onchange = () => isManualMode && publishMessage(TOPIC_CMD_HEAT_LEVEL, el.heatSlider.value);

el.lampToggle.onclick = () => {
    if (!isManualMode) return;
    publishMessage(TOPIC_CMD_LAMP_POWER, el.lampToggle.classList.contains("on") ? "off" : "on");
};

el.pumpToggle.onclick = () => {
    if (!isManualMode || waterLocked) return;
    publishMessage(TOPIC_CMD_PUMP_POWER, el.pumpToggle.classList.contains("on") ? "off" : "on");
};

el.humToggle.onclick = () => {
    if (!isManualMode) return;
    publishMessage(TOPIC_CMD_HUMIDIFIER, el.humToggle.classList.contains("on") ? "off" : "on");
};

document.getElementById("lamp-intensity-up").onclick = () => isManualMode && publishMessage(TOPIC_CMD_LAMP_BRIGHT, "up");
document.getElementById("lamp-intensity-down").onclick = () => isManualMode && publishMessage(TOPIC_CMD_LAMP_BRIGHT, "down");
document.getElementById("lamp-color-btn").onclick = () => isManualMode && publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");

// =====================
// START
// =====================
function startConnect() {
    client.connect({ onSuccess: onConnect, useSSL: true, onFailure: () => setTimeout(startConnect, 5000) });
}

updateTime();
startConnect();
