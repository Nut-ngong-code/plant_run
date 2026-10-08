// กลุ่ม 4 — คิวคำสั่ง, ack และการคืนแต้ม
// ESP32 รายงานผลคำสั่งด้วย ack (ผ่าน MQTT หรือ HTTP สำรอง) → applyAck() ใน src/lib/commands.js
// ยืนยันว่า (1) ack failed = คืนแต้ม (2) ack ซ้ำไม่คืนแต้มซ้ำ (3) กระถางหนึ่ง ack คำสั่งของอีกกระถางไม่ได้
// (4) คำสั่งที่ค้างเพราะบอร์ดดับระหว่างทำงาน ถูก cleanup job คืนแต้มให้เอง
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { applyAck } from "../src/lib/commands.js";
import { cleanupStaleCommands } from "../src/jobs/cleanupStale.js";
import { prisma, resetDb, createUser, createDevice } from "./helpers.js";

let alice, alicePot, bobPot;

beforeEach(async () => {
  await resetDb();
  // แต้ม 85 = เหมือนเพิ่งกดรดน้ำ (100 - 15) แล้วคำสั่งกำลังทำงานอยู่
  alice = await createUser({ name: "Alice", points: 85 });
  const bob = await createUser({ name: "Bob" });
  alicePot = await createDevice(alice.id, "POT-A");
  bobPot = await createDevice(bob.id, "POT-B");
});

afterAll(() => prisma.$disconnect());

const pointsOf = async (userId) => (await prisma.user.findUnique({ where: { id: userId } })).totalPoints;
const statusOf = async (id) => (await prisma.actionLog.findUnique({ where: { id } })).status;

// คำสั่งรดน้ำที่ส่งให้บอร์ดไปแล้ว (executing) — secondsAgo = ส่งไปเมื่อกี่วินาทีก่อน
const createExecuting = (secondsAgo = 5) =>
  prisma.actionLog.create({
    data: {
      userId: alice.id,
      deviceId: alicePot.device.id,
      actionType: "water",
      status: "executing",
      pointsDeducted: 15,
      durationSeconds: 5,
      executedAt: new Date(Date.now() - secondsAgo * 1000),
    },
  });

describe("ack และการคืนแต้ม (applyAck)", () => {
  it("ack success → สถานะ success และไม่คืนแต้ม", async () => {
    const cmd = await createExecuting();
    const result = await applyAck(alicePot.device.id, cmd.id, "success");

    expect(result.applied).toBe(true);
    expect(await statusOf(cmd.id)).toBe("success");
    expect(await pointsOf(alice.id)).toBe(85);
  });

  it("ack failed → สถานะ failed + คืนแต้ม 15", async () => {
    const cmd = await createExecuting();
    const result = await applyAck(alicePot.device.id, cmd.id, "failed");

    expect(result.applied).toBe(true);
    expect(await statusOf(cmd.id)).toBe("failed");
    expect(await pointsOf(alice.id)).toBe(100);
  });

  it("ack failed ซ้ำ 2 ครั้ง (MQTT ส่งซ้ำได้) → คืนแต้มครั้งเดียว", async () => {
    const cmd = await createExecuting();
    const first = await applyAck(alicePot.device.id, cmd.id, "failed");
    const second = await applyAck(alicePot.device.id, cmd.id, "failed");

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false); // ครั้งที่สองถูกเมิน เพราะไม่ใช่ executing แล้ว
    expect(await pointsOf(alice.id)).toBe(100); // ไม่ใช่ 115
  });

  it("กระถาง B ack คำสั่งของกระถาง A → ไม่มีผล (ช่องโหว่เดิมก่อนเปลี่ยนเป็น MQTT)", async () => {
    const cmd = await createExecuting();
    const result = await applyAck(bobPot.device.id, cmd.id, "failed");

    expect(result).toBeNull(); // ไม่ใช่คำสั่งของกระถาง B
    expect(await statusOf(cmd.id)).toBe("executing");
    expect(await pointsOf(alice.id)).toBe(85); // ไม่ได้แต้มคืนฟรี
  });

  it("ack ผ่าน HTTP ด้วย token ของกระถาง B → 404 และคำสั่งของ A ไม่เปลี่ยน", async () => {
    const cmd = await createExecuting();
    const res = await request(app)
      .post(`/api/device/POT-B/command/${cmd.id}/ack`)
      .set("Authorization", `Bearer ${bobPot.token}`)
      .send({ status: "failed" });

    expect(res.status).toBe(404);
    expect(await statusOf(cmd.id)).toBe("executing");
    expect(await pointsOf(alice.id)).toBe(85);
  });
});

describe("cleanup job — บอร์ดดับระหว่างทำงาน", () => {
  it("คำสั่ง executing ค้างเกิน 180 วิ → failed + คืนแต้ม · ที่เพิ่งส่งไม่ถูกแตะ", async () => {
    const stuck = await createExecuting(200); // ส่งไป 200 วิแล้วไม่มี ack = บอร์ดน่าจะดับ
    const fresh = await createExecuting(10); // เพิ่งส่ง 10 วิ ยังรอได้

    const result = await cleanupStaleCommands();

    expect(result.cleaned).toBe(1);
    expect(await statusOf(stuck.id)).toBe("failed");
    expect(await statusOf(fresh.id)).toBe("executing");
    expect(await pointsOf(alice.id)).toBe(100); // คืนแค่ของคำสั่งที่ค้าง
  });

  it("ack มาช้าหลัง cleanup คืนแต้มไปแล้ว → ไม่คืนซ้ำ", async () => {
    const stuck = await createExecuting(200);
    await cleanupStaleCommands(); // คืนแต้มไปแล้ว 85 → 100

    const late = await applyAck(alicePot.device.id, stuck.id, "failed");
    expect(late.applied).toBe(false);
    expect(await pointsOf(alice.id)).toBe(100);
  });
});
