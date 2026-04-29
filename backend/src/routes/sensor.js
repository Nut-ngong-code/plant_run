import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { requireDeviceAuth } from "../middleware/deviceAuth.js";

export const sensorRouter = Router();

const postBody = z.object({
  deviceId: z.string().min(1),
  moisturePercent: z.number().int().min(0).max(100),
});

// POST /api/sensor
// ESP32 ยิงค่าความชื้นในดินมาเก็บใน SOIL_LOG + อัปเดตสถานะออนไลน์ของ Device
// ต้องแนบ Bearer token ที่ตรงกับ device.authTokenHash (กัน spoofing)
sensorRouter.post("/", requireDeviceAuth, async (req, res) => {
  const { moisturePercent } = postBody.parse(req.body);
  const device = req.device; // verified by requireDeviceAuth

  const [log] = await prisma.$transaction([
    prisma.soilLog.create({
      data: {
        deviceId: device.id,
        moisturePercent,
      },
    }),
    prisma.device.update({
      where: { id: device.id },
      data: { isOnline: true, lastSeenAt: new Date() },
    }),
  ]);

  res.status(201).json({
    id: log.id,
    deviceId: device.deviceId,
    moisturePercent: log.moisturePercent,
    recordedAt: log.recordedAt,
  });
});
