// กลุ่ม 5 — MQTT broker · 📝 ให้เติมเอง
// เปิด broker บนพอร์ตสุ่ม: const server = startMqtt(18830) (src/lib/mqtt.js) แล้ว server.close() ใน afterAll
// client: ติดตั้ง `pnpm add -D mqtt` แล้วใช้ mqtt.connectAsync("mqtt://127.0.0.1:18830", { username: deviceId, password: token })
import { describe, it } from "vitest";

describe("MQTT", () => {
  it.todo("รหัสผิด → ต่อไม่ได้ (connack ถูกปฏิเสธ)");
  it.todo("รหัสถูก → ต่อได้ และ dashboard แสดง isOnline = true");
  it.todo("publish ไป plant/<กระถางอื่น>/sensor → ถูกตัดการเชื่อมต่อ ไม่มีแถวใหม่ใน SOIL_LOG");
  it.todo("subscribe plant/<กระถางอื่น>/cmd → ถูกปฏิเสธ");
  it.todo("ค่า ip ที่ไม่ใช่วงส่วนตัว (เช่น 8.8.8.8) → ไม่ถูกเก็บ แต่ค่าความชื้นยังบันทึก");
});
