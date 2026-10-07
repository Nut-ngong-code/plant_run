// กลุ่ม 4 — คิวคำสั่งและ ack · 📝 ให้เติมเอง
// ทดสอบตรงที่ applyAck (src/lib/commands.js) ได้เลย ไม่ต้องผ่าน HTTP/MQTT:
//   import { applyAck } from "../src/lib/commands.js"
// เตรียม ACTION_LOG สถานะ executing ด้วย prisma.actionLog.create({...}) แล้วเรียก applyAck(deviceDbId, commandId, "failed")
import { describe, it } from "vitest";

describe("ack และการคืนแต้ม", () => {
  it.todo("ack failed → สถานะ failed + คืนแต้ม");
  it.todo("ack failed ซ้ำ 2 ครั้ง → คืนแต้มครั้งเดียว");
  it.todo("กระถาง A ack คำสั่งของกระถาง B → ไม่มีผล (ช่องโหว่เดิมก่อน MQTT)");
  it.todo("cleanupStaleCommands: คำสั่ง executing เกิน 180 วิ → failed + คืนแต้ม (src/jobs/cleanupStale.js)");
});
