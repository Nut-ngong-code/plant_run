import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";
import helmet from "helmet";

import { config } from "./lib/config.js";
import { errorHandler, notFound } from "./middleware/error.js";

import { sensorRouter } from "./routes/sensor.js";
import { deviceRouter } from "./routes/device.js";
import { userRouter } from "./routes/user.js";
import { actionRouter } from "./routes/action.js";
import { stravaRouter } from "./routes/strava.js";
import { authRouter } from "./routes/auth.js";

// หน้าเว็บที่ build แล้ว — โหมด production (Raspberry Pi / Tailscale Funnel) เสิร์ฟจาก Express
// ตัวเดียวกับ API เพราะ Funnel เปิดให้ได้พอร์ตเดียว ตอน dev ไม่มีโฟลเดอร์นี้ก็ข้ามไป (ใช้ Vite proxy เหมือนเดิม)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../../frontend/dist");
const hasDist = fs.existsSync(path.join(distDir, "index.html"));

// สร้าง Express app อย่างเดียว — ไม่ listen ไม่เปิด MQTT ไม่ตั้ง timer
// เทส (supertest) import ไฟล์นี้ไปยิง request ได้โดยไม่ต้องเปิดพอร์ตจริง · การเปิด server อยู่ใน index.js
const app = express();

// ไม่บอกคนนอกว่าใช้ Express (header X-Powered-By) — ลดข้อมูลให้ผู้โจมตีเลือกช่องโหว่ตามเวอร์ชัน
app.disable("x-powered-by");

// Header ความปลอดภัยของเบราว์เซอร์ (helmet) — ผลจากสแกน OWASP ZAP 2026-10-08
//   CSP: script โหลดได้จากเว็บเราเท่านั้น (build ไม่มี inline script) · ฟอนต์จาก Google Fonts
//        ห้ามเว็บอื่นฝังหน้าเราใน iframe (clickjacking)
//   style: ไม่ใช้ 'unsafe-inline' (ZAP รอบ after ยังเตือนข้อนี้ระดับ Medium) — อนุญาตเฉพาะ <style> ที่เขียนไว้เองในหน้า
//        ผ่าน hash SHA-256 ของเนื้อหา ถ้ามีคนฉีด <style> อื่นเข้ามา hash จะไม่ตรงแล้วเบราว์เซอร์ไม่ใช้
//        (style={{...}} ของ React และกราฟ Recharts ตั้งค่าผ่าน element.style ซึ่ง CSP ไม่บล็อก)
//   HSTS: บังคับ https หลังเข้าครั้งแรก (มีผลเฉพาะผ่าน Funnel — ตอน dev บน http เบราว์เซอร์ไม่สนใจ)
//   ไม่เปิด COEP: ทำให้ฟอนต์/สไตล์จาก Google โหลดไม่ได้ และแอปไม่ได้ใช้ฟีเจอร์ที่ต้อง cross-origin isolation
const sha256Source = (text) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;
export const inlineStyleHashes = (html) =>
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => sha256Source(m[1]));

const cspDirectives = (styleHashes) => ({
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", ...styleHashes, "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  // dev บน http://localhost ห้าม upgrade ไม่งั้นโหลด asset ไม่ได้
  ...(config.cookieSecure ? { upgradeInsecureRequests: [] } : {}),
});

// <style> ใน frontend/index.html (กันหน้ากะพริบตอน redirect จาก Strava) — คำนวณ hash จากไฟล์ที่ build แล้วตอนเปิด server
// แก้ index.html แล้ว build ใหม่ → restart backend ก็ได้ hash ใหม่เอง ไม่ต้องแก้โค้ดตรงนี้
const indexStyleHashes = hasDist ? inlineStyleHashes(fs.readFileSync(path.join(distDir, "index.html"), "utf8")) : [];

