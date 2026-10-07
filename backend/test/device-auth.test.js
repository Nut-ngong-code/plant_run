// กลุ่ม 2 — Token ของอุปกรณ์ (Bearer)
// ESP32 ส่งค่าความชื้นผ่าน HTTP แบบสำรอง: POST /api/sensor + header Authorization: Bearer <token>
// ยืนยันว่า (1) ไม่มี/ผิด token = 401 (2) เอา token ของกระถางหนึ่งไปอ้างเป็นอีกกระถางไม่ได้
// (3) rotate แล้ว token เก่าใช้ไม่ได้ทันที
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { prisma, resetDb, createUser, createDevice, cookieFor } from "./helpers.js";

let alice, alicePot, bobPot;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: "Alice" });
  const bob = await createUser({ name: "Bob" });
  alicePot = await createDevice(alice.id, "POT-A");
  bobPot = await createDevice(bob.id, "POT-B");
});

afterAll(() => prisma.$disconnect());

// ส่งค่าความชื้นแบบที่ ESP32 ส่ง — token = undefined คือไม่ใส่ header เลย
const sendSensor = (deviceId, token, moisturePercent = 40) => {
  const req = request(app).post("/api/sensor");
  if (token !== undefined) req.set("Authorization", `Bearer ${token}`);
  return req.send({ deviceId, moisturePercent });
};

describe("Bearer token ของอุปกรณ์", () => {
  it("POST /api/sensor ไม่มี Authorization → 401", async () => {
    const res = await sendSensor("POT-A", undefined);
    expect(res.status).toBe(401);
    expect(await prisma.soilLog.count()).toBe(0);
  });

  it("POST /api/sensor token ผิด → 401", async () => {
    const res = await sendSensor("POT-A", "0".repeat(64));
    expect(res.status).toBe(401);
    expect(await prisma.soilLog.count()).toBe(0);
  });

  it("POST /api/sensor token ถูก → 201 และมีแถวใน SOIL_LOG", async () => {
    const res = await sendSensor("POT-A", alicePot.token, 40);
    expect(res.status).toBe(201);

    const logs = await prisma.soilLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].deviceId).toBe(alicePot.device.id);
    expect(logs[0].moisturePercent).toBe(40);
  });

  it("token ของกระถาง A ใช้ส่งค่าในนามกระถาง B ไม่ได้ → 401", async () => {
    // ปลอมตัวเป็นกระถางของ Bob ด้วย token ของ Alice
    const res = await sendSensor("POT-B", alicePot.token);
    expect(res.status).toBe(401);
    expect(await prisma.soilLog.count({ where: { deviceId: bobPot.device.id } })).toBe(0);
  });

  it("rotate token แล้ว token เก่าใช้ไม่ได้ทันที → 401 · token ใหม่ใช้ได้", async () => {
    const oldToken = alicePot.token;
    expect((await sendSensor("POT-A", oldToken)).status).toBe(201); // ก่อน rotate ใช้ได้

    const rotate = await request(app)
      .post("/api/device/POT-A/rotate-token")
      .set("Cookie", cookieFor(alice.id));
    expect(rotate.status).toBe(200);
    const newToken = rotate.body.deviceToken;
    expect(newToken).toHaveLength(64);
    expect(newToken).not.toBe(oldToken);

    expect((await sendSensor("POT-A", oldToken)).status).toBe(401); // token เก่าตายทันที
    expect((await sendSensor("POT-A", newToken)).status).toBe(201); // token ใหม่ใช้ได้
  });
});
