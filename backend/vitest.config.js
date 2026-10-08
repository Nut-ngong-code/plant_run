import fs from "node:fs";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// ฐานข้อมูลสำหรับเทส อ่านจาก .env.test (ไม่อยู่ใน git — คัดลอกจาก .env.test.example)
// ไม่มีไฟล์ = ใช้ env ของเครื่อง (เช่น GitHub Actions ตั้ง DATABASE_URL ให้)
const fileEnv = fs.existsSync(".env.test") ? dotenv.parse(fs.readFileSync(".env.test")) : {};

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      MQTT_PORT: "0",
      SESSION_SECRET: "test-only-secret",
      FRONTEND_URL: "http://localhost:5173",
      ALLOW_DEV_LOGIN: "false", // เทสว่าปิดจริง — ไม่สนว่า .env ของเครื่องเปิดไว้หรือไม่
      // Strava ปลอม — เทสแค่ redirect / state ไม่ได้คุยกับ Strava จริง (ไม่ต้องพึ่ง .env ของเครื่อง)
      STRAVA_CLIENT_ID: "test-client",
      STRAVA_CLIENT_SECRET: "test-secret",
      STRAVA_REDIRECT_URI: "http://localhost:3000/api/auth/strava/callback",
      ...fileEnv,
    },
    setupFiles: ["./test/setup.js"],
    // ทุกไฟล์เทสใช้ฐานเดียวกันและล้างข้อมูลก่อนแต่ละเทส → รันทีละไฟล์ ไม่ให้ลบข้อมูลของกันและกัน
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text-summary", "lcov"], // lcov → coverage/lcov.info ส่งให้ SonarCloud
    },
  },
});
