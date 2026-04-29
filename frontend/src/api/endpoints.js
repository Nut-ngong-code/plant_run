import { api } from "./client.js";

export const getDashboard = (userId) =>
  api.get(`/api/user/${userId}/dashboard`).then((r) => r.data);

export const getHistory = (userId, type = "run", limit = 50) =>
  api.get(`/api/user/${userId}/history`, { params: { type, limit } }).then((r) => r.data);

export const sendAction = (payload) =>
  api.post(`/api/action`, payload).then((r) => r.data);

export const registerDevice = (payload) =>
  api.post(`/api/device`, payload).then((r) => r.data);

export const rotateDeviceToken = (userId, deviceId) =>
  api.post(`/api/device/${deviceId}/rotate-token`, { userId }).then((r) => r.data);

export const syncStrava = (userId) =>
  api.post(`/api/auth/strava/sync/${userId}`, {}).then((r) => r.data);

export const getSoilHistory = (deviceId, limit = 200) =>
  api.get(`/api/device/${deviceId}/soil-history`, { params: { limit } }).then((r) => r.data);
