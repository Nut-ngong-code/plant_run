import axios from "axios";

// baseURL ว่างไว้ — dev ใช้ Vite proxy, prod ใช้ reverse proxy เดียวกัน
export const api = axios.create({
  baseURL: "",
  timeout: 15_000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const data = err.response?.data;
    const message = data?.error || err.message || "Unknown error";
    return Promise.reject(Object.assign(new Error(message), { response: err.response, data }));
  },
);
