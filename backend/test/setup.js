// รันก่อนทุกไฟล์เทส — กันพลาดไปล้างฐานข้อมูลจริง
// เทสลบข้อมูลทุกตาราง ถ้า DATABASE_URL ชี้ plant_run_db ข้อมูลผู้ใช้จริงหายหมด
const url = process.env.DATABASE_URL ?? "";
const dbName = url.split("/").pop()?.split("?")[0] ?? "";

if (!dbName.endsWith("_test")) {
  throw new Error(
    `ไม่รันเทส: DATABASE_URL ชี้ไปที่ฐาน "${dbName || "(ไม่ได้ตั้ง)"}" — ` +
      "ต้องเป็นฐานที่ชื่อลงท้ายด้วย _test (ตั้งใน backend/.env.test ดู .env.test.example)",
  );
}
