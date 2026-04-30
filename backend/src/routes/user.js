import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";

export const userRouter = Router();

// GET /api/user/:id/dashboard
// ข้อมูลสำหรับหน้า Dashboard:
//  - แต้มสะสม
//  - รายการอุปกรณ์ (กระถาง) พร้อมค่าความชื้นล่าสุดของแต่ละอัน
//  - ระยะวิ่งในสัปดาห์ปัจจุบัน
//  - ประวัติการกดรดน้ำล่าสุด
userRouter.get("/:id/dashboard", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) throw new HttpError(400, "Invalid user id");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, totalPoints: true },
  });
  if (!user) throw new HttpError(404, "User not found");

  const devices = await prisma.device.findMany({
    where: { userId },
    include: {
      soilLogs: { orderBy: { recordedAt: "desc" }, take: 1 },
    },
    orderBy: { id: "asc" },
  });

  // คำนวณ isOnline จาก lastSeenAt — ถ้า heartbeat (sensor/poll/ack) เกิน threshold
  // ถือว่า device หลุด ไม่พึ่งคอลัมน์ isOnline ใน DB ที่ค้างเป็น true ตลอด
  const ONLINE_THRESHOLD_MS = 60_000;
  const nowMs = Date.now();
  const isDeviceOnline = (lastSeenAt) =>
    lastSeenAt ? nowMs - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS : false;

  // สัปดาห์ปัจจุบัน เริ่มวันจันทร์ 00:00 local
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);

  const weeklyAgg = await prisma.runHistory.aggregate({
    where: { userId, runAt: { gte: weekStart } },
    _sum: { distanceKm: true, pointsEarned: true },
    _count: { _all: true },
  });

  const recentActions = await prisma.actionLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      deviceId: true,
      actionType: true,
      status: true,
      pointsDeducted: true,
      createdAt: true,
    },
  });

  res.json({
    user,
    devices: devices.map((d) => ({
      id: d.id,
      deviceId: d.deviceId,
      displayName: d.displayName,
      isOnline: isDeviceOnline(d.lastSeenAt),
      lastSeenAt: d.lastSeenAt,
      latestMoisture: d.soilLogs[0] ?? null,
    })),
    weekly: {
      weekStart,
      distanceKm: weeklyAgg._sum.distanceKm ?? 0,
      pointsEarned: weeklyAgg._sum.pointsEarned ?? 0,
      runCount: weeklyAgg._count._all ?? 0,
    },
    recentActions,
  });
});

// GET /api/user/:id/history?type=run|action&limit=50
userRouter.get("/:id/history", async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) throw new HttpError(400, "Invalid user id");
  const type = req.query.type ?? "run";
  const limit = Math.min(Number(req.query.limit ?? 50), 200);

  if (type === "action") {
    const rows = await prisma.actionLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return res.json(rows);
  }

  const rows = await prisma.runHistory.findMany({
    where: { userId },
    orderBy: { runAt: "desc" },
    take: limit,
  });
  res.json(rows);
});
