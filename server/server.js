require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mqtt = require("mqtt");
const crypto = require("crypto");
const cors = require("cors");

// ---------- CONFIGURACIÓN ----------
const MQTT_HOST  = process.env.MQTT_HOST;
const MQTT_USER  = process.env.MQTT_USER;
const MQTT_PASS  = process.env.MQTT_PASS;
const MQTT_GROUP = process.env.MQTT_GROUP || "ecu";
const PORT       = process.env.PORT || 3000;

// ---------- APP ----------
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const bikeState = new Map();

// ---------- MQTT ----------
const mqttClient = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  reconnectPeriod: 3000,
  keepalive: 60
});

mqttClient.on("connect", () => {
  console.log("Conectado a MQTT:", MQTT_HOST);
  mqttClient.subscribe("ecu/rsp/+/+");
  mqttClient.subscribe("ecu/rpt/+/+");
});

mqttClient.on("error", (err) => {
  console.error("Error MQTT:", err.message);
});

mqttClient.on("message", (topic, buf) => {
  let payload;
  try {
    payload = JSON.parse(buf.toString());
  } catch (e) {
    console.error("JSON inválido desde MQTT:", e.message);
    return;
  }

  const parts = topic.split("/");
  const type = parts[1];
  const group = parts[2];
  const deviceId = parts[3];

  if (!deviceId) return;

  if (type === "rpt") {
    handleReport(deviceId, payload);
  }

  const msg = { topic, type, group, deviceId, payload };
  const msgStr = JSON.stringify(msg);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msgStr);
    }
  });
});

// ---------- PROCESAR REPORTES ----------
function handleReport(deviceId, payload) {
  const param = payload.param || payload;

  if (param.latitude === undefined || param.longitude === undefined) return;

  let state = "IDLE";
  if (param.alarm === 1) state = "STOLEN";
  else if ((param.speed || 0) > 0) state = "IN_USE";

  const gps = {
    lat: param.latitude,
    lng: param.longitude,
    speed: param.speed || 0,
    alarm: param.alarm || 0,
    time: param.timestamp || Date.now()
  };

  bikeState.set(deviceId, {
    gps,
    state,
    lastUpdate: new Date()
  });

  console.log(
    `GPS ${deviceId}:`,
    gps.lat,
    gps.lng,
    "state:",
    state
  );
}

// ---------- ENVIAR COMANDOS ----------
function sendCommand(deviceId, cmd, param = {}) {
  const tid = crypto.randomUUID();
  const topic = `ecu/cd/${MQTT_GROUP}/${deviceId}`;

  const payload = { c: cmd, tid };
  if (Object.keys(param).length > 0) payload.param = param;

  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
    if (err) {
      console.error("Error publicando a MQTT:", err.message);
    } else {
      console.log(`CMD ${cmd} enviado a ${deviceId} (tid=${tid})`);
    }
  });

  return tid;
}

// ---------- ENDPOINTS REST ----------

// Unlock
app.post("/bike/:id/unlock", (req, res) => {
  const deviceId = req.params.id;
  const tid = sendCommand(deviceId, 4, { defend: 0 });
  res.json({ status: "sent", cmd: 4, defend: 0, tid, deviceId });
});

// Lock
app.post("/bike/:id/lock", (req, res) => {
  const deviceId = req.params.id;
  const tid = sendCommand(deviceId, 4, { defend: 1 });
  res.json({ status: "sent", cmd: 4, defend: 1, tid, deviceId });
});

// Reset
app.post("/bike/:id/reset", (req, res) => {
  const deviceId = req.params.id;
  const tid = sendCommand(deviceId, 99);
  res.json({ status: "sent", cmd: 99, tid, deviceId });
});

// Última ubicación
app.get("/bike/:id/location", (req, res) => {
  const deviceId = req.params.id;
  const state = bikeState.get(deviceId);

  if (!state || !state.gps) {
    return res.status(404).json({ error: "Sin ubicación registrada" });
  }

  res.json(state.gps);
});

// Estado completo
app.get("/bike/:id/state", (req, res) => {
  const deviceId = req.params.id;
  const state = bikeState.get(deviceId);

  if (!state) {
    return res.status(404).json({ error: "Bici no registrada" });
  }

  res.json({
    deviceId,
    state: state.state,
    gps: state.gps,
    lastUpdate: state.lastUpdate
  });
});

// ---------- WEBSOCKET ----------
wss.on("connection", (ws) => {
  console.log("Cliente WebSocket conectado");
  ws.on("close", () => console.log("Cliente WebSocket desconectado"));
});

// ---------- ARRANQUE ----------
server.listen(PORT, () => {
  console.log(`API escuchando http://localhost:${PORT}`);
});
