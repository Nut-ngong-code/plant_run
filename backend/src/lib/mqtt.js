import net from "node:net";

import Aedes from "aedes";
import { z } from "zod";

import { prisma } from "./prisma.js";
import { applyAck } from "./commands.js";
import { tokenMatches } from "../middleware/deviceAuth.js";

// MQTT broker (Aedes) ฝังอยู่ใน backend — ESP32 ต่อเข้ามาค้างไว้ แล้ว backend "ส่ง" คำสั่งลงไปได้ทันที
// แทนการให้ ESP32 มาถาม /command ทุก 5 วิ
//
// Topic (1 กระถาง = deviceId เช่น POT-001):
//   plant/<deviceId>/cmd     backend → ESP32   {id, type, durationSeconds}   QoS 1
//   plant/<deviceId>/ack     ESP32 → backend   {id, status: success|failed}
//   plant/<deviceId>/sensor  ESP32 → backend   {moisturePercent}
//   plant/<deviceId>/status  "online" จาก ESP32 / "offline" จาก Last Will ที่ broker ส่งแทนตอนหลุด (retained)
//
// ยืนยันตัวตน: username = deviceId, password = device token — ตรวจกับ hash ใน DB ตัวเดียวกับ HTTP Bearer
// ฐานข้อมูล (ACTION_LOG) ยังเป็นคิวคำสั่งตัวจริง — broker แค่ส่งต่อ ไม่ได้เก็บคำสั่งไว้เอง

// MySQL เทียบ device_id แบบไม่สนตัวพิมพ์ (login ด้วย "pot-001" ผ่านได้ ถ้าใน DB เป็น "POT-001")
// topic ก็ต้องเทียบแบบเดียวกัน ไม่งั้นบอร์ดโดนตัดทันทีที่ publish ครั้งแรก
const sameId = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const isOwnCmd = (client, topic) => {
  const [root, deviceId, leaf, ...rest] = topic.split("/");
  return root === "plant" && sameId(deviceId, client.plant?.deviceId) && leaf === "cmd" && rest.length === 0;
};
const DEVICE_PUBLISH_LEAVES = new Set(["ack", "sensor", "status"]);
const ONLINE_THRESHOLD_MS = 60_000;

const broker = Aedes();
const connected = new Map(); // DEVICE.id → client ที่ต่ออยู่
const disconnectedAt = new Map(); // DEVICE.id → เวลาที่หลุดล่าสุด (ตัดเป็น offline ทันทีไม่ต้องรอ 60 วิ)
const dispatchChains = new Map(); // DEVICE.id → promise chain (ส่งคำสั่งของกระถางเดียวกันทีละตัว)

const logErr = (where) => (err) => console.error(`[mqtt] ${where}:`, err?.message ?? err);

function authError(returnCode, message) {
  const err = new Error(message);
  err.returnCode = returnCode; // 3 = server unavailable, 4 = bad username/password
  return err;
}

broker.authenticate = async (client, username, password, done) => {
  try {
    const deviceId = username?.toString();
    const token = password?.toString();
    if (!deviceId || !token) return done(authError(4, "Missing credentials"), false);

    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device || !tokenMatches(device, token)) {
      console.warn(`[mqtt] ${deviceId} ต่อไม่ผ่าน: ${device ? "token ไม่ตรง (rotate แล้วยังไม่ได้ใส่ token ใหม่?)" : "ไม่พบ Device ID นี้"}`);
      return done(authError(4, "Bad device credentials"), false);
    }
    client.plant = { id: device.id, deviceId: device.deviceId };
    done(null, true);
  } catch (err) {
    logErr("auth")(err);
    done(authError(3, "Server unavailable"), false); // DB ล่ม ≠ token ผิด
  }
};

// ESP32 publish ได้เฉพาะ topic ของตัวเอง — กันกระถางหนึ่งปลอมค่าเซ็นเซอร์/ack ของอีกกระถาง
broker.authorizePublish = (client, packet, cb) => {
  if (!client) return cb(null); // Last Will ของ client ที่ยืนยันตัวตนไปแล้ว
  const [root, deviceId, leaf, ...rest] = packet.topic.split("/");
  const own = root === "plant" && sameId(deviceId, client.plant?.deviceId) && rest.length === 0;
  if (own && DEVICE_PUBLISH_LEAVES.has(leaf)) return cb(null);
  console.warn(`[mqtt] ${client.plant?.deviceId} ถูกปฏิเสธ publish ${packet.topic} → ตัดการเชื่อมต่อ`);
  cb(new Error(`not allowed to publish ${packet.topic}`));
};

