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
// STATE & DOM
// =====================
let isManualMode = false;
let waterLocked  = false;

const el = {
    // Top Bar & Status
    statusPill: document.getElementById("status-pill"),
    statusText: document.getElementById("status-text"),
    topDate: document.getElementById("top-date"),
    topTime: document.getElementById("top-time"),
    lastUpdate: document.getElementById("last-update"),
    ipLabel: document.getElementById("ip-label"),

    // Mode Buttons
    btnAuto: document.getElementById("btn-auto"),
    btnManual: document.getElementById("btn-manual"),
    controlsCard: document.getElementById("controls-card"),
    modeChip: document.getElementById("mode-chip"),

    // Sensors Overview
    tempMain: document.getElementById("temp-main"),
    humidLine: document.getElementById("humid-line"),
    lightLine: document.getElementById("light-line"),
    
    // Metrics Grid
    metricTemp: document.getElementById("metric-temp"),
    metricLight: document.getElementById("metric-light"),
    metricSoil: document.getElementById("metric-soil"),
    metricWater: document.getElementById("metric-water"),
    
    // Health
    healthValue: document.getElementById("health-value"),
    healthBar: document.getElementById("health-bar-fill"),
    healthBadge: document.getElementById("health-badge"),

    // Actuators
    fanSlider: document.getElementById("fan-slider"),
    fanValue: document.getElementById("fan-value"),
    heatSlider: document.getElementById("heat-slider"),
    heatValue: document.getElementById("heat-value"),
    lampToggle: document.getElementById("lamp-toggle"),
    lampMain: document.getElementById("lamp-main"),
    pumpToggle: document.getElementById("pump-toggle"),
    pumpMain: document.getElementById("pump-main"),
    humToggle: document.getElementById("hum-toggle"),
    humMain: document.getElementById("hum-main"),
    steam: document.getElementById("steam-container")
};

// =====================
// UTILS
// =====================
function updateTime() {
    const now = new Date();
    if(el.topDate) el.topDate.textContent = now.toLocaleDateString('ro-RO', { day:'2-digit', month:'short' });
    if(el.topTime) el.topTime.textContent = now.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' });
}
setInterval(updateTime, 1000);

function updateHealth(temp, soil) {
    // Logică simplificată: scor optim dacă temp e 20-28C și solul > 40%
    let score = 100;
    if (temp < 18 || temp > 30) score -= 20;
    if (soil < 30) score -= 30;
    
    el.healthValue.textContent = `${score}%`;
    el.healthBar.style.width = `${score}%`;
    el.healthBadge.textContent = score > 70 ? "Excellent" : "Needs attention";
}

// =====================
// MQTT CLIENT
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);

function startConnect() {
    client.connect({ 
        onSuccess: () => {
            client.subscribe(TOPIC_STAT_SENZORI);
            el.statusText.textContent = "Live connected";
            el.statusPill.classList.remove("disconnected");
        }, 
        useSSL: true, 
        onFailure: () => setTimeout(startConnect, 5000) 
    });
}

client.onConnectionLost = (res) => {
    el.statusText.textContent = "Disconnected";
    el.statusPill.classList.add("disconnected");
    if (res.errorCode !== 0) setTimeout(startConnect, 3000);
};

