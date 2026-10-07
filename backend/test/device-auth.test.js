// กลุ่ม 2 — Token ของอุปกรณ์ (Bearer) · 📝 ให้เติมเอง ดูแบบจาก auth.test.js
// ใช้ API แบบ HTTP สำรองของ ESP32: POST /api/sensor · GET /api/device/:id/command
// header: .set("Authorization", `Bearer ${token}`) — token มาจาก createDevice(...)
import { describe, it } from "vitest";

describe("Bearer token ของอุปกรณ์", () => {
  it.todo("POST /api/sensor ไม่มี Authorization → 401");
  it.todo("POST /api/sensor token ผิด → 401");
  it.todo("POST /api/sensor token ถูก → 201 และมีแถวใน SOIL_LOG");
  it.todo("token ของกระถาง A ใช้ส่งค่าในนามกระถาง B ไม่ได้ (deviceId ใน body เป็นของ B) → 401/403");
  it.todo("rotate token แล้ว token เก่าใช้ไม่ได้ทันที → 401 · token ใหม่ใช้ได้");
});
