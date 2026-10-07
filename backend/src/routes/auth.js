import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { HttpError } from "../middleware/error.js";
import { requireUser } from "../middleware/userAuth.js";
import { setSession, clearSession } from "../lib/session.js";

// session ของผู้ใช้เว็บ — login จริงผ่าน Strava (routes/strava.js /callback เป็นคนออก cookie)
export const authRouter = Router();

// GET /api/auth/me — ตอนนี้ login เป็นใคร (หน้าเว็บใช้หลัง Strava redirect กลับมา)
authRouter.get("/me", requireUser, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, displayName: true },
  });
  if (!user) {
    clearSession(res); // ผู้ใช้ถูกลบไปแล้ว — cookie เก่าใช้ต่อไม่ได้
    throw new HttpError(401, "Not logged in");
  }
  res.json(user);
});

// POST /api/auth/logout
authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

// GET /api/auth/options — หน้า Login ใช้ตัดสินว่าจะโชว์ปุ่ม DEV หรือไม่
authRouter.get("/options", (_req, res) => {
  res.json({ devLogin: config.allowDevLogin });
});

// POST /api/auth/dev-login {userId} — ข้าม Strava สำหรับทดสอบในเครื่อง dev เท่านั้น
// ปิดอยู่ (404) ถ้าไม่ได้ตั้ง ALLOW_DEV_LOGIN=true — บน server ห้ามเปิด เพราะเข้าเป็นใครก็ได้
const devLoginBody = z.object({ userId: z.number().int().positive() });

authRouter.post("/dev-login", async (req, res) => {
  if (!config.allowDevLogin) throw new HttpError(404, "Not found");
  const { userId } = devLoginBody.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });
  if (!user) throw new HttpError(404, "User not found");
  setSession(res, user.id);
  res.json(user);
});
