import "dotenv/config";
import crypto from "node:crypto";

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env ${key} must be a number (got "${raw}")`);
  return n;
};

// SESSION_SECRET ใช้เซ็น cookie ของผู้ใช้ — ไม่ตั้ง = สุ่มใหม่ทุกครั้งที่เปิด backend (ผู้ใช้ต้อง login ใหม่หลัง restart)
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) {
  console.warn("⚠️  SESSION_SECRET ไม่ได้ตั้ง — ใช้ค่าสุ่มชั่วคราว (ตั้งใน .env: openssl rand -hex 32)");
}
const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

export const config = {
  port: num("PORT", 3000),
  // MQTT broker สำหรับ ESP32 (0 = ปิด) — บน Pi เปิดออก Funnel ด้วย --tls-terminated-tcp=8443
  mqttPort: num("MQTT_PORT", 1883),
  frontendUrl,
  sessionSecret,
  cookieSecure: frontendUrl.startsWith("https://"), // ผ่าน Funnel = https → cookie ส่งเฉพาะ https
  // ปุ่ม DEV login (เข้าเป็น userId ไหนก็ได้) — เปิดเฉพาะเครื่อง dev: ALLOW_DEV_LOGIN=true · บน server ห้ามเปิด
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === "true",
  points: {
    perKm: num("POINTS_PER_KM", 10),
    costWater: num("POINTS_COST_WATER", 15),
    costFertilizer: num("POINTS_COST_FERTILIZER", 20),
  },
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID ?? "",
    clientSecret: process.env.STRAVA_CLIENT_SECRET ?? "",
    redirectUri: process.env.STRAVA_REDIRECT_URI ?? "",
  },
};

export const actionCost = {
  water: config.points.costWater,
  fertilizer: config.points.costFertilizer,
};
