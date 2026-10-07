// กลุ่ม 3 — แต้มและการกดรัว (race condition) · 📝 แบบฝึกเติมคำ
//
// วิธีทำ:
//   1. เปลี่ยน it.skip → it ทีละข้อ (ข้อที่ยัง skip จะไม่รัน)
//   2. เติมทุกจุดที่เขียนว่า ___ (ตัวเลข) หรือ "___" (ข้อความ)
//   3. รัน: pnpm exec vitest run test/points.test.js
//   4. ผ่านครบทั้ง 4 ข้อแล้ว ลบบรรทัด `const ___ = undefined;` ข้างล่างทิ้ง
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

const ___ = undefined; // ตัวแทนช่องว่าง — เติมครบแล้วลบบรรทัดนี้

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
  it.skip("แต้ม 10 สั่งรดน้ำ (15) → 400 insufficient_points และแต้มยัง 10", async () => {
    // ขั้น 1 เตรียม: ตั้งแต้มของ Alice ให้เหลือ 10
    await prisma.user.update({ where: { id: alice.id }, data: { totalPoints: ___ } });

    // ขั้น 2 ทำ: กดรดน้ำ
    const res = await water();

    // ขั้น 3 ตรวจ: แต้มไม่พอ backend ตอบ status อะไร และ error ว่าอะไร
    expect(res.status).toBe(___);
    expect(res.body.error).toBe("___");

    // ขั้น 4 ตรวจ: แต้มต้องไม่ถูกหัก
    expect(await pointsOf(alice.id)).toBe(___);
  });

  it.skip("รดน้ำสำเร็จ → 201 แต้มลด 15 และมี ACTION_LOG สถานะ pending", async () => {
    const res = await water();

    expect(res.status).toBe(___);
    expect(res.body.remainingPoints).toBe(___); // 100 - 15

    // ดูแถวที่ถูกสร้างใน ACTION_LOG
    const log = await prisma.actionLog.findFirst();
    expect(log.status).toBe("___");
    expect(log.actionType).toBe("___");
    expect(log.pointsDeducted).toBe(___);
  });

  it.skip("แต้ม 20 ยิงรดน้ำพร้อมกัน 5 ครั้ง → สำเร็จแค่ 1 ครั้ง แต้มเหลือ 5 ไม่ติดลบ", async () => {
    await prisma.user.update({ where: { id: alice.id }, data: { totalPoints: 20 } });

    // Promise.all = ส่งทั้ง 5 คำขอออกไป "พร้อมกัน" แล้วรอผลทุกตัว (เหมือนผู้ใช้กดปุ่มรัว ๆ)
    // ถ้า backend เช็คแต้มกับหักแต้มแยกกัน ทั้ง 5 คำขอจะเห็นแต้ม 20 แล้วหักซ้อนจนติดลบ
    const results = await Promise.all([water(), water(), water(), water(), water()]);

    // filter = เลือกเฉพาะตัวที่ตรงเงื่อนไข · .length = นับว่ามีกี่ตัว
    const success = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === ___).length;

    expect(success).toBe(___);
    expect(rejected).toBe(___);
    expect(await pointsOf(alice.id)).toBe(___); // 20 - 15
    expect(await prisma.actionLog.count()).toBe(___); // มีคำสั่งถูกบันทึกกี่แถว
  });

  it.skip("ลบกระถางที่มีคำสั่ง pending → คืนแต้มที่หักไว้", async () => {
    // ขั้น 1: กดรดน้ำ 1 ครั้ง (ไม่มีบอร์ดมารับ คำสั่งเลยค้างเป็น pending)
    expect((await water()).status).toBe(201);
    expect(await pointsOf(alice.id)).toBe(___);

    // ขั้น 2: ลบกระถาง (ต้องเป็นเจ้าของ → ใช้ cookie ของ Alice)
    const res = await request(app).delete("/api/device/POT-A").set("Cookie", cookieFor(alice.id));
    expect(res.status).toBe(200);

    // ขั้น 3: backend บอกว่าคืนแต้มไปเท่าไร (ชื่อ field คือ refunded)
    expect(res.body.refunded).toBe(___);

    // ขั้น 4: แต้มต้องกลับมาเท่าตอนเริ่ม
    expect(await pointsOf(alice.id)).toBe(___);
  });
});