client.onMessageArrived = (message) => {
    try {
        const data = JSON.parse(message.payloadString);
        const now = new Date();
        el.lastUpdate.textContent = now.toLocaleTimeString();

        // Update Sensors
        if (data.temp !== undefined) {
            el.tempMain.innerHTML = `${data.temp.toFixed(1)}<span>°C</span>`;
            el.metricTemp.textContent = data.temp.toFixed(1);
        }
        if (data.hum !== undefined && data.soil !== undefined) {
            el.humidLine.textContent = `${data.hum.toFixed(0)} % / ${data.soil.toFixed(0)} %`;
            el.metricSoil.textContent = data.soil.toFixed(0);
        }
        if (data.light !== undefined) {
            el.lightLine.textContent = `Light: ${data.light} lx`;
            el.metricLight.textContent = data.light;
        }
        if (data.water !== undefined) el.metricWater.textContent = data.water.toFixed(0);

        // Water Lock Logic
        waterLocked = (data.water_lock === 1);
        if (waterLocked) {
            el.statusText.textContent = "TANK EMPTY";
            el.statusPill.classList.add("disconnected");
        }

        // Sync UI Sliders (only if not dragging)
        if (document.activeElement !== el.fanSlider) {
            el.fanSlider.value = data.fan_pct || 0;
            el.fanValue.textContent = `${data.fan_pct || 0}%`;
        }
        
        // Sync Toggles
        el.lampToggle.classList.toggle("on", data.lamp_power === 1);
        el.lampMain.textContent = data.lamp_power === 1 ? "On" : "Off";
        
        el.humToggle.classList.toggle("on", data.hum_power === 1);
        el.humMain.textContent = data.hum_power === 1 ? "On" : "Off";
        el.steam.classList.toggle("steam-hidden", data.hum_power !== 1);

        el.pumpToggle.classList.toggle("on", data.pump_power === 1);
        el.pumpMain.textContent = data.pump_power === 1 ? "On" : "Off";

        // Mode UI
        setModeUI(data.mode === "manual", false);
        if (data.ip) el.ipLabel.textContent = data.ip;
        
        updateHealth(data.temp, data.soil);

    } catch (e) { console.error("JSON Error", e); }
};

// =====================
// CONTROLS
// =====================
function publish(topic, msg) {
    if (!client.isConnected()) return;
    client.send(new Paho.MQTT.Message(String(msg)));
    // Notă: Paho MQTT are nevoie ca topicul să fie setat pe obiectul Message
    const m = new Paho.MQTT.Message(String(msg));
    m.destinationName = topic;
    client.send(m);
}

function setModeUI(manual, shouldPublish) {
    isManualMode = manual;
    el.btnManual.classList.toggle("active", manual);
    el.btnAuto.classList.toggle("active", !manual);
    el.controlsCard.classList.toggle("hidden", !manual);
    el.modeChip.textContent = manual ? "MANUAL" : "AUTO";
    if (shouldPublish) publish(TOPIC_CMD_MODE, manual ? "manual" : "auto");
}

// Event Listeners
el.btnAuto.onclick = () => setModeUI(false, true);
el.btnManual.onclick = () => setModeUI(true, true);

el.fanSlider.onchange = () => isManualMode && publish(TOPIC_CMD_FAN, el.fanSlider.value);
el.heatSlider.onchange = () => isManualMode && publish(TOPIC_CMD_HEAT_LEVEL, el.heatSlider.value);

el.lampToggle.onclick = () => {
    if (!isManualMode) return;
    const nextState = !el.lampToggle.classList.contains("on");
    publish(TOPIC_CMD_LAMP_POWER, nextState ? "on" : "off");
};

el.pumpToggle.onclick = () => {
    if (!isManualMode || waterLocked) return;
    const nextState = !el.pumpToggle.classList.contains("on");
    publish(TOPIC_CMD_PUMP_POWER, nextState ? "on" : "off");
};

el.humToggle.onclick = () => {
    if (!isManualMode) return;
    const nextState = !el.humToggle.classList.contains("on");
    publish(TOPIC_CMD_HUMIDIFIER, nextState ? "on" : "off");
};

// Lamp Specifics
document.getElementById("lamp-intensity-up").onclick = () => isManualMode && publish(TOPIC_CMD_LAMP_BRIGHT, "up");
document.getElementById("lamp-intensity-down").onclick = () => isManualMode && publish(TOPIC_CMD_LAMP_BRIGHT, "down");
document.getElementById("lamp-color-btn").onclick = () => isManualMode && publish(TOPIC_CMD_LAMP_COLOR, "cycle");

// Start
updateTime();
startConnect();
