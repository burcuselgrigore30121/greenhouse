// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084;
const MQTT_USER = "";
const MQTT_PASS = "";
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).substr(2, 8);

// Subiecte (Topics)
const TOPIC_CMD_FAN         = "sera/comenzi/ventilator";
const TOPIC_CMD_MODE        = "sera/comenzi/mod";
const TOPIC_STAT_SENZORI    = "sera/stare/senzori";
const TOPIC_CMD_LAMP_POWER  = "sera/comenzi/lampa/power";
const TOPIC_CMD_LAMP_INTENSITY = "sera/comenzi/lampa/intensity"; // Topic nou
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";

// Starea Lămpii (stocată DOAR în aplicație)
const CULORI_LAMPA = ["#FFFFFF", "#FF0000", "#0000FF", "#A855F7"]; // Alb, Rosu, Albastru, Mov (Toate)
let lampIsOn = false;
let lampColorIndex = 0; // Începem cu prima culoare (Alb)

// =====================
// DOM ELEMENTS
// =====================
// (Asigurați-vă că index.html are aceste ID-uri)
const allElements = {
    btnAuto: document.getElementById("btn-auto"),
    btnManual: document.getElementById("btn-manual"),
    controlsCard: document.getElementById("controls-card"),
    fanSlider: document.getElementById("fan-slider"),
    fanValue: document.getElementById("fan-value"),
    fanVisual: document.getElementById("fan-visual"),
    
    // Cardul Lămpii (Nou)
    lampCard: document.getElementById("lamp-card"),
    lampButtonPower: document.getElementById("lamp-btn-power"),
    lampButtonIntensity: document.getElementById("lamp-btn-intensity"),
    lampButtonColor: document.getElementById("lamp-btn-color"),
    lampMain: document.getElementById("lamp-main"), // Textul "On/Off"
    
    // (Restul elementelor DOM: tempMain, humidLine, etc.)
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
    overviewCard: document.getElementById("overview-card")
};


// =====================
// MQTT CLIENT (Paho)
// =====================
const client = new Paho.MQTT.Client(MQTT_HOST, Number(MQTT_PORT), MQTT_CLIENT_ID);
client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;

// ... (funcțiile de conectare și helper rămân la fel ca în codul dumneavoastră) ...
function startConnect() {
    allElements.statusText.textContent = "Connecting...";
    allElements.statusPill.classList.add("disconnected");
    client.connect({
        onSuccess: onConnect,
        useSSL: true, // Folosim SSL (wss://) pentru portul 8084
        userName: MQTT_USER,
        password: MQTT_PASS,
        onFailure: () => {
            allElements.statusText.textContent = "Error";
            setTimeout(startConnect, 5000);
        }
    });
}
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
function publishMessage(topic, payload) {
    if (!client.isConnected()) return;
    const m = new Paho.MQTT.Message(payload.toString());
    m.destinationName = topic;
    client.send(m);
}
// ... (restul funcțiilor helper: labelForTemp, healthFromSensors, etc.) ...

// =====================
// MQTT CALLBACK (Primire Date)
// =====================
function onMessageArrived(message) {
    try {
        const data = JSON.parse(message.payloadString);
        
        // (Tot codul de actualizare a senzorilor rămâne la fel)
        // ... (actualizare temp, light, soil, etc.) ...

        // Sincronizăm starea modului (Auto/Manual)
        const manualFromDevice = data.mode === "manual";
        setModeUI(manualFromDevice, false); // false = nu trimite înapoi comanda

        // Sincronizăm slider-ul ventilatorului
        if (typeof data.fan_pct === "number" && document.activeElement !== allElements.fanSlider) {
            allElements.fanSlider.value = data.fan_pct;
            allElements.fanValue.textContent = `${data.fan_pct}%`;
            // updateSliderFill(allElements.fanSlider); // (dacă aveți funcția)
            // updateFanVisual(); // (dacă aveți funcția)
        }
        
    } catch (e) {
        console.error("JSON parse error:", e);
    }
}

// =====================
// LOGICA NOUĂ APLICAȚIE
// =====================

// --- Mod Auto/Manual ---
function setModeUI(manual, publish) {
    isManualMode = manual;
    allElements.btnManual.classList.toggle("active", manual);
    allElements.btnAuto.classList.toggle("active", !manual);
    allElements.modeChip.textContent = manual ? "MANUAL" : "AUTO";
    allElements.controlsCard.classList.toggle("hidden", !manual);
    allElements.overviewCard.classList.toggle("manual-mode", manual);
    
    if (publish) {
        publishMessage(TOPIC_CMD_MODE, manual ? "manual" : "auto");
        if (manual) {
            // Trimitem starea curentă a controalelor
            publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
        }
    }
}
allElements.btnAuto.addEventListener("click", () => setModeUI(false, true));
allElements.btnManual.addEventListener("click", () => setModeUI(true, true));

// --- Ventilator (Neschimbat) ---
allElements.fanSlider.addEventListener("input", () => {
    allElements.fanValue.textContent = `${allElements.fanSlider.value}%`;
    // updateSliderFill(allElements.fanSlider);
    // updateFanVisual();
});
allElements.fanSlider.addEventListener("change", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
});


// --- REZOLVARE PROBLEME LAMPĂ ---

// Funcție care actualizează vizual starea lămpii (pe care o stocăm noi)
function updateLampUI() {
    if (lampIsOn) {
        allElements.lampMain.textContent = "On";
        // Aplicăm culoarea stocată
        allElements.lampCard.style.background = CULORI_LAMPA[lampColorIndex];
        // (Puteți adăuga aici și logica de fundal 'radial-gradient' din codul vechi)
    } else {
        allElements.lampMain.textContent = "Off";
        allElements.lampCard.style.background = "#f9fafb"; // Culoarea de "stins"
    }
}

// 1. Logica Butonului Power
allElements.lampButtonPower.addEventListener("click", () => {
    if (!isManualMode) return; // Funcționează doar pe manual
    
    // Trimitem comanda "click" la ESP32
    publishMessage(TOPIC_CMD_LAMPA_POWER, "click");
    
    // Inversăm starea stocată în aplicație
    lampIsOn = !lampIsOn;
    
    // Actualizăm UI-ul
    updateLampUI();
});

// 2. Logica Butonului Intensitate (Problem 3)
// (Am înlocuit slider-ul cu un singur buton)
allElements.lampButtonIntensity.addEventListener("click", () => {
    if (!isManualMode || !lampIsOn) return; // Funcționează doar pe manual și dacă lampa e aprinsă
    
    // Trimitem comanda "click" la ESP32
    publishMessage(TOPIC_CMD_LAMPA_INTENSITY, "click");
    
    // (Aplicația nu știe care e intensitatea, așa că nu actualizăm nimic vizual)
});

// 3. Logica Butonului Culoare (Problem 2)
allElements.lampButtonColor.addEventListener("click", () => {
    if (!isManualMode || !lampIsOn) return;
    
    // Trimitem comanda "click" la ESP32
    publishMessage(TOPIC_CMD_LAMPA_COLOR, "click");
    
    // Avansăm la următoarea culoare din lista noastră
    lampColorIndex = (lampColorIndex + 1) % CULORI_LAMPA.length; // (0, 1, 2, 3, 0, 1...)
    
    // Actualizăm UI-ul cu noua culoare
    updateLampUI();
});

// =====================
// INIT
// =====================
// (Restul funcțiilor de inițializare)
setInterval(updateClock, 1000);
updateClock();
startConnect();
