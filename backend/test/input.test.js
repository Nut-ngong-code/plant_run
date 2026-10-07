// กลุ่ม 6 — ข้อมูลที่ส่งเข้ามา + open redirect · 📝 ให้เติมเอง
import { describe, it } from "vitest";

describe("ตรวจข้อมูลขาเข้า (Zod)", () => {
  it.todo("actionType ไม่ใช่ water/fertilizer → 400");
  it.todo("durationSeconds > 120 → 400");
  it.todo("deviceId ว่าง → 400");
});

describe("Strava login redirect (กัน open redirect)", () => {
  // GET /api/auth/strava/login?return_to=... → ถอด state จาก URL ที่ redirect ไป Strava แล้วดู returnTo
  // ต้องตั้ง STRAVA_CLIENT_ID / SECRET / REDIRECT_URI ปลอมใน vitest env ไม่งั้นตอบ 500
  it.todo("return_to=https://evil-ts.net → returnTo เป็น null");
  it.todo("return_to=https://plantvm.xxx.ts.net.attacker.com → null");
  it.todo("return_to=javascript:alert(1) → null");
  it.todo("return_to=https://plantvm.tailbfad61.ts.net → ผ่าน");
});
