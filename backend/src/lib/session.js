import crypto from "node:crypto";

import { config } from "./config.js";

// Session ของผู้ใช้เว็บ — cookie เดียว เซ็นด้วย HMAC ไม่ต้องเก็บอะไรใน DB
// ค่า cookie = "<userId>.<หมดอายุ (วินาที)>.<HMAC-SHA256>"
// แก้ userId ในเบราว์เซอร์เองไม่ได้ เพราะลายเซ็นจะไม่ตรง (ต้องรู้ SESSION_SECRET)
export const SESSION_COOKIE = "plant_sid";
const MAX_AGE_S = 30 * 24 * 60 * 60; // 30 วัน

const sign = (data) =>
  crypto.createHmac("sha256", config.sessionSecret).update(data).digest("base64url");

export function createSessionValue(userId, nowMs = Date.now()) {
  const data = `${userId}.${Math.floor(nowMs / 1000) + MAX_AGE_S}`;
  return `${data}.${sign(data)}`;
}

// คืน userId ถ้าลายเซ็นถูกและยังไม่หมดอายุ — ไม่งั้นคืน null
export function verifySessionValue(value, nowMs = Date.now()) {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const expected = Buffer.from(sign(`${uid}.${exp}`));
  const got = Buffer.from(sig);
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  if (!(Number(exp) * 1000 > nowMs)) return null;
  const userId = Number(uid);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// HttpOnly = JavaScript ในหน้าเว็บอ่าน cookie ไม่ได้ (กัน XSS ขโมย session)
// SameSite=Lax = เว็บอื่นยิง POST มาพร้อม cookie ของเราไม่ได้ (กัน CSRF)
// Secure = ส่งเฉพาะ https — เปิดเมื่อ FRONTEND_URL เป็น https (Funnel) ตอน dev บน localhost ปิดไว้
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: config.cookieSecure,
  path: "/",
});

export function setSession(res, userId) {
  res.cookie(SESSION_COOKIE, createSessionValue(userId), { ...cookieOptions(), maxAge: MAX_AGE_S * 1000 });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}