// subscribe ได้เฉพาะคิวคำสั่งของตัวเอง — topic อื่นตอบ SUBACK failure แต่ไม่ตัดการเชื่อมต่อ
broker.authorizeSubscribe = (client, sub, cb) => {
  if (client.plant && isOwnCmd(client, sub.topic)) return cb(null, sub);
  console.warn(`[mqtt] ${client.plant?.deviceId} ถูกปฏิเสธ subscribe ${sub.topic}`);
  cb(null, null);
};

broker.on("clientReady", (client) => {
  const dev = client.plant;
  if (!dev) return;
  const previous = connected.get(dev.id);
  if (previous && previous !== client) previous.close(); // บอร์ดรีบูตแล้วต่อใหม่ก่อน keepalive ของตัวเก่าหมด
  connected.set(dev.id, client);
  disconnectedAt.delete(dev.id);
  console.log(`[mqtt] ${dev.deviceId} connected`);
  touch(dev.id);
});

// ส่งคำสั่งได้ก็ต่อเมื่อ ESP32 subscribe คิวของตัวเองแล้วเท่านั้น — ถ้าส่งตอน connect เฉย ๆ
// ข้อความจะไม่มีใครรับ (clean session) แล้วคำสั่งค้าง executing จน cleanup คืนแต้ม
broker.on("subscribe", (subs, client) => {
  const dev = client.plant;
  const cmd = subs.find((s) => isOwnCmd(client, s.topic) && s.qos !== 128);
  if (!dev || !cmd) return;
  client.plantReady = true;
  client.plantCmdTopic = cmd.topic; // ใช้ตัวสะกดเดียวกับที่บอร์ด subscribe ไว้ ไม่งั้นข้อความไม่ถึง
  dispatchNext(dev.id); // ส่งคำสั่งที่ค้างระหว่างออฟไลน์
});

broker.on("clientDisconnect", (client) => {
  const dev = client.plant;
  if (!dev || connected.get(dev.id) !== client) return;
  connected.delete(dev.id);
  disconnectedAt.set(dev.id, Date.now());
  console.log(`[mqtt] ${dev.deviceId} disconnected (${client.plantLostReason ?? "connection ปิดจากฝั่งบอร์ดหรือเครือข่าย"})`);
});

// เหตุผลที่หลุด — log ไว้ใน clientDisconnect บรรทัดเดียวกัน
broker.on("keepaliveTimeout", (client) => {
  client.plantLostReason = `keepalive timeout — ไม่ได้ยิน ping เกิน ${1.5 * (client.keepalive || 0)} วิ`;
});
broker.on("clientError", (client, err) => {
  client.plantLostReason = err?.message ?? "client error";
});

// keepalive ping = heartbeat → อัปเดต lastSeenAt เหมือนที่ requireDeviceAuth ทำกับ HTTP
broker.on("ping", (_packet, client) => {
  if (client?.plant) touch(client.plant.id);
});

broker.on("publish", (packet, client) => {
  if (!client?.plant) return; // ข้อความที่ backend ส่งเอง
  // Last Will ("offline") ถูก publish แทน client ที่ปิดไปแล้ว — ห้ามนับเป็น heartbeat
  // ไม่งั้น lastSeenAt ใหม่กว่าเวลาหลุด แล้ว dashboard เด้งกลับเป็น online อีก 60 วิ
  if (client.closed) return;
  touch(client.plant.id);
  handleDevicePublish(client.plant, packet).catch(logErr(packet.topic));
});

const sensorMsg = z.object({ moisturePercent: z.number().int().min(0).max(100) });
const ackMsg = z.object({
  id: z.number().int().positive(),
  status: z.enum(["success", "failed"]),
});

