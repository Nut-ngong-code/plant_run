// สิทธิ์จริงอยู่ที่ cookie `plant_sid` (HttpOnly — JavaScript อ่านไม่ได้ backend เป็นคนตรวจ)
// localStorage เก็บแค่ userId ไว้แสดงผล/ประกอบ URL ถ้าไม่ตรงกับ cookie backend จะตอบ 403
const KEY = "plant.userId";

export const getUserId = () => {
  const raw = localStorage.getItem(KEY);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export const setUserId = (id) => localStorage.setItem(KEY, String(id));
export const clearUserId = () => localStorage.removeItem(KEY);
