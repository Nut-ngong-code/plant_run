import { prisma } from "../lib/prisma.js";

// ถ้า ESP32 ดับระหว่าง execute command → ACTION_LOG ค้างที่ status="executing" ตลอดไป
// Job นี้กวาด: status=executing + executedAt < (now - STALE_MS) → mark failed + refund แต้ม
//
// Threshold logic:
//   - Cloud command duration max = 120s (firmware clamp)
//   - + buffer สำหรับ ack delay/network
//   - = 180s ถ้าค้างเกินนี้ ESP32 ตายชัวร์
const STALE_MS = 180_000;

export async function cleanupStaleCommands() {
  const cutoff = new Date(Date.now() - STALE_MS);

  const stale = await prisma.actionLog.findMany({
    where: {
      status: "executing",
      executedAt: { lt: cutoff },
    },
    select: { id: true, userId: true, pointsDeducted: true },
  });

  if (stale.length === 0) return { cleaned: 0 };

  const refundsByUser = new Map();
  for (const a of stale) {
    if (a.pointsDeducted) {
      refundsByUser.set(a.userId, (refundsByUser.get(a.userId) ?? 0) + a.pointsDeducted);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.actionLog.updateMany({
      where: { id: { in: stale.map((a) => a.id) } },
      data: { status: "failed" },
    });
    for (const [userId, amount] of refundsByUser) {
      await tx.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: amount } },
      });
    }
  });

  console.log(
    `[cleanup] marked ${stale.length} stale commands as failed · refunded ${[...refundsByUser.values()].reduce((s, n) => s + n, 0)} pts across ${refundsByUser.size} user(s)`,
  );
  return { cleaned: stale.length };
}
