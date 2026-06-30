let simTime = 0;
let imuRoll = 0, imuPitch = 0, imuYaw = 0;
let bobX = 0, bobY = 0;

// ====================================================================
// INTEGRASI WEBSOCKET TELEMETRY (REAL DATA)
// ====================================================================
let target = { roll: 0, pitch: 0, yaw: 0, bobX: 0, bobY: 0 };

// Sambungkan ke WebSocket Server Raspberry Pi
const wsUrl = "ws://192.168.99.65:8082";
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
    console.log("%c[WS LOG] Terhubung ke Telemetry Bridge ROV Sagara!", "color: #00ff00; font-weight: bold;");
};

ws.onmessage = (event) => {
    try {
        const telemetry = JSON.parse(event.data);

        // Update target utama berdasarkan data asli sensor Pixhawk
        target.roll = telemetry.roll;
        target.pitch = telemetry.pitch;
        target.yaw = telemetry.yaw;

        // Bobbing tipis-tipis berdasarkan kemiringan
        target.bobX = (telemetry.roll * 0.3);
        target.bobY = (telemetry.pitch * 0.3);

    } catch (error) {
        console.error("[WS ERROR] Gagal membaca payload JSON:", error);
    }
};

ws.onerror = (error) => {
    console.error("[WS ERROR] Gangguan koneksi WebSocket:", error);
};

ws.onclose = () => {
    console.warn("[WS WARNING] Koneksi WebSocket terputus.");
};

function signedDeg(value) {
    return (value >= 0 ? "+" : "") + value.toFixed(1) + "°";
}

function rotateVector3(vector, yawDeg, pitchDeg, rollDeg) {
    const yaw = yawDeg * Math.PI / 180;
    const pitch = pitchDeg * Math.PI / 180;
    const roll = rollDeg * Math.PI / 180;
    let { x, y, z } = vector;

    const cr = Math.cos(roll), sr = Math.sin(roll);
    [y, z] = [y * cr - z * sr, y * sr + z * cr];

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    [x, z] = [x * cp + z * sp, -x * sp + z * cp];

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    [x, y] = [x * cy - y * sy, x * sy + y * cy];

    return { x, y, z };
}

function updateAxisIndicator(yawDeg, pitchDeg, rollDeg) {
    const origin = { x: 52, y: 52 };
    const axisLength = 34;
    const axes = [
        { key: 'x', vector: { x: 1, y: 0, z: 0 } },
        { key: 'y', vector: { x: 0, y: -1, z: 0 } },
        { key: 'z', vector: { x: 0, y: 0, z: 1 } }
    ];

    axes.forEach((axis) => {
        const v = rotateVector3(axis.vector, yawDeg, pitchDeg, rollDeg);
        const depthScale = 0.78 + Math.max(-0.22, Math.min(0.22, v.z * 0.18));
        const end = { x: origin.x + v.x * axisLength * depthScale, y: origin.y + v.y * axisLength * depthScale };
        const label = { x: origin.x + v.x * (axisLength + 10) * depthScale, y: origin.y + v.y * (axisLength + 10) * depthScale };

        const line = document.getElementById(`axis-${axis.key}-line`);
        const text = document.getElementById(`axis-${axis.key}-label`);
        if (line) {
            line.setAttribute('x1', origin.x);
            line.setAttribute('y1', origin.y);
            line.setAttribute('x2', end.x.toFixed(1));
            line.setAttribute('y2', end.y.toFixed(1));
            line.style.opacity = String(0.72 + Math.max(0, v.z) * 0.28);
        }
        if (text) {
            text.setAttribute('x', label.x.toFixed(1));
            text.setAttribute('y', label.y.toFixed(1));
        }
    });
}

function shortestAngleDelta(from, to) {
    return ((to - from + 540) % 360) - 180;
}

function updateImu() {
    const rate = 0.1; // Responsif & Easing halus
    imuRoll += (target.roll - imuRoll) * rate;
    imuPitch += (target.pitch - imuPitch) * rate;
    imuYaw = (imuYaw + shortestAngleDelta(imuYaw, target.yaw) * rate + 360) % 360;
    bobX += (target.bobX - bobX) * rate;
    bobY += (target.bobY - bobY) * rate;

    // Update teks elemen HTML indikator
    const elRoll = document.getElementById('imu-roll');
    const elPitch = document.getElementById('imu-pitch');
    const elYaw = document.getElementById('imu-yaw');

    if (elRoll) elRoll.textContent = signedDeg(imuRoll);
    if (elPitch) elPitch.textContent = signedDeg(imuPitch);
    if (elYaw) elYaw.textContent = imuYaw.toFixed(1).padStart(5, "0") + "°";

    const displayYaw = imuYaw - 90;
    const attitudeTransform =
        `translate(calc(-50% + ${bobX.toFixed(2)}px), calc(-50% + ${bobY.toFixed(2)}px)) ` +
        `rotateZ(${displayYaw.toFixed(2)}deg) rotateX(${imuPitch.toFixed(2)}deg) rotateY(${(-imuRoll).toFixed(2)}deg)`;

    const model = document.getElementById('rov-model');
    if (model) {
        model.style.transform = attitudeTransform;
    }

    updateAxisIndicator(displayYaw, imuPitch, imuRoll);
}

let lastTime = performance.now();
function mainLoop(now) {
    const dt = now - lastTime;
    lastTime = now;
    simTime += dt;
    updateImu();
    requestAnimationFrame(mainLoop);
}
requestAnimationFrame(mainLoop);