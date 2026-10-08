// กลุ่ม 6 — ข้อมูลที่ส่งเข้ามา + open redirect
// (1) ข้อมูลผิดรูปแบบต้องถูกปฏิเสธด้วย 400 ตั้งแต่ทางเข้า (Zod) และไม่มีอะไรถูกบันทึก/หักแต้ม
// (2) ลิงก์ login Strava ต้องพาผู้ใช้กลับมาได้เฉพาะเว็บของเราเอง — ไม่งั้นคนร้ายส่งลิงก์ที่ login จริง
//     แต่เด้งไปเว็บปลอมได้ (open redirect)
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { prisma, resetDb, createUser, createDevice, cookieFor } from "./helpers.js";

let alice, alicePot;

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: "Alice", points: 100 });
  alicePot = await createDevice(alice.id, "POT-A");
});

afterAll(() => prisma.$disconnect());

const pointsOf = async (userId) => (await prisma.user.findUnique({ where: { id: userId } })).totalPoints;
const action = (body) => request(app).post("/api/action").set("Cookie", cookieFor(alice.id)).send(body);

describe("ตรวจข้อมูลขาเข้า (Zod)", () => {
  it("actionType ไม่ใช่ water/fertilizer → 400", async () => {
    expect((await action({ deviceId: "POT-A", actionType: "dance" })).status).toBe(400);
  });

  it("durationSeconds เกิน 120 (เปิดน้ำนานผิดปกติ) → 400", async () => {
    expect((await action({ deviceId: "POT-A", actionType: "water", durationSeconds: 500 })).status).toBe(400);
  });

  it("deviceId ว่าง → 400", async () => {
    expect((await action({ deviceId: "", actionType: "water" })).status).toBe(400);
  });

  it("คำขอที่ถูกปฏิเสธทั้งหมด ไม่หักแต้มและไม่สร้างคำสั่ง", async () => {
    await action({ deviceId: "POT-A", actionType: "dance" });
    await action({ deviceId: "POT-A", actionType: "water", durationSeconds: 500 });
    expect(await pointsOf(alice.id)).toBe(100);
    expect(await prisma.actionLog.count()).toBe(0);
  });

  it("ค่าความชื้นเกิน 100% จากอุปกรณ์ → 400 ไม่บันทึก", async () => {
    const res = await request(app)
      .post("/api/sensor")
      .set("Authorization", `Bearer ${alicePot.token}`)
      .send({ deviceId: "POT-A", moisturePercent: 150 });
    expect(res.status).toBe(400);
    expect(await prisma.soilLog.count()).toBe(0);
  });
});

describe("Strava login redirect (กัน open redirect)", () => {
  // เปิด /api/auth/strava/login?return_to=... แล้วดูว่า backend จำปลายทางขากลับไว้ว่าอะไร
  // ปลายทางถูกเก็บใน state ของลิงก์ที่ส่งไป Strava (base64url ของ JSON { returnTo })
  const returnToFor = async (returnTo) => {
    const res = await request(app).get("/api/auth/strava/login").query({ return_to: returnTo });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.hostname).toBe("www.strava.com");
    const state = JSON.parse(Buffer.from(location.searchParams.get("state"), "base64url").toString());
    return state.returnTo;
  };

  it("โดเมนหน้าตาคล้าย evil-ts.net → ไม่รับ (null)", async () => {
    expect(await returnToFor("https://evil-ts.net")).toBeNull();
  });

  it("ts.net ปลอมที่ต่อท้ายโดเมนคนร้าย → ไม่รับ (null)", async () => {
    expect(await returnToFor("https://plantvm.tailbfad61.ts.net.attacker.com")).toBeNull();
  });

  it("javascript: → ไม่รับ (null)", async () => {
    expect(await returnToFor("javascript:alert(1)")).toBeNull();
  });

  it("เว็บของเราเอง (Funnel) → รับ", async () => {
    expect(await returnToFor("https://plantvm.tailbfad61.ts.net")).toBe("https://plantvm.tailbfad61.ts.net");
  });

  it("localhost ตอนพัฒนา → รับ", async () => {
    expect(await returnToFor("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("callback ที่ไม่มี code → 400 และไม่ออก session cookie", async () => {
    const res = await request(app).get("/api/auth/strava/callback");
    expect(res.status).toBe(400);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});
