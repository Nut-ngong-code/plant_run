// กลุ่ม 3 — แต้มและการกดรัว (race condition) · เฉลยแบบฝึกเติมคำ (2026-10-08)
//
// รัน: pnpm exec vitest run test/points.test.js
//
// ข้อมูลที่ต้องรู้ (อ่านเพิ่มได้ใน src/routes/action.js):
//   - รดน้ำใช้ 15 แต้ม · ให้ปุ๋ยใช้ 20 แต้ม · ทุกเทส Alice เริ่มที่ 100 แต้ม
//   - สำเร็จ → status 201 + body { action, remainingPoints }
//   - แต้มไม่พอ → status 400 + body { error: "insufficient_points", currentPoints, required }
//   - คำสั่งใหม่ถูกเก็บใน ACTION_LOG สถานะ "pending" (รอบอร์ดมารับ — ในเทสไม่มีบอร์ด เลยค้างเป็น pending)
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { prisma, resetDb, createUser, createDevice, cookieFor } from "./helpers.js";

let alice;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: "Alice", points: 100 });
  await createDevice(alice.id, "POT-A");
});

afterAll(() => prisma.$disconnect());

// อ่านแต้มปัจจุบันจากฐานข้อมูล
const pointsOf = async (userId) => (await prisma.user.findUnique({ where: { id: userId } })).totalPoints;

// กดรดน้ำในนาม Alice — เหมือนกดปุ่ม WATER บนเว็บ
const water = () =>
  request(app).post("/api/action").set("Cookie", cookieFor(alice.id)).send({ deviceId: "POT-A", actionType: "water" });

describe("แต้ม", () => {
  it("แต้ม 10 สั่งรดน้ำ (15) → 400 insufficient_points และแต้มยัง 10", async () => {
    // ขั้น 1 เตรียม: ตั้งแต้มของ Alice ให้เหลือ 10
    await prisma.user.update({ where: { id: alice.id }, data: { totalPoints: 10 } });

    // ขั้น 2 ทำ: กดรดน้ำ
    const res = await water();

    // ขั้น 3 ตรวจ: แต้มไม่พอ backend ตอบ status อะไร และ error ว่าอะไร
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("insufficient_points");

    // ขั้น 4 ตรวจ: แต้มต้องไม่ถูกหัก
    expect(await pointsOf(alice.id)).toBe(10);
  });

  it("รดน้ำสำเร็จ → 201 แต้มลด 15 และมี ACTION_LOG สถานะ pending", async () => {
    const res = await water();

    expect(res.status).toBe(201);
    expect(res.body.remainingPoints).toBe(85); // 100 - 15

    // ดูแถวที่ถูกสร้างใน ACTION_LOG
    const log = await prisma.actionLog.findFirst();
    expect(log.status).toBe("pending");
    expect(log.actionType).toBe("water");
    expect(log.pointsDeducted).toBe(15);
  });

  it("แต้ม 20 ยิงรดน้ำพร้อมกัน 5 ครั้ง → สำเร็จแค่ 1 ครั้ง แต้มเหลือ 5 ไม่ติดลบ", async () => {
    await prisma.user.update({ where: { id: alice.id }, data: { totalPoints: 20 } });

    // Promise.all = ส่งทั้ง 5 คำขอออกไป "พร้อมกัน" แล้วรอผลทุกตัว (เหมือนผู้ใช้กดปุ่มรัว ๆ)
    // ถ้า backend เช็คแต้มกับหักแต้มแยกกัน ทั้ง 5 คำขอจะเห็นแต้ม 20 แล้วหักซ้อนจนติดลบ
    const results = await Promise.all([water(), water(), water(), water(), water()]);

    // filter = เลือกเฉพาะตัวที่ตรงเงื่อนไข · .length = นับว่ามีกี่ตัว
    const success = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 400).length;

    expect(success).toBe(1); // แต้ม 20 พอรดน้ำได้ครั้งเดียว
    expect(rejected).toBe(4); // อีก 4 ครั้งต้องถูกปฏิเสธ
    expect(await pointsOf(alice.id)).toBe(5); // 20 - 15 · ไม่ติดลบ
    expect(await prisma.actionLog.count()).toBe(1); // บันทึกคำสั่งแค่ตัวที่สำเร็จ
  });

  it("ลบกระถางที่มีคำสั่ง pending → คืนแต้มที่หักไว้", async () => {
    // ขั้น 1: กดรดน้ำ 1 ครั้ง (ไม่มีบอร์ดมารับ คำสั่งเลยค้างเป็น pending)
    expect((await water()).status).toBe(201);
    expect(await pointsOf(alice.id)).toBe(85);

    // ขั้น 2: ลบกระถาง (ต้องเป็นเจ้าของ → ใช้ cookie ของ Alice)
    const res = await request(app).delete("/api/device/POT-A").set("Cookie", cookieFor(alice.id));
    expect(res.status).toBe(200);

    // ขั้น 3: backend บอกว่าคืนแต้มไปเท่าไร (ชื่อ field คือ refunded)
    expect(res.body.refunded).toBe(15);

    // ขั้น 4: แต้มต้องกลับมาเท่าตอนเริ่ม
    expect(await pointsOf(alice.id)).toBe(100);
  });
});
