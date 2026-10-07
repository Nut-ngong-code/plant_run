# DEV API — ทดสอบปั๊ม/วาล์วโดยตรงที่บอร์ด

หน้าเว็บของบอร์ดไม่มีปุ่มเปิดน้ำ/ให้ปุ๋ยแล้ว (ตั้งแต่ 2026-10-07) เพื่อไม่ให้ผู้ใช้รดน้ำฟรีโดยไม่ต้องวิ่งเก็บแต้ม
นักพัฒนาที่ต้องทดสอบฮาร์ดแวร์ให้เรียก API ด้านล่างจาก Postman แทน

- **Postman collection**: `scripts/postman/plant-dev.postman_collection.json` (File → Import)
  แล้วตั้งค่าตัวแปรของ collection: `board`, `token` (และ `server`, `userId`, `deviceId` ถ้าจะยิงผ่าน backend)
- ต้องอยู่ **Wi-Fi วงเดียวกับบอร์ด** — API นี้อยู่บนตัว ESP32 ไม่ได้ผ่าน backend/Funnel

## การยืนยันตัวตน

| | |
|---|---|
| ชนิด | HTTP **Basic Auth** |
| Username | `plantpot` |
| Password | **Device Token** ของบอร์ดตัวนั้น (ตัวเดียวกับรหัส OTA / หน้า `/update`) |

ผิด/ไม่ใส่ → `401` · rotate token แล้วต้องเปลี่ยนรหัสใน Postman ตาม

## Endpoint

ที่อยู่บอร์ด (`{{board}}`): `http://plantpot-<deviceid>.local` เช่น `http://plantpot-pot-001.local`
ถ้า `.local` ไม่ขึ้น ใช้ IP แทน (ดูได้จาก `GET /status`, ป้ายบนเว็บหลัก ⚙️ หรือหน้าเราเตอร์)

| Method | Path | ต้องใส่รหัส | ทำอะไร |
|---|---|---|---|
| `GET` | `/status` | ไม่ | สถานะปัจจุบัน (JSON) — ความชื้น %, ค่า ADC ดิบ, กำลังทำอะไรอยู่, MQTT, IP, uptime |
| `POST` | `/on?sec=10` | ใช่ | เปิด **น้ำ** `sec` วินาที (1–60, ไม่ใส่ = 10) แล้วปิดเอง |
| `POST` | `/fertilizer` | ใช่ | เปิด **ปุ๋ย** 5 วินาที แล้วปิดเอง |
| `POST` | `/off` | ใช่ | หยุดน้ำ/ปุ๋ยทดสอบทันที |
| `GET` | `/moisture` | ไม่ | `{"pct":41,"raw":1950}` — `raw` ใช้ calibrate `RAW_DRY`/`RAW_WET` |
| `GET` | `/log?txt=1` | ไม่ | log เหตุการณ์ล่าสุด 30 รายการแบบข้อความล้วน (คำสั่ง DEV ขึ้นเป็น `[dev] ...`) |

ทุกคำสั่งเปิดตามลำดับเดียวกับระบบจริง: วาล์ว → รอ 0.2 วิ → ปั๊ม · ปิด: วาล์ว → ปั๊มดูดสายต่อ 0.5 วิ → ปั๊ม

### ตัวอย่างผลลัพธ์

```json
// POST /on?sec=15
{"ok":true,"activity":"dev-water","sec":15}

// GET /status
{"deviceId":"POT-001","host":"plantpot-pot-001.local","ip":"192.168.1.141",
 "moisture":{"pct":41,"raw":1950},"activity":"dev-water","mqtt":"connected","uptimeSec":812}
```

`activity` = `cloud` (คำสั่งจากเว็บ) · `dev-fertilizer` · `dev-water` · `auto-water` · `idle`

### รหัสตอบกลับ

| Code | ความหมาย |
|---|---|
| `200` | สำเร็จ |
| `400` | `sec` ไม่อยู่ใน 1–60 |
| `401` | ไม่ใส่ / ใส่ Basic Auth ผิด |
| `405`/`404` | ใช้ GET กับ `/on` `/off` `/fertilizer` (ต้อง POST) |
| `409` | `busy` — กำลังทำคำสั่งจากเว็บที่ผู้ใช้จ่ายแต้มแล้ว ไม่ให้ DEV สับวาล์วกลางคัน ลองใหม่เมื่อ `activity` ไม่ใช่ `cloud` |

## ข้อควรระวัง

- **ไม่หักแต้ม ไม่บันทึก ACTION_LOG** — เป็นการสั่งฮาร์ดแวร์ตรง ๆ ใช้ทดสอบปั๊ม/วาล์ว/สายเท่านั้น
- ถ้าต้องการทดสอบ **ทั้งลูปจริง** (หักแต้ม → MQTT → ack → คืนแต้มถ้าล้มเหลว) ใช้โฟลเดอร์ "Backend" ใน collection:
  `POST {{server}}/api/action` body `{"deviceId":"POT-001","actionType":"water"}` — ตรงกับปุ่ม WATER บนเว็บ
  **ต้องมี session cookie** (ตั้งแต่ 2026-10-08 backend ไม่เชื่อ userId ใน body แล้ว): login ผ่านเว็บ → DevTools → Application → Cookies → คัดลอกค่า `plant_sid`
  → ใส่ในตัวแปร `session` ของ collection (Postman ส่งเป็น header `Cookie: plant_sid={{session}}` ให้ทุก request ในโฟลเดอร์ Backend) · cookie หมดอายุใน 30 วัน / logout แล้วต้องคัดลอกใหม่
- เปิดน้ำนานสุด 60 วิต่อคำสั่ง (เพดานเดียวกับ auto-water) กันน้ำล้นถ้าลืมเรียก `/off`
- ใช้ HTTP ธรรมดาในวง LAN — รหัส (token) วิ่งแบบไม่เข้ารหัสภายใน Wi-Fi บ้าน เหมือนหน้า `/update`
