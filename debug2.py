import asyncio
import websockets
import json
import math
from pymavlink import mavutil

try:
    pixhawk_link = mavutil.mavlink_connection('udpout:127.0.0.1:14660')
    print("[SUCCESS] Berhasil terhubung ke MAVLink via UDP (Mode Client/Udpout).")
    print("[INFO] Mengirim sapaan Heartbeat & Request Stream ke Pixhawk...")
    pixhawk_link.mav.heartbeat_send(
        mavutil.mavlink.MAV_TYPE_GCS,
        mavutil.mavlink.MAV_AUTOPILOT_INVALID,
        0, 0, 0
    )
    pixhawk_link.mav.request_data_stream_send(
        pixhawk_link.target_system,
        pixhawk_link.target_component,
        mavutil.mavlink.MAV_DATA_STREAM_EXTRA1,
        20,
        1
    )
    print("[SUCCESS] Jalur data telemetry berhasil dipancing!")
except Exception as e:
    print(f"[FATAL] Gagal inisialisasi koneksi MAVLink: {e}")
    exit(1)

connected_clients = set()

async def handler(websocket):
    connected_clients.add(websocket)
    print(f"[WS CLIENT] Client baru terhubung dari: {websocket.remote_address}")
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.remove(websocket)
        print(f"[WS CLIENT] Client {websocket.remote_address} terputus.")

async def read_pixhawk_telemetry():
    print("\n[INFO] Mulai mendengarkan data ATTITUDE dari Pixhawk...")
    last_print_time = 0
    while True:
        try:
            msg = pixhawk_link.recv_match(type='ATTITUDE', blocking=False)
            if msg:
                roll_deg = math.degrees(msg.roll)
                pitch_deg = math.degrees(msg.pitch)
                yaw_deg = (math.degrees(msg.yaw) + 360) % 360
                current_time = asyncio.get_event_loop().time()
                if current_time - last_print_time >= 0.5:
                    print(f"[RAW MAVLINK] Roll: {roll_deg:.2f}° | Pitch: {pitch_deg:.2f}° | Yaw: {yaw_deg:.2f}°")
                    last_print_time = current_time
                telemetry_data = {"roll": roll_deg, "pitch": pitch_deg, "yaw": yaw_deg}
                if connected_clients:
                    payload = json.dumps(telemetry_data)
                    await asyncio.gather(*[client.send(payload) for client in connected_clients], return_exceptions=True)
        except Exception as e:
            print(f"[WARNING] Gangguan pembacaan data: {e}")
        await asyncio.sleep(0.01)

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8082):
        print("[SERVER ACTIVE] Telemetry Bridge ROV aktif di ws://0.0.0.0:8082")
        print("[INFO] Menunggu client terhubung dan data Pixhawk masuk...")
        await read_pixhawk_telemetry()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[STOP] Telemetry Bridge dimatikan oleh user.")
