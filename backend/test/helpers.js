import { prisma } from "../src/lib/prisma.js";
import { createSessionValue, SESSION_COOKIE } from "../src/lib/session.js";
import { generateToken, hashToken } from "../src/middleware/deviceAuth.js";

export { prisma };

// ล้างทุกตาราง — ลูกก่อนแม่ (foreign key) · ใช้ได้เพราะ setup.js บังคับให้เป็นฐาน _test แล้ว
export async function resetDb() {
  await prisma.soilLog.deleteMany();
  await prisma.actionLog.deleteMany();
  await prisma.autoSchedule.deleteMany();
  await prisma.runHistory.deleteMany();
  await prisma.device.deleteMany();
  await prisma.user.deleteMany();
}

let seq = 0;

// ผู้ใช้ทดสอบ (เหมือนคนที่ login Strava แล้ว)
export function createUser({ points = 100, name } = {}) {
  seq += 1;
  return prisma.user.create({
    data: { stravaId: `test-${process.pid}-${seq}`, displayName: name ?? `Tester ${seq}`, totalPoints: points },
  });
}

// กระถางของผู้ใช้ — คืน token ตัวจริง (plaintext) ไว้ใช้ทดสอบฝั่งอุปกรณ์ (Bearer / MQTT)
export async function createDevice(userId, deviceId) {
  seq += 1;
  const token = generateToken();
  const device = await prisma.device.create({
    data: { userId, deviceId: deviceId ?? `POT-T${seq}`, displayName: "test pot", authTokenHash: hashToken(token) },
  });
  return { device, token };
}

// header Cookie ของผู้ใช้ที่ login แล้ว — เหมือน cookie ที่ backend ออกหลัง Strava login
export const cookieFor = (userId) => `${SESSION_COOKIE}=${createSessionValue(userId)}`;
