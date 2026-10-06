import { prisma } from "./prisma.js";

// ESP32 รายงานผลคำสั่ง — ใช้ร่วมกันทั้ง MQTT (plant/<id>/ack) และ HTTP ack (firmware แบบ polling สำรอง)
// อัปเดตเฉพาะคำสั่งที่เป็นของอุปกรณ์นี้ และยังอยู่สถานะ executing เท่านั้น:
//   - กันอุปกรณ์หนึ่ง ack คำสั่งของอีกอุปกรณ์
//   - กัน ack ซ้ำ (MQTT QoS 1 ส่งซ้ำได้) และ ack ที่มาช้าหลัง cleanup job คืนแต้มไปแล้ว → ไม่คืนแต้มสองรอบ
// คืน null ถ้าไม่พบคำสั่งของอุปกรณ์นี้ · applied=false ถ้าคำสั่งจบไปแล้ว (ไม่แตะอะไร)
export async function applyAck(deviceDbId, commandId, status) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.actionLog.updateMany({
      where: { id: commandId, deviceId: deviceDbId, status: "executing" },
      data: { status, executedAt: new Date() },
    });
    const action = await tx.actionLog.findUnique({ where: { id: commandId } });
    if (!action || action.deviceId !== deviceDbId) return null;

    if (count === 1 && status === "failed" && action.pointsDeducted) {
      await tx.user.update({
        where: { id: action.userId },
        data: { totalPoints: { increment: action.pointsDeducted } },
      });
    }
    return { action, applied: count === 1 };
  });
}