app.use(
  helmet({
    contentSecurityPolicy: { useDefaults: false, directives: cspDirectives(indexStyleHashes) },
    frameguard: { action: "deny" },
    crossOriginEmbedderPolicy: false,
  }),
);
// helmet ไม่ได้ตั้ง Permissions-Policy — เว็บนี้ไม่ใช้กล้อง/ไมค์/ตำแหน่ง/การชำระเงิน ปิดไว้ทั้งหมด
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  next();
});

// CORS: ให้เฉพาะหน้าเว็บของเราเรียก API ข้ามโดเมนได้ (เดิม cors() เปิดให้ทุกเว็บ)
// ปกติหน้าเว็บกับ API อยู่โดเมนเดียวกันอยู่แล้ว (Funnel / Vite proxy) ส่วน ESP32 ไม่เกี่ยวกับ CORS
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// รายการ endpoint — อยู่ที่ / ตอน dev, ย้ายไป /_api ตอนมีหน้าเว็บ (/ ถูกใช้เสิร์ฟ SPA)
// หน้านี้มี <style> ของตัวเอง → ใช้ CSP ที่อนุญาต hash ของหน้านี้แทนของ index.html
const apiIndexHtml = renderIndex();
const apiIndexCsp = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: cspDirectives(inlineStyleHashes(apiIndexHtml)),
});
app.get(hasDist ? "/_api" : "/", apiIndexCsp, (_req, res) => {
  res.type("html").send(apiIndexHtml);
});

app.use("/api/sensor", sensorRouter);
app.use("/api/device", deviceRouter);
app.use("/api/user", userRouter);
app.use("/api/action", actionRouter);
app.use("/api/auth/strava", stravaRouter);
app.use("/api/auth", authRouter);

