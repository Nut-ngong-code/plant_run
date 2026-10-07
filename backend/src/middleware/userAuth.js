import { HttpError } from "./error.js";
import { readCookie, verifySessionValue, SESSION_COOKIE } from "../lib/session.js";

// ผู้ใช้เว็บต้อง login (มี cookie ที่ลายเซ็นถูก) — ได้ req.userId ที่เชื่อถือได้
// ห้ามเชื่อ userId ที่ส่งมาใน body / URL อีก (เดิมใครก็ส่งเลขคนอื่นมาได้ = IDOR)
export function requireUser(req, _res, next) {
  const userId = verifySessionValue(readCookie(req, SESSION_COOKIE));
  if (!userId) return next(new HttpError(401, "Not logged in"));
  req.userId = userId;
  next();
}

// เส้นทางที่มี userId ใน URL (เช่น /api/user/:id/dashboard) — ต้องเป็นของตัวเองเท่านั้น
export const requireSelf = (param) => (req, _res, next) => {
  const id = Number(req.params[param]);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, "Invalid user id"));
  if (id !== req.userId) return next(new HttpError(403, "Forbidden"));
  next();
};