async function handleDevicePublish(dev, packet) {
  const leaf = packet.topic.split("/")[2];
  if (leaf === "status") return; // สถานะ online/offline ใช้ event ของ broker แทน

  let body;
  try {
    body = JSON.parse(packet.payload.toString());
  } catch {
    return console.warn(`[mqtt] ${packet.topic}: payload ไม่ใช่ JSON`);
  }

  if (leaf === "sensor") {
    const parsed = sensorMsg.safeParse(body);
    if (!parsed.success) return console.warn(`[mqtt] ${packet.topic}: payload ไม่ถูกต้อง`);
    await prisma.soilLog.create({
      data: { deviceId: dev.id, moisturePercent: parsed.data.moisturePercent },
    });
  } else if (leaf === "ack") {
    const parsed = ackMsg.safeParse(body);
    if (!parsed.success) return console.warn(`[mqtt] ${packet.topic}: payload ไม่ถูกต้อง`);
    const { id, status } = parsed.data;
    const result = await applyAck(dev.id, id, status);
    console.log(`[mqtt] ${dev.deviceId} ack #${id} ${status}${result?.applied ? "" : " (ignored)"}`);
    await dispatchNext(dev.id); // ว่างแล้ว — ส่งคำสั่งถัดไปในคิว (ถ้ามี)
  }
}

function touch(deviceDbId) {
  prisma.device
    .updateMany({ where: { id: deviceDbId }, data: { lastSeenAt: new Date() } })
    .catch(logErr("touch"));
}

function publish(topic, payload, qos) {
  return new Promise((resolve, reject) => {
    broker.publish(
      { cmd: "publish", topic, payload: Buffer.from(JSON.stringify(payload)), qos, retain: false },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

// ส่งคำสั่ง pending ที่เก่าที่สุดให้ ESP32 — ทีละคำสั่งต่อกระถาง (ปั๊มทำได้ทีละอย่าง)
// เรียกเมื่อ: สร้างคำสั่งใหม่ (action.js) · ESP32 subscribe cmd (ต่อเข้ามาใหม่) · ESP32 ack เสร็จ · cleanup เคลียร์ของค้าง
// ถ้า ESP32 ออฟไลน์ คำสั่งรอเป็น pending ใน DB จนกว่าจะต่อกลับมา
export function dispatchNext(deviceDbId) {
  const run = (dispatchChains.get(deviceDbId) ?? Promise.resolve())
    .then(() => dispatchOnce(deviceDbId))
    .catch(logErr("dispatch"));
  dispatchChains.set(deviceDbId, run);
  return run;
}

async function dispatchOnce(deviceDbId) {
  const client = connected.get(deviceDbId);
  if (!client?.plantReady) return; // ยังไม่ต่อ หรือต่อแล้วแต่ยังไม่ subscribe cmd

  const busy = await prisma.actionLog.count({
    where: { deviceId: deviceDbId, status: "executing" },
  });
  if (busy > 0) return;

  const next = await prisma.actionLog.findFirst({
    where: { deviceId: deviceDbId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  if (!next) return;

  // เปลี่ยนเป็น executing ก่อนส่ง — executedAt เป็นจุดเริ่มนับของ cleanup job (ESP32 ไม่ ack ใน 180 วิ = failed + คืนแต้ม)
  const claimed = await prisma.actionLog.updateMany({
    where: { id: next.id, status: "pending" },
    data: { status: "executing", executedAt: new Date() },
  });
  if (claimed.count === 0) return;

  await publish(
    client.plantCmdTopic,
    { id: next.id, type: next.actionType, durationSeconds: next.durationSeconds },
    1,
  );
  console.log(`[mqtt] → ${client.plant.deviceId} cmd #${next.id} ${next.actionType}`);
}

// online = ต่อ MQTT อยู่ตอนนี้ · หรือ (firmware แบบ HTTP polling) มี heartbeat ใน 60 วิล่าสุด
export function isDeviceOnline(device, now = Date.now()) {
  if (connected.has(device.id)) return true;
  const lastSeen = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
  if ((disconnectedAt.get(device.id) ?? 0) >= lastSeen) return false; // หลุดจาก MQTT หลังสัญญาณล่าสุด
  return now - lastSeen < ONLINE_THRESHOLD_MS;
}

// ตัดการเชื่อมต่อทันทีเมื่อ rotate token / ลบกระถาง — ไม่งั้น connection เดิมยังใช้ token เก่าได้ต่อ
export function kickDevice(deviceDbId) {
  connected.get(deviceDbId)?.close();
}

export function startMqtt(port) {
  const server = net.createServer(broker.handle);
  server.listen(port, () => console.log(`📡 MQTT broker ready at mqtt://localhost:${port}`));
  server.on("error", logErr("server"));
  return server;
}
