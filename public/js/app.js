document.addEventListener("DOMContentLoaded", () => {

    const API = window.location.origin;
    const WS = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") + location.host
    );
    const BIKE_ID = "SIMBIKE01";

    let bikeLocked = true;

    const station1 = [19.284, -99.655];
    const station2 = [19.290, -99.650];

    const map = L.map("map").setView(station1, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

    const stationIcon = L.icon({
        iconUrl: "icons/station1.png",
        iconSize: [55, 55],
        iconAnchor: [27, 55],
        popupAnchor: [0, -50]
    });

    const stationIcon2 = L.icon({
        iconUrl: "icons/station2.png",
        iconSize: [55, 55],
        iconAnchor: [27, 55],
        popupAnchor: [0, -50]
    });

    const bikeIcon = L.icon({
        iconUrl: "icons/bike.gif",
        iconSize: [45, 45],
        iconAnchor: [22, 22],
        popupAnchor: [0, -20]
    });

    L.marker(station1, { icon: stationIcon }).addTo(map).bindPopup("Estación 1");
    L.marker(station2, { icon: stationIcon2 }).addTo(map).bindPopup("Estación 2");

    let bikeMarker = L.marker(station1, { icon: bikeIcon }).addTo(map);

    function logCmd(msg) {
        const box = document.getElementById("cmdConsole");
        box.innerHTML += `<span class="log-cmd">${msg}</span><br>`;
        box.scrollTop = box.scrollHeight;
    }

    function logMsg(msg, type = "info") {
        const box = document.getElementById("msgConsole");
        const colorClass =
            {
                gps: "log-gps",
                info: "log-info",
                warn: "log-warn",
            }[type] || "log-info";

        box.innerHTML += `<span class="${colorClass}">${msg}</span><br>`;
        box.scrollTop = box.scrollHeight;
    }

    function clearConsoles() {
        document.getElementById("cmdConsole").innerHTML = "";
        document.getElementById("msgConsole").innerHTML = "";
    }

    async function takeBike() {
        if (bikeLocked) {
            logCmd("> Reinicio automático antes de iniciar viaje (cmd=99)");
            await fetch(`${API}/bike/${BIKE_ID}/reset`, { method: "POST" });
        }

        fetch(`${API}/bike/${BIKE_ID}/unlock`, { method: "POST" });
        logCmd("> CMD enviado: defend = 0 (UNLOCK)");

        bikeLocked = false;

        document.getElementById("btnTake").disabled = true;
        document.getElementById("btnDeliver").disabled = true;
    }

    function deliverBike() {
        fetch(`${API}/bike/${BIKE_ID}/lock`, { method: "POST" });
        logCmd("> CMD enviado: defend = 1 (LOCK)");

        bikeLocked = true;

        document.getElementById("btnTake").disabled = false;
        document.getElementById("btnDeliver").disabled = true;
    }

    function resetBike() {
        fetch(`${API}/bike/${BIKE_ID}/reset`, { method: "POST" });
        logCmd("> CMD enviado: Reiniciar bici (cmd=99)");
    }

    function isAtStation2(lat, lng) {
        return (
            Math.abs(lat - station2[0]) < 0.0003 &&
            Math.abs(lng - station2[1]) < 0.0003
        );
    }

    WS.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.deviceId !== BIKE_ID) return;

        const p = data.payload.param;
        if (!p || p.latitude === undefined) return;

        bikeMarker.setLatLng([p.latitude, p.longitude]);

        logMsg(
            `GPS → lat:${p.latitude.toFixed(5)} lng:${p.longitude.toFixed(5)} speed:${p.speed}`,
            "gps"
        );

        if (isAtStation2(p.latitude, p.longitude)) {
            logMsg(">> La bici llegó a la estación 2", "warn");
            document.getElementById("btnDeliver").disabled = false;
        }
    };

    document.getElementById("btnTake").onclick = takeBike;
    document.getElementById("btnDeliver").onclick = deliverBike;
    document.getElementById("btnReset").onclick = resetBike;
    document.getElementById("btnClear").onclick = clearConsoles;

});
