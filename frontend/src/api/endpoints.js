import { api } from "./client.js";

export const getDashboard = (userId) =>
  api.get(`/api/user/${userId}/dashboard`).then((r) => r.data);

export const getHistory = (userId, type = "run", limit = 50) =>
  api.get(`/api/user/${userId}/history`, { params: { type, limit } }).then((r) => r.data);

export const sendAction = (payload) =>
  api.post(`/api/action`, payload).then((r) => r.data);

export const registerDevice = (payload) =>
  api.post(`/api/device`, payload).then((r) => r.data);

// ผู้ใช้มาจาก session cookie — ไม่ต้องส่ง userId
export const rotateDeviceToken = (deviceId) =>
  api.post(`/api/device/${deviceId}/rotate-token`).then((r) => r.data);

export const deleteDevice = (deviceId) =>
  api.delete(`/api/device/${deviceId}`).then((r) => r.data);

export const getMe = () => api.get(`/api/auth/me`).then((r) => r.data);

export const getAuthOptions = () => api.get(`/api/auth/options`).then((r) => r.data);

export const devLogin = (userId) => api.post(`/api/auth/dev-login`, { userId }).then((r) => r.data);

export const logout = () => api.post(`/api/auth/logout`);

export const syncStrava = (userId) =>
  api.post(`/api/auth/strava/sync/${userId}`, {}).then((r) => r.data);

export const getSoilHistory = (deviceId, limit = 200) =>
  api.get(`/api/device/${deviceId}/soil-history`, { params: { limit } }).then((r) => r.data);
