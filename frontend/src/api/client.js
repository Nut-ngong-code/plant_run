import axios from "axios";
import { clearUserId } from "../lib/session.js";

// baseURL ว่างไว้ — dev ใช้ Vite proxy, prod ใช้ reverse proxy เดียวกัน
export const api = axios.create({
  baseURL: "",
  timeout: 15_000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // session หมดอายุ / ถูก logout ที่อื่น → กลับไปหน้า login (ยกเว้นตอนเช็คสถานะ login เอง)
    const url = err.config?.url ?? "";
    if (err.response?.status === 401 && !url.startsWith("/api/auth/") && window.location.pathname !== "/login") {
      clearUserId();
      window.location.assign("/login?error=session_expired");
    }
    const data = err.response?.data;
    const message = data?.error || err.message || "Unknown error";
    return Promise.reject(Object.assign(new Error(message), { response: err.response, data }));
  },
);
