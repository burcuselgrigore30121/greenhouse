// =====================
// MQTT CONFIG
// =====================
const MQTT_HOST = "broker.emqx.io";
const MQTT_PORT = 8084;
const MQTT_USER = "";
const MQTT_PASS = "";
const MQTT_CLIENT_ID = "WebAppClient_" + Math.random().toString(16).substr(2, 8);

const TOPIC_CMD_FAN        = "sera/comenzi/ventilator";
const TOPIC_CMD_MODE       = "sera/comenzi/mod";
const TOPIC_STAT_SENZORI   = "sera/stare/senzori";

const TOPIC_CMD_LAMP_POWER  = "sera/comenzi/lampa/power";     // "on" / "off"
const TOPIC_CMD_LAMP_BRIGHT = "sera/comenzi/lampa/intensity"; // "start" / "stop"
const TOPIC_CMD_LAMP_COLOR  = "sera/comenzi/lampa/color";     // "cycle"

const TOPIC_CMD_PUMP_POWER  = "sera/comenzi/pompa/power";
const TOPIC_CMD_PUMP_SPEED  = "sera/comenzi/pompa/speed";

const TOPIC_CMD_HEAT_LEVEL  = "sera/comenzi/incalzire/level";

let isManualMode     = false;
let currentLampPower = 0;         // 0 = off, 1 = on
let currentLampColor = "#a855f7"; // doar pentru efect vizual, generic
let hasFirstStatus   = false;
// =====================
// DOM ELEMENTS
// =====================
const allElements = {
    // mod auto/manual
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

    // lamp
    lampToggle: document.getElementById("lamp-toggle"),
    lampToggleLabel: document.getElementById("lamp-toggle-label"),
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
    heatCard: document.getElementById("heat-card")
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
    if (allElements.splash) {
        allElements.splash.classList.add("hide");
    }
}
window.addEventListener("load", () => {
    setTimeout(hideSplash, 1500);
});

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
    score = Math.max(0, Math.min(100, score));
    return score;
}

// =====================
// COLOR + SLIDER HELPERS
// =====================
function hexToRgb(hex) {
    if (!hex) return null;
    let h = hex.trim();
    if (h.startsWith("#")) h = h.slice(1);
    if (h.length === 3) {
        h = h.split("").map(c => c + c).join("");
    }
    if (h.length !== 6) return null;
    const num = parseInt(h, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
    };
}

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

        const t = data.temp;
        const light = data.light;
        const soil = data.soil;
        const water = data.water;

        allElements.tempMain.innerHTML = `${t.toFixed(1)}<span>°C</span>`;
        allElements.humidLine.textContent = `-- % / ${soil.toFixed(0)} %`;
        allElements.lightLine.textContent = `Light: ${light} lx`;
        allElements.metricTemp.textContent  = t.toFixed(1);
        allElements.metricLight.textContent = light;
        allElements.metricSoil.textContent  = soil.toFixed(0);
        allElements.metricWater.textContent = water.toFixed(0);

        const lt = labelForTemp(t);
        allElements.metricTempTag.textContent  = lt.txt;
        allElements.metricTempTag.className    = "metric-tag " + lt.cls;

        const ls = labelForSoil(soil);
        allElements.metricSoilTag.textContent  = ls.txt;
        allElements.metricSoilTag.className    = "metric-tag " + ls.cls;

        const lw = labelForWater(water);
        allElements.metricWaterTag.textContent = lw.txt;
        allElements.metricWaterTag.className   = "metric-tag " + lw.cls;

        const ll = labelForLight(light);
        allElements.metricLightTag.textContent = ll.txt;
        allElements.metricLightTag.className   = "metric-tag " + ll.cls;

        const health = healthFromSensors(t, soil, water);
        allElements.healthValue.textContent = `${health}%`;
        allElements.healthBarFill.style.width = `${health}%`;
        if (health >= 80) allElements.healthBadge.textContent = "Very good";
        else if (health >= 60) allElements.healthBadge.textContent = "OK";
        else allElements.healthBadge.textContent = "Attention";

        const manualFromDevice = data.mode === "manual";
        setModeUI(manualFromDevice, false);

        if (typeof data.fan_pct === "number" &&
            document.activeElement !== allElements.fanSlider) {

            allElements.fanSlider.value = data.fan_pct;
            allElements.fanValue.textContent = `${data.fan_pct}%`;
            updateSliderFill(allElements.fanSlider);
            updateFanVisual();
        }

        if (data.ip) allElements.ipLabel.textContent = data.ip;
        const now = new Date();
        allElements.lastUpdate.textContent =
            now.toLocaleTimeString("en-GB", {hour:"2-digit", minute:"2-digit", second:"2-digit"});

        // --- LAMP POWER SYNC ---
        if (typeof data.lamp_power === "number") {
            currentLampPower = data.lamp_power === 1 ? 1 : 0;
            const on = currentLampPower === 1;

            allElements.lampToggle.classList.toggle("on", on);
            const label = on ? "On" : "Off";
            allElements.lampToggleLabel.textContent = label;
            allElements.lampMain.textContent = label;

            refreshLampCardBackground();
        }

        // <<< AICI ADD LINEA >>>
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
    isManualMode = manual;

    if (manual) {
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
        publishMessage(TOPIC_CMD_MODE, manual ? "manual" : "auto");
        if (manual) {
            publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
        }
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
// LAMP UI HELPER
// =====================
function refreshLampCardBackground() {
    const on = currentLampPower === 1;
    if (!on) {
        allElements.lampCard.style.background = "#f9fafb";
        allElements.lampCard.style.boxShadow = "0 10px 24px rgba(15,23,42,0.14)";
        return;
    }

    const rgb = hexToRgb(currentLampColor);
    if (!rgb) {
        allElements.lampCard.style.background =
            "radial-gradient(circle at 0% 0%, rgba(168,85,247,0.25), #f9fafb 55%, #f9fafb 100%)";
        allElements.lampCard.style.boxShadow =
            "0 18px 38px rgba(148,163,253,0.55)";
        return;
    }

    const alpha = 0.32;

    allElements.lampCard.style.background =
        `radial-gradient(circle at 0% 0%, rgba(${rgb.r},${rgb.g},${rgb.b},${alpha}), #f9fafb 55%, #f9fafb 100%)`;
    allElements.lampCard.style.boxShadow =
        "0 18px 38px rgba(148,163,253,0.55)";
}

// =====================
// RESET MANUAL CONTROLS
// =====================
function resetManualControls() {
    // FAN
    allElements.fanSlider.value = 0;
    allElements.fanValue.textContent = "0%";
    updateSliderFill(allElements.fanSlider);
    updateFanVisual();

    // LAMP (doar UI; starea reală vine din device)
    currentLampPower = 0;
    allElements.lampToggle.classList.remove("on");
    allElements.lampToggleLabel.textContent = "Off";
    allElements.lampMain.textContent = "Off";
    refreshLampCardBackground();

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
}

// =====================
// HELPER: buton cu press & hold
// =====================
function setupHoldButton(btn, onStart, onEnd) {
    let isDown = false;

    const start = (e) => {
        e.preventDefault();
        if (isDown) return;
        isDown = true;
        onStart();
        btn.classList.add("active-hold");
    };

    const end = (e) => {
        e && e.preventDefault();
        if (!isDown) return;
        isDown = false;
        onEnd();
        btn.classList.remove("active-hold");
    };

    btn.addEventListener("mousedown", start);
    btn.addEventListener("mouseup", end);
    btn.addEventListener("mouseleave", end);

    btn.addEventListener("touchstart", start, {passive:false});
    btn.addEventListener("touchend", end, {passive:false});
    btn.addEventListener("touchcancel", end, {passive:false});
}

// =====================
// EVENT LISTENERS
// =====================

// butoane mod
allElements.btnAuto.addEventListener("click", () => setModeUI(false, true));
allElements.btnManual.addEventListener("click", () => setModeUI(true, true));

// fan
allElements.fanSlider.addEventListener("input", () => {
    allElements.fanValue.textContent = `${allElements.fanSlider.value}%`;
    updateSliderFill(allElements.fanSlider);
    updateFanVisual();
});
allElements.fanSlider.addEventListener("change", () => {
    if (isManualMode) publishMessage(TOPIC_CMD_FAN, allElements.fanSlider.value);
});

// lamp toggle (folosește currentLampPower)
allElements.lampToggle.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    const desired = currentLampPower === 1 ? 0 : 1;
    currentLampPower = desired;

    const on = desired === 1;
    allElements.lampToggle.classList.toggle("on", on);
    const label = on ? "On" : "Off";
    allElements.lampToggleLabel.textContent = label;
    allElements.lampMain.textContent = label;

    publishMessage(TOPIC_CMD_LAMP_POWER, on ? "on" : "off");
    refreshLampCardBackground();
});

