import { app, hasDist, distDir } from "./app.js";
import { config } from "./lib/config.js";
import { cleanupStaleCommands } from "./jobs/cleanupStale.js";
import { startMqtt, dispatchNext } from "./lib/mqtt.js";

// จุดเริ่มของ backend จริง (pnpm run dev / systemd) — ตัว app อยู่ใน app.js
app.listen(config.port, () => {
  console.log(`🌱 Backend ready at http://localhost:${config.port}`);
  console.log(hasDist ? `   เสิร์ฟหน้าเว็บจาก ${distDir} (API index อยู่ที่ /_api)` : "   ไม่พบ frontend/dist — โหมด dev (ใช้ Vite :5173)");
  // Sweep stale executing commands ทันทีตอน start (กวาดของค้างจาก process เก่า)
  sweepStale("startup");
});

if (config.mqttPort > 0) startMqtt(config.mqttPort);

// Sweep ทุก 60 วิ — refund แต้มของ command ที่ค้าง (ESP32 ตายระหว่าง execute)
// แล้วปล่อยคำสั่ง pending ที่ต่อคิวอยู่หลังตัวที่ค้าง ให้ ESP32 ที่ยังต่อ MQTT อยู่ได้ทำต่อ
setInterval(() => sweepStale("interval"), 60_000);

function sweepStale(when) {
  cleanupStaleCommands()
    .then(({ deviceIds }) => deviceIds.forEach(dispatchNext))
    .catch((e) => console.error(`[cleanup] ${when} error:`, e));
}
