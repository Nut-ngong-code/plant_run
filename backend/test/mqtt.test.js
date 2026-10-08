// กลุ่ม 5 — MQTT broker (ช่องทางหลักที่ ESP32 คุยกับ backend)
// เปิด broker ตัวจริงจาก src/lib/mqtt.js บนพอร์ตทดสอบ แล้วใช้ library `mqtt` ทำตัวเป็น ESP32 จำลอง
// ยืนยันว่า (1) รหัสผิด/ไม่รู้จักต่อไม่ได้ (2) บอร์ดหนึ่งแตะ topic ของอีกบอร์ดไม่ได้
// (3) ค่า IP ที่ไม่ใช่วงในบ้านไม่ถูกเก็บ (4) กดรดน้ำบนเว็บ → บอร์ดได้คำสั่งทันที → ack แล้วสถานะอัปเดต
import mqtt from "mqtt";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { startMqtt, getLocalIp } from "../src/lib/mqtt.js";
import { prisma, resetDb, createUser, createDevice, cookieFor } from "./helpers.js";

const PORT = 18831; // พอร์ตแยกจาก broker ตัวจริง (1883) — รันบน VM เครื่องเดียวกันได้ไม่ชนกัน
const BROKER_URL = `mqtt://127.0.0.1:${PORT}`;

let server;
let alice, alicePot, bobPot;
const clients = []; // บอร์ดจำลองทุกตัวที่เปิดในเทส — ปิดให้หมดหลังแต่ละเทส

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// รอจนเงื่อนไขเป็นจริง (ข้อความ MQTT ถูกประมวลผลแบบ async จึงต้องรอสักครู่) — คืน false ถ้าหมดเวลา
async function waitFor(check, timeoutMs = 5000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(50);
  }
  return false;
}

// ต่อเป็นบอร์ดจำลอง — username = Device ID, password = token (แบบเดียวกับ firmware)
async function connectBoard(deviceId, token) {
  const client = await mqtt.connectAsync(BROKER_URL, {
    username: deviceId,
    password: token,
    reconnectPeriod: 0, // ต่อไม่ติดก็จบ ไม่ต้องลองใหม่
    connectTimeout: 5000,
  });
  clients.push(client);
  return client;
}

beforeAll(async () => {
  server = startMqtt(PORT);
  if (!server.listening) await new Promise((r) => server.once("listening", r));
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  alice = await createUser({ name: "Alice", points: 100 });
  const bob = await createUser({ name: "Bob" });
  alicePot = await createDevice(alice.id, "POT-A");
  bobPot = await createDevice(bob.id, "POT-B");
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.endAsync(true).catch(() => {})));
});

const potOnDashboard = async () => {
  const res = await request(app).get(`/api/user/${alice.id}/dashboard`).set("Cookie", cookieFor(alice.id));
  return res.body.devices.find((d) => d.deviceId === "POT-A");
};

describe("ยืนยันตัวตนบอร์ด", () => {
  it("token ผิด → ต่อไม่ได้", async () => {
    await expect(
      mqtt.connectAsync(BROKER_URL, { username: "POT-A", password: "0".repeat(64), reconnectPeriod: 0 }),
    ).rejects.toThrow();
  });

  it("Device ID ที่ไม่มีในระบบ → ต่อไม่ได้", async () => {
    await expect(
      mqtt.connectAsync(BROKER_URL, { username: "POT-UNKNOWN", password: alicePot.token, reconnectPeriod: 0 }),
    ).rejects.toThrow();
  });

  it("token ถูก → ต่อได้ · dashboard ขึ้น online · ตัดการเชื่อมต่อ → offline ทันที", async () => {
    const board = await connectBoard("POT-A", alicePot.token);
    expect(board.connected).toBe(true);
    expect(await waitFor(async () => (await potOnDashboard()).isOnline === true)).toBe(true);

    await board.endAsync();
    expect(await waitFor(async () => (await potOnDashboard()).isOnline === false)).toBe(true);
  });
});

