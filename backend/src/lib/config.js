import "dotenv/config";

const num = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error(`Env ${key} must be a number (got "${raw}")`);
  return n;
};

export const config = {
  port: num("PORT", 3000),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  points: {
    perKm: num("POINTS_PER_KM", 10),
    costWater: num("POINTS_COST_WATER", 15),
    costFertilizer: num("POINTS_COST_FERTILIZER", 20),
  },
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID ?? "",
    clientSecret: process.env.STRAVA_CLIENT_SECRET ?? "",
    redirectUri: process.env.STRAVA_REDIRECT_URI ?? "",
  },
};

export const actionCost = {
  water: config.points.costWater,
  fertilizer: config.points.costFertilizer,
};
