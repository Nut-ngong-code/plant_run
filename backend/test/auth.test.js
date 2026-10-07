// กลุ่ม 1 — สิทธิ์ของผู้ใช้เว็บ (session cookie + IDOR)
// เดิม backend เชื่อ userId ที่ส่งมาใน body/URL → ใครก็ดู/ใช้แต้ม/ลบกระถางของคนอื่นได้
// เทสชุดนี้ยืนยันว่า (1) ไม่มี cookie = 401 (2) cookie ปลอม/หมดอายุ = 401 (3) ของคนอื่น = 403
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { createSessionValue, SESSION_COOKIE } from "../src/lib/session.js";
import { prisma, resetDb, createUser, createDevice, cookieFor } from "./helpers.js";

let alice, bob, alicePot, bobPot;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: "Alice", points: 100 });
  bob = await createUser({ name: "Bob", points: 100 });
  alicePot = await createDevice(alice.id, "POT-A");
  bobPot = await createDevice(bob.id, "POT-B");
});

afterAll(() => prisma.$disconnect());

const pointsOf = async (userId) => (await prisma.user.findUnique({ where: { id: userId } })).totalPoints;

describe("ไม่มี cookie → 401 ทุก API ของผู้ใช้", () => {
  // เส้นทางจริงทั้งหมดที่ต้อง login — เพิ่มเส้นทางใหม่ที่นี่ทุกครั้งที่สร้าง API ของผู้ใช้
  const routes = () => [
    ["get", `/api/user/${alice.id}/dashboard`],
    ["get", `/api/user/${alice.id}/history`],
    ["get", "/api/auth/me"],
    ["get", "/api/device/POT-A/soil-history"],
    ["post", "/api/action", { deviceId: "POT-A", actionType: "water" }],
    ["post", "/api/device", { deviceId: "POT-NEW" }],
    ["post", "/api/device/POT-A/rotate-token"],
    ["delete", "/api/device/POT-A"],
    ["post", `/api/auth/strava/sync/${alice.id}`],
  ];

  it("ทุกเส้นทางตอบ 401", async () => {
    for (const [method, path, body] of routes()) {
      const res = await request(app)[method](path).send(body);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(401);
    }
  });

  it("ไม่มีอะไรเปลี่ยนในฐานข้อมูล", async () => {
    for (const [method, path, body] of routes()) await request(app)[method](path).send(body);
    expect(await pointsOf(alice.id)).toBe(100);
    expect(await prisma.device.count()).toBe(2);
  });
});

describe("cookie ที่ใช้ไม่ได้ → 401", () => {
  const me = (cookie) => request(app).get("/api/auth/me").set("Cookie", cookie);

  it("cookie ถูกต้อง → ได้ตัวเอง", async () => {
    const res = await me(cookieFor(alice.id));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(alice.id);
  });

  it("แก้ userId ใน cookie เป็นของ Bob (ลายเซ็นเดิม) → 401", async () => {
    const value = createSessionValue(alice.id).replace(/^\d+\./, `${bob.id}.`);
    expect((await me(`${SESSION_COOKIE}=${value}`)).status).toBe(401);
  });

  it("ลายเซ็นมั่ว → 401", async () => {
    expect((await me(`${SESSION_COOKIE}=${alice.id}.9999999999.fake`)).status).toBe(401);
  });

  it("cookie หมดอายุ (ออกเมื่อ 31 วันก่อน) → 401", async () => {
    const old = createSessionValue(alice.id, Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect((await me(`${SESSION_COOKIE}=${old}`)).status).toBe(401);
  });
});

describe("ข้อมูลของคนอื่น → 403 และข้อมูลไม่เปลี่ยน", () => {
  const asAlice = (req) => req.set("Cookie", cookieFor(alice.id));

  it("ดู dashboard ตัวเองได้ · ของ Bob ไม่ได้", async () => {
    expect((await asAlice(request(app).get(`/api/user/${alice.id}/dashboard`))).status).toBe(200);
    expect((await asAlice(request(app).get(`/api/user/${bob.id}/dashboard`))).status).toBe(403);
    expect((await asAlice(request(app).get(`/api/user/${bob.id}/history`))).status).toBe(403);
  });

  it("สั่งรดน้ำกระถางของ Bob → 403 แต้มไม่ถูกหัก", async () => {
    const res = await asAlice(request(app).post("/api/action")).send({ deviceId: "POT-B", actionType: "water" });
    expect(res.status).toBe(403);
    expect(await pointsOf(alice.id)).toBe(100);
    expect(await pointsOf(bob.id)).toBe(100);
  });

  it("ใส่ userId ของ Bob ใน body → ระบบไม่สนใจ หักแต้มของเจ้าของ cookie", async () => {
    const res = await asAlice(request(app).post("/api/action")).send({
      userId: bob.id,
      deviceId: "POT-A",
      actionType: "water",
    });
    expect(res.status).toBe(201);
    expect(await pointsOf(alice.id)).toBe(85);
    expect(await pointsOf(bob.id)).toBe(100);
  });

  it("rotate token / ลบ / ดูกราฟความชื้น ของกระถาง Bob → 403", async () => {
    const before = await prisma.device.findUnique({ where: { deviceId: "POT-B" } });
    expect((await asAlice(request(app).post("/api/device/POT-B/rotate-token"))).status).toBe(403);
    expect((await asAlice(request(app).delete("/api/device/POT-B"))).status).toBe(403);
    expect((await asAlice(request(app).get("/api/device/POT-B/soil-history"))).status).toBe(403);

    const after = await prisma.device.findUnique({ where: { deviceId: "POT-B" } });
    expect(after).not.toBeNull(); // ยังไม่ถูกลบ
    expect(after.authTokenHash).toBe(before.authTokenHash); // token ไม่ถูกเปลี่ยน
  });

  it("ลงทะเบียน Device ID ของ Bob ซ้ำ (ยึดกระถาง) → 409 กระถางยังเป็นของ Bob", async () => {
    const res = await asAlice(request(app).post("/api/device")).send({ deviceId: "POT-B" });
    expect(res.status).toBe(409);
    const pot = await prisma.device.findUnique({ where: { deviceId: "POT-B" } });
    expect(pot.userId).toBe(bob.id);
  });

  it("Strava sync ของ Bob → 403", async () => {
    expect((await asAlice(request(app).post(`/api/auth/strava/sync/${bob.id}`))).status).toBe(403);
  });
});

describe("DEV login และ logout", () => {
  it("DEV login ปิดอยู่ (ไม่ได้ตั้ง ALLOW_DEV_LOGIN=true) → 404 และไม่ออก cookie", async () => {
    const res = await request(app).post("/api/auth/dev-login").send({ userId: alice.id });
    expect(res.status).toBe(404);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("logout → ล้าง cookie", async () => {
    const res = await request(app).post("/api/auth/logout").set("Cookie", cookieFor(alice.id));
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]?.[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
  });
});
