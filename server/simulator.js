const mqtt = require("mqtt");

const GROUP = "ecu";
const DEVICE_ID = "SIMBIKE01";

const client = mqtt.connect("mqtt://localhost:1883");

const start = { lat: 19.284, lng: -99.655 };
let lat = start.lat;
let lng = start.lng;

const target = { lat: 19.290, lng: -99.650 };

let moving = false;
let progress = 0;

client.on("connect", () => {
  client.subscribe(`ecu/cd/${GROUP}/${DEVICE_ID}`);

  setInterval(() => {
    if (moving) moveBike();
    sendGPS();
  }, 200);
});

client.on("message", (topic, msg) => {
  const data = JSON.parse(msg.toString());

  if (data.c === 4) {
    const defend = data.param?.defend;
    if (defend === 0) {
      moving = true;
      progress = 0;
    }
    if (defend === 1) moving = false;

    client.publish(
      `ecu/rsp/${GROUP}/${DEVICE_ID}`,
      JSON.stringify({ tid: data.tid, code: 0 })
    );
  }

  if (data.c === 99) {
    moving = false;
    lat = start.lat;
    lng = start.lng;
    progress = 0;

    client.publish(
      `ecu/rsp/${GROUP}/${DEVICE_ID}`,
      JSON.stringify({ tid: data.tid, code: 0 })
    );
  }
});

function moveBike() {
  progress += 0.02;
  if (progress >= 1) {
    progress = 1;
    moving = false;
  }

  const ease = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

  lat = start.lat + (target.lat - start.lat) * ease;
  lng = start.lng + (target.lng - start.lng) * ease;
}

function sendGPS() {
  const payload = {
    c: 56,
    param: {
      latitude: lat,
      longitude: lng,
      speed: moving ? 10 : 0,
      timestamp: Date.now()
    }
  };

  client.publish(`ecu/rpt/${GROUP}/${DEVICE_ID}`, JSON.stringify(payload));
}
