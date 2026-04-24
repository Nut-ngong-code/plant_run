import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";

export const deviceRouter = Router();

// GET /api/device/:deviceId/command
// ESP32 polls นี้เป็นระยะ เพื่อเช็คว่ามีคำสั่ง pending รออยู่ไหม
// ถ้ามี -> เปลี่ยน status เป็น "executing" และส่งคำสั่งกลับไป
deviceRouter.get("/:deviceId/command", async (req, res) => {
  const { deviceId } = req.params;

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, "Device not registered", { deviceId });

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

deviceRouter.post("/:deviceId/command/:commandId/ack", async (req, res) => {
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

// POST /api/device (สำหรับผูกอุปกรณ์กับผู้ใช้)
const registerBody = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1),
  displayName: z.string().optional(),
});

deviceRouter.post("/", async (req, res) => {
  const data = registerBody.parse(req.body);
  const device = await prisma.device.upsert({
    where: { deviceId: data.deviceId },
    create: {
      userId: data.userId,
      deviceId: data.deviceId,
      displayName: data.displayName,
    },
    update: {
      userId: data.userId,
      displayName: data.displayName ?? undefined,
    },
  });
  res.status(201).json(device);
});
