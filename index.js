let simTime = 0;
let imuRoll = 0, imuPitch = 0, imuYaw = 0;
let bobX = 0, bobY = 0;

let target = { roll: 0, pitch: 0, yaw: 0, bobX: 0, bobY: 0 };

// ====================================================================
// CACHE DOM ELEMENTS (Meringankan proses render 60 FPS)
// ====================================================================
const elRoll = document.getElementById('imu-roll');
const elPitch = document.getElementById('imu-pitch');
const elYaw = document.getElementById('imu-yaw');
const model = document.getElementById('rov-model');

const axisElements = {
    x: { line: document.getElementById('axis-x-line'), text: document.getElementById('axis-x-label') },
    y: { line: document.getElementById('axis-y-line'), text: document.getElementById('axis-y-label') },
    z: { line: document.getElementById('axis-z-line'), text: document.getElementById('axis-z-label') }
};

// ====================================================================
// WEBSOCKET (REAL DATA) - Ganti dengan IP Jetson Nano
// ====================================================================
const wsUrl = "ws://192.168.99.17:8082";
const ws = new WebSocket(wsUrl);

ws.onopen = () => {
    console.log("%c[WS LOG] Terhubung ke Telemetry Bridge ROV Sagara!", "color: #00ff00; font-weight: bold;");
};

ws.onmessage = (event) => {
    try {
        const telemetry = JSON.parse(event.data);
        
        target.roll = telemetry.roll;
        target.pitch = telemetry.pitch;
        target.yaw = telemetry.yaw;
        target.bobX = telemetry.roll * 0.3;
        target.bobY = telemetry.pitch * 0.3;

    } catch (error) {
        console.error("[WS ERROR] Gagal parse JSON:", error);
    }
};

ws.onerror = (error) => console.error("[WS ERROR] Gangguan WebSocket:", error);
ws.onclose = () => console.warn("[WS WARNING] WebSocket terputus.");

// ====================================================================
// MATEMATIKA PERHITUNGAN 3D
// ====================================================================
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

        const { line, text } = axisElements[axis.key];
        
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

// ====================================================================
// UPDATE & RENDER LOOP
// ====================================================================
function updateImu() {
    const rate = 0.1; // Smooth interpolation
    imuRoll += (target.roll - imuRoll) * rate;
    imuPitch += (target.pitch - imuPitch) * rate;
    imuYaw = (imuYaw + shortestAngleDelta(imuYaw, target.yaw) * rate + 360) % 360;
    bobX += (target.bobX - bobX) * rate;
    bobY += (target.bobY - bobY) * rate;

    // Update Teks Layar
    if (elRoll) elRoll.textContent = signedDeg(imuRoll);
    if (elPitch) elPitch.textContent = signedDeg(imuPitch);
    if (elYaw) elYaw.textContent = imuYaw.toFixed(1).padStart(5, "0") + "°";

    const displayYaw = imuYaw - 90;
    const attitudeTransform = 
        `translate(calc(-50% + ${bobX.toFixed(2)}px), calc(-50% + ${bobY.toFixed(2)}px)) ` +
        `rotateZ(${displayYaw.toFixed(2)}deg) rotateX(${imuPitch.toFixed(2)}deg) rotateY(${(-imuRoll).toFixed(2)}deg)`;

    // Aplikasikan Transform ke Model
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

// Mulai Loop Animasi
requestAnimationFrame(mainLoop);
