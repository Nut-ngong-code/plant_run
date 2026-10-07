// กลุ่ม 3 — แต้มและการกดรัว (race condition) · 📝 ให้เติมเอง
// คำใบ้ยิงพร้อมกัน: await Promise.all(Array.from({ length: 5 }, () => request(app).post("/api/action").set("Cookie", cookieFor(id)).send({...})))
// แล้วนับ status 201 กับ 400 และเช็คแต้มสุดท้ายในฐาน
import { describe, it } from "vitest";

describe("แต้ม", () => {
  it.todo("แต้ม 10 สั่งรดน้ำ (15) → 400 insufficient_points และแต้มยัง 10");
  it.todo("รดน้ำสำเร็จ → 201 แต้มลด 15 และมี ACTION_LOG สถานะ pending");
  it.todo("แต้ม 20 ยิงรดน้ำพร้อมกัน 5 ครั้ง → สำเร็จแค่ 1 ครั้ง แต้มเหลือ 5 ไม่ติดลบ");
  it.todo("ลบกระถางที่มีคำสั่ง pending → คืนแต้มที่หักไว้");
});
