// header ความปลอดภัยของเบราว์เซอร์ — มาจากผลสแกน OWASP ZAP (2026-10-08) ก่อนแก้ไม่มีสักตัว
// เทสไว้กันหายตอนแก้ app.js ในอนาคต (ไม่ใช้ฐานข้อมูล)
import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";

describe("header ความปลอดภัย (ผลจาก OWASP ZAP)", () => {
  it("มี CSP / กัน iframe / nosniff / HSTS / Permissions-Policy / COOP และไม่บอกว่าใช้ Express", async () => {
    const res = await request(app).get("/health");
    const csp = res.headers["content-security-policy"];

    expect(csp).toContain("script-src 'self'"); // script จากเว็บเราเท่านั้น
    expect(csp).toContain("frame-ancestors 'none'"); // ห้ามเว็บอื่นฝังหน้าเรา (clickjacking)
    expect(csp).toContain("object-src 'none'");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("CORS ตอบกลับเฉพาะโดเมนของเรา ไม่ใช่โดเมนที่ขอมา", async () => {
    const res = await request(app).get("/health").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173"); // FRONTEND_URL ในเทส
    expect(res.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
  });
});
