import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";

export const sensorRouter = Router();

const postBody = z.object({
  deviceId: z.string().min(1),
  moisturePercent: z.number().int().min(0).max(100),
});

// POST /api/sensor
// ESP32 ยิงค่าความชื้นในดินมาเก็บใน SOIL_LOG + อัปเดตสถานะออนไลน์ของ Device
sensorRouter.post("/", async (req, res) => {
  const { deviceId, moisturePercent } = postBody.parse(req.body);

  const device = await prisma.device.findUnique({ where: { deviceId } });
  if (!device) {
    throw new HttpError(404, "Device not registered", { deviceId });
  }

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
    deviceId,
    moisturePercent: log.moisturePercent,
    recordedAt: log.recordedAt,
  });
});