describe("แต่ละบอร์ดแตะได้เฉพาะ topic ของตัวเอง (ACL)", () => {
  it("POT-A ส่งค่าความชื้นในนาม POT-B → ถูกตัดการเชื่อมต่อ และไม่มีค่าบันทึกให้ POT-B", async () => {
    const board = await connectBoard("POT-A", alicePot.token);
    const closed = new Promise((r) => board.once("close", () => r("closed")));

    board.publish("plant/POT-B/sensor", JSON.stringify({ moisturePercent: 5 }));

    expect(await Promise.race([closed, sleep(3000).then(() => "still connected")])).toBe("closed");
    expect(await prisma.soilLog.count({ where: { deviceId: bobPot.device.id } })).toBe(0);
  });

  it("POT-A ขอรับคำสั่งของ POT-B → ถูกปฏิเสธ (SUBACK 128) แต่ไม่ถูกตัด", async () => {
    const board = await connectBoard("POT-A", alicePot.token);
    const result = await new Promise((resolve) =>
      board.subscribe("plant/POT-B/cmd", { qos: 1 }, (err, granted) => resolve({ err, granted })),
    );

    const rejected = Boolean(result.err) || result.granted?.[0]?.qos === 128;
    expect(rejected).toBe(true);
    expect(board.connected).toBe(true);
  });
});

describe("ข้อมูลที่บอร์ดส่งมา", () => {
  it("IP สาธารณะ (8.8.8.8) ไม่ถูกเก็บ แต่ค่าความชื้นยังบันทึก · IP วงในบ้านถูกเก็บ", async () => {
    const board = await connectBoard("POT-A", alicePot.token);

    await board.publishAsync("plant/POT-A/sensor", JSON.stringify({ moisturePercent: 40, ip: "8.8.8.8" }), { qos: 1 });
    expect(await waitFor(async () => (await prisma.soilLog.count()) === 1)).toBe(true);
    expect(getLocalIp(alicePot.device.id)).toBeNull();

    await board.publishAsync("plant/POT-A/sensor", JSON.stringify({ moisturePercent: 41, ip: "192.168.1.50" }), { qos: 1 });
    expect(await waitFor(async () => (await prisma.soilLog.count()) === 2)).toBe(true);
    expect(getLocalIp(alicePot.device.id)).toBe("192.168.1.50");
  });
});

describe("ทั้งลูป: กดรดน้ำบนเว็บ → บอร์ดได้คำสั่งทันที → ack", () => {
  it("คำสั่งถูก push ไปที่บอร์ด แล้ว ack success → สถานะ success", async () => {
    const board = await connectBoard("POT-A", alicePot.token);
    const gotCommand = new Promise((resolve) =>
      board.on("message", (topic, payload) => resolve({ topic, body: JSON.parse(payload.toString()) })),
    );
    await board.subscribeAsync("plant/POT-A/cmd", { qos: 1 }); // พร้อมรับคำสั่ง (เหมือน firmware ตอนต่อเสร็จ)
    await sleep(100);

    // ผู้ใช้กดปุ่ม WATER บนเว็บ
    const res = await request(app)
      .post("/api/action")
      .set("Cookie", cookieFor(alice.id))
      .send({ deviceId: "POT-A", actionType: "water" });
    expect(res.status).toBe(201);
    const commandId = res.body.action.id;

    // บอร์ดต้องได้คำสั่งเองโดยไม่ต้องถาม (push)
    const msg = await Promise.race([gotCommand, sleep(5000).then(() => null)]);
    expect(msg).not.toBeNull();
    expect(msg.topic).toBe("plant/POT-A/cmd");
    expect(msg.body).toMatchObject({ id: commandId, type: "water" });

    const statusOf = async () => (await prisma.actionLog.findUnique({ where: { id: commandId } })).status;
    expect(await waitFor(async () => (await statusOf()) === "executing")).toBe(true);

    // บอร์ดรดน้ำเสร็จ แล้วรายงานผล
    await board.publishAsync("plant/POT-A/ack", JSON.stringify({ id: commandId, status: "success" }), { qos: 1 });
    expect(await waitFor(async () => (await statusOf()) === "success")).toBe(true);
  });
});