if (hasDist) {
  // ไฟล์ asset มี hash ในชื่ออยู่แล้ว → cache ยาวได้ ส่วน index.html ต้องสดเสมอ (จัดการด้านล่าง)
  app.use(express.static(distDir, { index: false, maxAge: "1y" }));

  // SPA fallback — React Router จัดการ path เอง (/history, /add-device, /auth/callback)
  // ปล่อย /api/* กับ /health ผ่านไปให้ notFound ตอบ JSON ตามเดิม ไม่งั้นจะได้ HTML แทน 404
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/") || req.path === "/health") return next();
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

export { app, hasDist, distDir };

function renderIndex() {
  const groups = [
    {
      title: "System",
      routes: [
        { m: "GET", path: "/health", desc: "เช็คสถานะเซิร์ฟเวอร์" },
      ],
    },
    {
      title: "User / Dashboard",
      routes: [
        { m: "GET", path: "/api/user/:id/dashboard", desc: "ข้อมูลหน้า dashboard (แต้ม, กระถาง, ความชื้น, สัปดาห์)" },
        { m: "GET", path: "/api/user/:id/history?type=run|action&limit=50", desc: "ประวัติการวิ่ง / การกดรดน้ำ" },
      ],
    },
    {
      title: "Device (ESP32)",
      routes: [
        { m: "POST", path: "/api/device", desc: "ผูกอุปกรณ์กับผู้ใช้ใน session { deviceId, displayName } · 🍪 ต้อง login" },
        { m: "GET", path: "/api/device/:deviceId/command", desc: "ESP32 poll คำสั่ง pending (สำรอง — firmware ปัจจุบันรับคำสั่งผ่าน MQTT)" },
        { m: "POST", path: "/api/device/:deviceId/command/:cmdId/ack", desc: "ESP32 แจ้งผลหลังรันคำสั่ง { status: success|failed }" },
      ],
    },
    {
      title: "MQTT (ESP32 — port MQTT_PORT, ค่าเริ่มต้น 1883)",
      routes: [
        { m: "SUB", path: "plant/:deviceId/cmd", desc: "ESP32 รับคำสั่ง {id, type, durationSeconds} — backend ส่งทันทีที่ผู้ใช้กด" },
        { m: "PUB", path: "plant/:deviceId/ack", desc: "ESP32 แจ้งผล {id, status: success|failed}" },
        { m: "PUB", path: "plant/:deviceId/sensor", desc: "ESP32 ส่งความชื้น {moisturePercent}" },
        { m: "PUB", path: "plant/:deviceId/status", desc: "online (retained) · offline = Last Will" },
      ],
    },
    {
      title: "Sensor",
      routes: [
        { m: "POST", path: "/api/sensor", desc: "ESP32 ส่งค่าความชื้น { deviceId, moisturePercent }" },
      ],
    },
    {
      title: "Action (กดรดน้ำ/ปุ๋ย)",
      routes: [
        { m: "POST", path: "/api/action", desc: "สั่งงาน { deviceId, actionType: water|fertilizer, durationSeconds? } · 🍪 ต้อง login" },
      ],
    },
    {
      title: "Strava OAuth",
      routes: [
        { m: "GET", path: "/api/auth/strava/login", desc: "เริ่ม OAuth flow (redirect ไป Strava)" },
        { m: "GET", path: "/api/auth/strava/callback", desc: "Strava callback (ไม่ต้องเรียกเอง)" },
        { m: "POST", path: "/api/auth/strava/sync/:userId", desc: "ซิงก์กิจกรรมล่าสุด + เพิ่มแต้ม · 🍪 :userId ต้องเป็นตัวเอง" },
        { m: "GET", path: "/api/auth/me", desc: "ผู้ใช้ใน session (cookie plant_sid) · ไม่มี = 401" },
        { m: "POST", path: "/api/auth/logout", desc: "ลบ session cookie" },
        { m: "POST", path: "/api/auth/dev-login", desc: "เข้าเป็น { userId } ไม่ผ่าน Strava — เฉพาะ ALLOW_DEV_LOGIN=true" },
      ],
    },
  ];

  const methodColor = { GET: "#1D9E75", POST: "#BA7517", PUT: "#7F77DD", DELETE: "#C84343", SUB: "#2B7BB9", PUB: "#2B7BB9" };
  const sections = groups
    .map(
      (g) => `
    <section>
      <h2>${g.title}</h2>
      <ul>
        ${g.routes
          .map((r) => {
            const color = methodColor[r.m] ?? "#666";
            const link = r.m === "GET" ? `<a href="${r.path.replace(/:\w+/g, (m) => m === ":id" ? "1" : m === ":deviceId" ? "POT-001" : m).split("?")[0]}">${r.path}</a>` : `<code>${r.path}</code>`;
            return `<li><span class="method" style="background:${color}">${r.m}</span>${link}<p>${r.desc}</p></li>`;
          })
          .join("")}
      </ul>
    </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>🌱 Plant Watering API</title>
  <style>
    body { font-family: -apple-system, "Segoe UI", sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1.5rem; color: #222; line-height: 1.5; }
    h1 { margin-bottom: 0.2rem; }
    .lead { color: #666; margin-top: 0; }
    section { margin-top: 2rem; }
    h2 { font-size: 1.1rem; border-bottom: 1px solid #eee; padding-bottom: 0.3rem; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.6rem 0; border-bottom: 1px dashed #eee; }
    li:last-child { border-bottom: none; }
    .method { display: inline-block; color: white; font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; margin-right: 8px; min-width: 48px; text-align: center; }
    code, a { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 0.9rem; color: #333; text-decoration: none; }
    a:hover { text-decoration: underline; }
    li p { margin: 4px 0 0 56px; color: #666; font-size: 0.85rem; }
    .note { background: #FAEEDA; border-left: 3px solid #EF9F27; padding: 0.6rem 1rem; font-size: 0.85rem; color: #633806; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🌱 Plant Watering API</h1>
  <p class="lead">Backend สำหรับโครงงาน "วิ่งเพื่อชีวิตของต้นไม้ในกระถาง"</p>
  <p class="note">ลิงก์ <code>GET</code> ใต้ล่างคลิกได้ทันที ส่วน <code>POST</code> ต้องยิงด้วย Postman / curl / VS Code REST Client (ดูไฟล์ <code>requests.http</code>)</p>
  ${sections}
</body>
</html>`;
}
