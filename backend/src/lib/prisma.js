import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // production / test = log แค่ error (ตอนรันเทสไม่ให้ SQL ทุกบรรทัดท่วมผล)
  log: ["production", "test"].includes(process.env.NODE_ENV) ? ["error"] : ["query", "warn", "error"],
});
