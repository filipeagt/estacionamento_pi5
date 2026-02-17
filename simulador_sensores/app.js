/* app.js - plain script using global mqtt and window.createSensors */

const MQTT_BROKER = "wss://test.mosquitto.org:8081";
const SUB_TOPIC = "pi5/estacionamento/vaga/#";
const PUB_PREFIX = "pi5/estacionamento/vaga/";

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const burstBtn = document.getElementById("burstBtn");
const grid = document.getElementById("grid");
document.getElementById("brokerText").textContent = MQTT_BROKER;
document.getElementById("subText").textContent = SUB_TOPIC;

// use global createSensors exposed by sensors.js
const sensors = (window.createSensors || function(){ return []; })(40);
sensors.forEach(s => grid.appendChild(s.element));

let client = null;
let publishingInterval = null;

function connectClient() {
  // mqtt is available as global mqtt (from mqtt.min.js)
  client = mqtt.connect(MQTT_BROKER, { reconnectPeriod: 2000 });
  const statusEl = document.getElementById("connStatus");
  const clientIdEl = document.getElementById("clientId");

  function setStatus(text, cls) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = `conn-badge ${cls}`;
  }

  setStatus("Conectando...", "conn-connecting");

  client.on("connect", (connAck) => {
    console.log("MQTT conectado");
    setStatus("Conectado", "conn-connected");
    client.subscribe(SUB_TOPIC);
    // show the mqtt.js internal client id if available
    try {
      clientIdEl.textContent = client.options && client.options.clientId ? client.options.clientId : "auto";
    } catch (e) {
      clientIdEl.textContent = "—";
    }
  });

  client.on("reconnect", () => {
    console.log("MQTT reconectando...");
    setStatus("Reconectando...", "conn-connecting");
  });

  client.on("message", (topic, payload) => {
    try {
      const str = payload.toString();
      const id = topic.split("/").pop();
      const sensor = sensors.find(s => s.id === id);
      // only accept "true" / "false"
      if (sensor && (str === "true" || str === "false")) {
        sensor.updateFromNetwork({ occupied: str === "true" });
      }
    } catch (e) {
      console.warn("payload inválido", e);
    }
  });

  client.on("error", (err) => {
    console.warn("MQTT erro", err);
    setStatus("Erro", "conn-disconnected");
  });

  client.on("close", () => {
    console.log("MQTT desconectado");
    setStatus("Desconectado", "conn-disconnected");
  });
}

function disconnectClient() {
  if (client) {
    client.end(true);
    client = null;
  }
  const statusEl = document.getElementById("connStatus");
  const clientIdEl = document.getElementById("clientId");
  if (statusEl) {
    statusEl.textContent = "Desconectado";
    statusEl.className = "conn-badge conn-disconnected";
  }
  if (clientIdEl) clientIdEl.textContent = "—";
}

function startPublishing() {
  if (!client) connectClient();
  // each sensor publishes its state every 3-8s randomly
  sensors.forEach(s => s.startAutoPublish((topic, messageStr) => {
    if (client && client.connected) client.publish(topic, messageStr);
  }));
  startBtn.disabled = true;
  stopBtn.disabled = false;
}

function stopPublishing() {
  sensors.forEach(s => s.stopAutoPublish());
  disconnectClient();
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

startBtn.addEventListener("click", startPublishing);
stopBtn.addEventListener("click", stopPublishing);
burstBtn.addEventListener("click", () => {
  // quick burst: all sensors publish their current state immediately
  sensors.forEach(s => {
    const topic = PUB_PREFIX + s.id;
    const msgStr = s.currentPayload();
    if (client && client.connected) client.publish(topic, msgStr);
    // also update local UI (in case not subscribed)
    s.updateFromNetwork({ occupied: msgStr === "true" });
  });
});

// Start paused; nothing auto-starts until user taps "Iniciar"