// lamp intensity – hold
// lamp intensity – click = un „pas” (pulse) de ~350ms
allElements.lampIntensityBtn.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    // mic efect vizual de glow
    allElements.lampIntensityBtn.classList.add("active-hold");
    setTimeout(() => {
        allElements.lampIntensityBtn.classList.remove("active-hold");
    }, 220);

    // 350 = durata pulse-ului în ms, o poți schimba
    publishMessage(TOPIC_CMD_LAMP_BRIGHT, "800");
});

// lamp color – single click
allElements.lampColorBtn.addEventListener("click", () => {
    if (!hasFirstStatus) return;
    publishMessage(TOPIC_CMD_LAMP_COLOR, "cycle");

    // efect de puls scurt în jurul butonului
    allElements.lampColorBtn.classList.add("pulse");
    setTimeout(() => {
        allElements.lampColorBtn.classList.remove("pulse");
    }, 220);
});
// pump toggle
allElements.pumpToggle.addEventListener("click", () => {
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
    publishMessage(TOPIC_CMD_PUMP_SPEED, allElements.pumpSlider.value);
});

// heat slider
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

    const r = v / 100;
    const alpha = 0.15 + 0.35 * r;
    const shadow = 12 + 18 * r;
    const borderAlpha = 0.3 + 0.5 * r;

    allElements.heatCard.style.background =
        `radial-gradient(circle at 0% 0%, rgba(249,115,22,${alpha}), #fefce8 50%, #f9fafb 100%)`;
    allElements.heatCard.style.borderColor = `rgba(248,171,89,${borderAlpha})`;
    allElements.heatCard.style.boxShadow =
        `0 ${shadow}px ${shadow*2}px rgba(248,171,89,0.6)`;
});
allElements.heatSlider.addEventListener("change", () => {
    publishMessage(TOPIC_CMD_HEAT_LEVEL, allElements.heatSlider.value);
});

// =====================
// INIT
// =====================
[allElements.fanSlider,
 allElements.pumpSlider,
 allElements.heatSlider].forEach(s => {
    if (s) updateSliderFill(s);
});

setInterval(updateClock, 1000);
updateClock();
startConnect();
