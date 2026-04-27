// เก็บ userId ใน localStorage — เวอร์ชัน prototype ไม่ต้องใช้ JWT
const KEY = "plant.userId";

export const getUserId = () => {
  const raw = localStorage.getItem(KEY);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const setUserId = (id) => localStorage.setItem(KEY, String(id));
export const clearUserId = () => localStorage.removeItem(KEY);
