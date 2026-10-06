# 🌱 วิ่งเพื่อชีวิตของต้นไม้ในกระถาง

โครงงานจบที่เชื่อมการวิ่งเข้ากับการดูแลต้นไม้จริงผ่าน IoT — ผู้ใช้วิ่งผ่าน Strava → ระยะทางแปลงเป็นแต้ม → ใช้แต้มกดรดน้ำ/ให้ปุ๋ยผ่านเว็บ → ESP32 สั่งปั๊ม+วาล์วให้น้ำไหลลงกระถาง + เซ็นเซอร์วัดความชื้น feedback กลับมา

**กติกาแต้ม**: วิ่ง 1 กม. = 10 แต้ม · รดน้ำ = -15 · ให้ปุ๋ย = -20

## โครงสร้าง (Monorepo)

```
code/
├── frontend/      # Vite 5 + React 18 + Tailwind 3
├── backend/       # Node 18 + Express 5 + Prisma 6 (ESM)
├── database/      # Docker MySQL 8 + init.sql
├── README.md
└── .gitignore
```

## Stack

- **DB**: MySQL 8 (Docker),  @ :3306
- **Backend**: Node 18.19.1, pnpm 10, ESM, Express 5, Prisma 6, `node --watch` for dev → :3000
- **MQTT**: broker (Aedes) ฝังใน backend → :1883 — ESP32 รับคำสั่งแบบ push ผ่าน `plant/<deviceId>/cmd` (ตั้ง `MQTT_PORT=0` เพื่อปิด)
- **Frontend**: Vite 5 (proxy `/api` + `/health` → :3000), React Router (lazy routes), Axios → :5173
- **Hardware**: ESP32 + Relay + ปั๊มน้ำ + Solenoid Valve + Soil Moisture Sensor
- **Firmware**: `firmware/esp32_v-1/` (MQTT — ต้องลง lib **PubSubClient**) · `firmware/esp32_polling/` (รุ่นสำรอง HTTP polling ทุก 5 วิ)
  - **อัปเดตผ่าน Wi-Fi (OTA)** — รหัส = Device Token · (A) Arduino IDE → Port `plantpot-pot-001 at 192.168.x.x` → Upload · (B) Sketch → Export Compiled Binary → `http://plantpot-pot-001.local/update` (user `plantpot`)
  - **Partition Scheme ต้องเป็น "Default 4MB with spiffs"** (มี 2 ช่อง app) — ถ้าเลือก "Huge APP (no OTA)" จะอัปเดตผ่าน Wi-Fi ไม่ได้
  - ดูเหตุการณ์ย้อนหลัง + สาเหตุการรีเซ็ต: `http://plantpot-pot-001.local/log` (ข้อความล้วน: `/log?txt=1`)
  - **DEV API ทดสอบปั๊ม/วาล์ว** (ไม่มีปุ่มบนหน้าเว็บแล้ว): `POST /on?sec=10` · `POST /fertilizer` · `POST /off` · `GET /status` — Basic Auth `plantpot` / Device Token · คู่มือ [`firmware/esp32_v-1/DEV-API.md`](firmware/esp32_v-1/DEV-API.md) · Postman: `scripts/postman/plant-dev.postman_collection.json`
  - **หลัง rotate token บนเว็บ** → เปิด `http://plantpot-pot-001.local` → ช่อง "🔑 เปลี่ยน Token" → บันทึก (แก้เฉพาะ Token · Wi-Fi/Server URL คงเดิม · ไม่ต้องรีบูต) — ปุ่ม "ตั้งค่าใหม่" ใช้เมื่อต้องเปลี่ยน Wi-Fi/Device ID (ล้างทั้งหมด)
  - **ชื่อในเครือข่ายตั้งตาม Device ID** — `POT-001` → `plantpot-pot-001.local` / พอร์ต OTA `plantpot-pot-001` · หลายกระถางในบ้านเดียวกันจึงไม่ชนกัน (ชื่อนี้โชว์ในหน้าเราเตอร์ด้วย) · firmware ก่อน 2026-10-06 ใช้ `plantpot.local` ทุกตัว

## Quick Start

```bash
# 1. Database (Docker)
cd database && docker-compose up -d

# 2. Backend (terminal #1)
cd backend && pnpm install && pnpm exec prisma generate && pnpm run dev
# → http://localhost:3000

# 3. Frontend (terminal #2)
cd frontend && pnpm install && pnpm run dev
# → http://localhost:5173
```

## Workflow (Solo Dev — Trunk-based)

- **`main`** = trunk เดียว มีทั้ง frontend/backend/database
- Feature ที่ข้าม layer (เช่น OAuth) แตก feature branch จาก main, แก้ทั้งสอง folder ใน PR/commit เดียว, merge กลับ
- Demo snapshot ใช้ **git tag** (เช่น `v0.1.0-beta.0`) ไม่ใช้ branch
- Commit message: Conventional Commits (`feat(ui):`, `feat(backend):`, `perf(frontend):`, `chore:`)

## เฟส (อัปเดต 2026-04-27)

| เฟส | งาน | สถานะ |
|---|---|---|
| 1 | DB schema + Strava App registration | ✅ |
| 2 | Hardware PoC — ESP32 + ปั๊ม | ✅ ปั๊มทำงาน · 🟡 รอ firmware (Wi-Fi + poll command queue) |
| 3 | Backend Core (Prisma + Express + APIs) | ✅ |
| 4 | Strava OAuth (port-agnostic) | ✅ โค้ดเสร็จ — รอ E2E test จริง |
| 5 | Frontend UI/UX + perf | ✅ glassmorphism + code-split (login bundle 92 KB gz) |
| 6 | E2E Integration (วิ่ง → รดน้ำ → moisture feedback) | ❌ รอ firmware |

## เอกสารเพิ่มเติม

- `../แผนการทำงาน.pdf` — แผน 6 เฟส (source of truth)
- `../ขอบเขตงานวิ่งเพื่อรดน้ำ.pdf` — scope document
- `database/db_schema_plant_watering.html` — ER diagram (Mermaid)
- `../CLAUDE.md` — instructions สำหรับ AI assistant + dev notes
