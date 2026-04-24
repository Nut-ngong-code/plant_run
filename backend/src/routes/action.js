import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { actionCost } from "../lib/config.js";
import { HttpError } from "../middleware/error.js";

export const actionRouter = Router();

const postBody = z.object({
  userId: z.number().int().positive(),
  deviceId: z.string().min(1), // MAC-style string (UK ใน DEVICE.device_id)
  actionType: z.enum(["water", "fertilizer"]),
  durationSeconds: z.number().int().positive().max(120).optional(),
});

// POST /api/action
// รับคำสั่งจากเว็บ → ตรวจแต้ม → หักแต้ม → สร้าง ACTION_LOG (pending)
// ใช้ prisma.$transaction เพื่อกัน race condition กรณีผู้ใช้กดรัว (interactive tx + SELECT FOR UPDATE)
actionRouter.post("/", async (req, res) => {
  const { userId, deviceId, actionType, durationSeconds } = postBody.parse(req.body);
  const cost = actionCost[actionType];

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) throw new HttpError(404, "Device not registered", { deviceId });
  if (device.userId !== userId) {
    throw new HttpError(403, "Device not owned by user");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Atomic conditional update: หัก totalPoints เฉพาะเมื่อแต้มพอ
    const updated = await tx.user.updateMany({
      where: { id: userId, totalPoints: { gte: cost } },
      data: { totalPoints: { decrement: cost } },
    });
    if (updated.count === 0) {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { totalPoints: true } });
      return {
        ok: false,
        reason: u ? "insufficient_points" : "user_not_found",
        currentPoints: u?.totalPoints ?? 0,
        required: cost,
      };
    }

    const action = await tx.actionLog.create({
      data: {
        userId,
        deviceId: device.id,
        actionType,
        status: "pending",
        pointsDeducted: cost,
        durationSeconds: durationSeconds ?? 5,
      },
    });
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { totalPoints: true },
    });
    return { ok: true, action, remainingPoints: user?.totalPoints ?? 0 };
  });

  if (!result.ok) {
    return res.status(400).json({ error: result.reason, ...result });
  }

  res.status(201).json({
    action: result.action,
    remainingPoints: result.remainingPoints,
  });
});
