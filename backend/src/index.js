import express from "express";
import cors from "cors";

import { config } from "./lib/config.js";
import { errorHandler, notFound } from "./middleware/error.js";

import { sensorRouter } from "./routes/sensor.js";
import { deviceRouter } from "./routes/device.js";
import { userRouter } from "./routes/user.js";
import { actionRouter } from "./routes/action.js";
import { stravaRouter } from "./routes/strava.js";
import { cleanupStaleCommands } from "./jobs/cleanupStale.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get("/", (_req, res) => {
  res.type("html").send(renderIndex());
});

app.use("/api/sensor", sensorRouter);
app.use("/api/device", deviceRouter);
app.use("/api/user", userRouter);
app.use("/api/action", actionRouter);
app.use("/api/auth/strava", stravaRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`🌱 Backend ready at http://localhost:${config.port}`);
  // Sweep stale executing commands ทันทีตอน start (กวาดของค้างจาก process เก่า)
  cleanupStaleCommands().catch((e) => console.error("[cleanup] startup error:", e));
});

// Sweep ทุก 60 วิ — refund แต้มของ command ที่ค้าง (ESP32 ตายระหว่าง execute)
setInterval(() => {
  cleanupStaleCommands().catch((e) => console.error("[cleanup] interval error:", e));
}, 60_000);

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
        { m: "POST", path: "/api/device", desc: "ผูกอุปกรณ์กับผู้ใช้ { userId, deviceId, displayName }" },
        { m: "GET", path: "/api/device/:deviceId/command", desc: "ESP32 poll คำสั่ง pending" },
        { m: "POST", path: "/api/device/:deviceId/command/:cmdId/ack", desc: "ESP32 แจ้งผลหลังรันคำสั่ง { status: success|failed }" },
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
        { m: "POST", path: "/api/action", desc: "สั่งงาน { userId, deviceId, actionType: water|fertilizer, durationSeconds? }" },
      ],
    },
    {
      title: "Strava OAuth",
      routes: [
        { m: "GET", path: "/api/auth/strava/login", desc: "เริ่ม OAuth flow (redirect ไป Strava)" },
        { m: "GET", path: "/api/auth/strava/callback", desc: "Strava callback (ไม่ต้องเรียกเอง)" },
        { m: "POST", path: "/api/auth/strava/sync/:userId", desc: "ซิงก์กิจกรรมล่าสุด + เพิ่มแต้ม" },
      ],
    },
  ];

  const methodColor = { GET: "#1D9E75", POST: "#BA7517", PUT: "#7F77DD", DELETE: "#C84343" };
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
