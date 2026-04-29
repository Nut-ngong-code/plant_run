import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { requireDeviceAuth, generateToken, hashToken } from "../middleware/deviceAuth.js";

export const deviceRouter = Router();

// GET /api/device/:deviceId/command
// ESP32 polls นี้เป็นระยะ เพื่อเช็คว่ามีคำสั่ง pending รออยู่ไหม
// ถ้ามี -> เปลี่ยน status เป็น "executing" และส่งคำสั่งกลับไป
deviceRouter.get("/:deviceId/command", requireDeviceAuth, async (req, res) => {
  const device = req.device; // verified by requireDeviceAuth

  const pending = await prisma.actionLog.findFirst({
    where: { deviceId: device.id, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  if (!pending) {
    return res.json({ command: null });
  }

  const updated = await prisma.actionLog.update({
    where: { id: pending.id },
    data: { status: "executing", executedAt: new Date() },
  });

  res.json({
    command: {
      id: updated.id,
      type: updated.actionType,
      durationSeconds: updated.durationSeconds,
    },
  });
});

// POST /api/device/:deviceId/command/:commandId/ack
// ESP32 รายงานผลหลังรันคำสั่งเสร็จ
const ackBody = z.object({
  status: z.enum(["success", "failed"]),
});

deviceRouter.post("/:deviceId/command/:commandId/ack", requireDeviceAuth, async (req, res) => {
  const commandId = Number(req.params.commandId);
  if (!Number.isInteger(commandId)) throw new HttpError(400, "Invalid command id");
  const { status } = ackBody.parse(req.body);

  const action = await prisma.actionLog.findUnique({ where: { id: commandId } });
  if (!action) throw new HttpError(404, "Command not found");

  const updated = await prisma.actionLog.update({
    where: { id: commandId },
    data: { status, executedAt: new Date() },
  });

  // ถ้า failed — คืนแต้มให้ผู้ใช้
  if (status === "failed" && action.pointsDeducted) {
    await prisma.user.update({
      where: { id: action.userId },
      data: { totalPoints: { increment: action.pointsDeducted } },
    });
  }

  res.json({ id: updated.id, status: updated.status });
});

// GET /api/device/:deviceId/soil-history?limit=200
// ประวัติความชื้น สำหรับกราฟในหน้า stats
deviceRouter.get("/:deviceId/soil-history", async (req, res) => {
  const { deviceId } = req.params;
  const limit = Math.min(Number(req.query.limit ?? 200), 1000);

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, "Device not registered", { deviceId });

  const logs = await prisma.soilLog.findMany({
    where: { deviceId: device.id },
    orderBy: { recordedAt: "desc" },
    take: limit,
    select: { id: true, moisturePercent: true, recordedAt: true },
  });

  res.json(logs.reverse()); // ส่งกลับเรียงตามเวลาน้อย → มาก (พร้อม plot)
});

// POST /api/device (สำหรับผูกอุปกรณ์กับผู้ใช้)
const registerBody = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1),
  displayName: z.string().optional(),
});

// POST /api/device/:deviceId/rotate-token
// ออก token ใหม่ (one-time) สำหรับอุปกรณ์ที่มีอยู่ — invalidate ของเก่าทันที
// Auth: prototype ตรวจแค่ userId ใน body ตรงกับ device.userId
//       (เวอร์ชันมี user-session จริง ค่อยย้ายไป middleware)
const rotateBody = z.object({
  userId: z.number().int().positive(),
});

deviceRouter.post("/:deviceId/rotate-token", async (req, res) => {
  const { deviceId } = req.params;
  const { userId } = rotateBody.parse(req.body);

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, "Device not registered", { deviceId });
  if (device.userId !== userId) {
    throw new HttpError(403, "Device not owned by this user");
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { authTokenHash: tokenHash },
  });

  res.json({
    device: {
      id: updated.id,
      deviceId: updated.deviceId,
      displayName: updated.displayName,
    },
    deviceToken: token, // ⚠️ แสดงรอบเดียว
  });
});

// POST /api/device — ลงทะเบียน/ผูกอุปกรณ์ + ออก device token ใหม่ (one-time)
// คืน plaintext token ใน response รอบนี้รอบเดียว — DB เก็บแค่ SHA-256 hash
deviceRouter.post("/", async (req, res) => {
  const data = registerBody.parse(req.body);

  const token = generateToken();
  const tokenHash = hashToken(token);

  const device = await prisma.device.upsert({
    where: { deviceId: data.deviceId },
    create: {
      userId: data.userId,
      deviceId: data.deviceId,
      displayName: data.displayName,
      authTokenHash: tokenHash,
    },
    update: {
      userId: data.userId,
      displayName: data.displayName ?? undefined,
      authTokenHash: tokenHash, // rotate ทุกครั้งที่ register ซ้ำ
    },
  });

  res.status(201).json({
    device: {
      id: device.id,
      deviceId: device.deviceId,
      displayName: device.displayName,
    },
    deviceToken: token, // ⚠️ แสดงรอบเดียว — backend ไม่เก็บ plaintext
  });
});
