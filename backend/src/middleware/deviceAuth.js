import crypto from "node:crypto";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "./error.js";

// SHA-256 hex (64 chars) — token เป็น random 32 bytes (high entropy) จึงไม่ต้องใช้ bcrypt
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateToken() {
  return crypto.randomBytes(32).toString("hex"); // 64 hex chars
}

// ตรวจ "Authorization: Bearer <token>" กับ device.authTokenHash ของ deviceId
// ใน req.params.deviceId หรือ req.body.deviceId — แล้วแนบ device ที่ verify แล้วเข้ากับ req.device
export async function requireDeviceAuth(req, _res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      throw new HttpError(401, "Missing bearer token");
    }
    const token = auth.slice(7).trim();
    if (!token) throw new HttpError(401, "Empty bearer token");

    const deviceId = req.params.deviceId ?? req.body?.deviceId;
    if (!deviceId) throw new HttpError(400, "deviceId required");

    const device = await prisma.device.findUnique({ where: { deviceId } });
    if (!device) throw new HttpError(404, "Device not registered");
    if (!device.authTokenHash) {
      throw new HttpError(401, "Device has no token — re-register on /add-device");
    }

    const incoming = Buffer.from(hashToken(token), "hex");
    const stored = Buffer.from(device.authTokenHash, "hex");
    if (incoming.length !== stored.length || !crypto.timingSafeEqual(incoming, stored)) {
      throw new HttpError(401, "Invalid token");
    }

    // Heartbeat: ทุก authenticated request นับเป็นสัญญาณว่าอุปกรณ์ยัง alive
    // dashboard คำนวณ isOnline จาก lastSeenAt + threshold ตอนอ่าน
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    req.device = device;
    next();
  } catch (err) {
    next(err);
  }
}
