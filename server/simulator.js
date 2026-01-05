require("dotenv").config();
const mqtt = require("mqtt");

// ===== CONFIG =====
const GROUP     = process.env.MQTT_GROUP || "ecu";
const DEVICE_ID = process.env.DEVICE_ID || "SIMBIKE01";

const MQTT_HOST = process.env.MQTT_HOST;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASS = process.env.MQTT_PASS;

// ===== ESTACIONES =====
const start = {
  lat: Number(process.env.START_LAT || 19.2840),
  lng: Number(process.env.START_LNG || -99.6550)
};

const target = {
  lat: Number(process.env.TARGET_LAT || 19.2900),
  lng: Number(process.env.TARGET_LNG || -99.6500)
};

// ===== ESTADO DE LA BICI =====
let lat = start.lat;
let lng = start.lng;

let moving = false;
let progress = 0;

let state = "IDLE";     
let sendGps = false;

let lastLat = lat;
let lastLng = lng;

// ===== CONEXIÓN MQTT =====
const client = mqtt.connect(MQTT_HOST, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: `sim-${DEVICE_ID}`,
  clean: true,
  reconnectPeriod: 3000,
  keepalive: 60
});

client.on("connect", () => {
  console.log("Simulador conectado a EMQX");
  console.log(`Suscrito a ecu/cd/${GROUP}/${DEVICE_ID}`);

  client.subscribe(`ecu/cd/${GROUP}/${DEVICE_ID}`);
  setInterval(loop, 1000);
});

client.on("reconnect", () => {
  console.log("Reintentando conexión MQTT...");
});

client.on("error", (err) => {
  console.error("Error MQTT:", err.message);
});

// ===== LOOP =====
function loop() {
  if (moving) moveBike();
  detectTheft();

  if (sendGps) {
    sendGPS();
  }
}

// ===== COMANDOS =====
client.on("message", (topic, msg) => {
  const data = JSON.parse(msg.toString());
  console.log("CMD recibido:", data);

  // LOCK / UNLOCK
  if (data.c === 4) {
    const defend = data.param?.defend;

    // UNLOCK
    if (defend === 0) {
      console.log("Inicio de viaje");
      state = "IN_USE";
      moving = true;
      sendGps = true;
      progress = 0;
    }

    // LOCK
    if (defend === 1) {
      console.log("Fin de viaje");
      state = "IDLE";
      moving = false;
      sendGps = false;
    }

    respondOK(data.tid);
  }

  // RESET
  if (data.c === 99) {
    console.log("Reset de bici");
    state = "IDLE";
    moving = false;
    sendGps = false;
    lat = start.lat;
    lng = start.lng;
    progress = 0;
    respondOK(data.tid);
  }
});

// ===== RESPUESTA =====
function respondOK(tid) {
  client.publish(
    `ecu/rsp/${GROUP}/${DEVICE_ID}`,
    JSON.stringify({ tid, code: 0 })
  );
}

// ===== MOVIMIENTO =====
function moveBike() {
  progress += 0.08;

  if (progress >= 1) {
    progress = 1;
    moving = false;
    sendGps = false;
    state = "IDLE";
    console.log("Llegó a estación destino");
  }

  lat = start.lat + (target.lat - start.lat) * progress;
  lng = start.lng + (target.lng - start.lng) * progress;

  console.log(`GPS -> ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
}

// ===== DETECCIÓN DE ROBO =====
function detectTheft() {
  const distance =
    Math.abs(lat - lastLat) + Math.abs(lng - lastLng);

  if (state === "IDLE" && distance > 0.00005) {
    console.log("Movimiento no autorizado detectado");
    state = "STOLEN";
    sendGps = true;
  }

  lastLat = lat;
  lastLng = lng;
}

// ===== GPS =====
function sendGPS() {
  client.publish(
    `ecu/rpt/${GROUP}/${DEVICE_ID}`,
    JSON.stringify({
      c: 56,
      param: {
        latitude: lat,
        longitude: lng,
        speed: moving ? 12 : 0,
        alarm: state === "STOLEN" ? 1 : 0,
        timestamp: Date.now()
      }
    })
  );
}
