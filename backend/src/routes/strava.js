import { Router } from "express";

import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { HttpError } from "../middleware/error.js";

export const stravaRouter = Router();

const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_ACTIVITIES = "https://www.strava.com/api/v3/athlete/activities";

const ensureConfigured = () => {
  const { clientId, clientSecret, redirectUri } = config.strava;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(500, "Strava is not configured yet — fill in .env first");
  }
};

// GET /api/auth/strava/login → redirect ไปหน้าล็อกอิน Strava
stravaRouter.get("/login", (_req, res) => {
  ensureConfigured();
  const params = new URLSearchParams({
    client_id: config.strava.clientId,
    redirect_uri: config.strava.redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });
  res.redirect(`${STRAVA_AUTH}?${params.toString()}`);
});

// GET /api/auth/strava/callback?code=...
// แลก code เป็น access_token + refresh_token, upsert USER
stravaRouter.get("/callback", async (req, res) => {
  ensureConfigured();
  const code = req.query.code;
  if (typeof code !== "string" || !code) throw new HttpError(400, "Missing code");

  const tokenRes = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new HttpError(502, "Strava token exchange failed", text);
  }
  const tok = await tokenRes.json();
  // tok: { access_token, refresh_token, expires_at, athlete: {id, firstname, ...} }

  const user = await prisma.user.upsert({
    where: { stravaId: String(tok.athlete.id) },
    create: {
      stravaId: String(tok.athlete.id),
      displayName: [tok.athlete.firstname, tok.athlete.lastname].filter(Boolean).join(" "),
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenExpiresAt: new Date(tok.expires_at * 1000),
    },
    update: {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenExpiresAt: new Date(tok.expires_at * 1000),
    },
  });

  // Redirect กลับไปที่ frontend พร้อม userId ใน query string
  // (เวอร์ชัน prototype ไม่มี JWT — frontend เก็บ userId ใน localStorage)
  const redirectUrl = new URL("/auth/callback", config.frontendUrl);
  redirectUrl.searchParams.set("userId", String(user.id));
  res.redirect(redirectUrl.toString());
});

// POST /api/auth/strava/sync/:userId
// ดึง activities ล่าสุด -> อัปเดต RUN_HISTORY + เพิ่มแต้ม (distance_km * POINTS_PER_KM)
stravaRouter.post("/sync/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) throw new HttpError(400, "Invalid user id");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.accessToken) throw new HttpError(400, "User not connected to Strava");

  const token = await ensureFreshToken(user);

  const after = req.body?.after
    ? Math.floor(new Date(req.body.after).getTime() / 1000)
    : undefined;
  const params = new URLSearchParams({ per_page: "50" });
  if (after) params.set("after", String(after));

  const actRes = await fetch(`${STRAVA_ACTIVITIES}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!actRes.ok) {
    throw new HttpError(502, "Strava activities fetch failed", await actRes.text());
  }
  const activities = await actRes.json();

  let earned = 0;
  let newRuns = 0;
  for (const a of activities) {
    if (a.type !== "Run" && a.sport_type !== "Run") continue;
    const distanceKm = (a.distance ?? 0) / 1000;
    const points = Math.floor(distanceKm * config.points.perKm);

    const result = await prisma.runHistory.upsert({
      where: { stravaActivityId: String(a.id) },
      create: {
        userId,
        stravaActivityId: String(a.id),
        distanceKm,
        pointsEarned: points,
        runAt: new Date(a.start_date),
      },
      update: {}, // กัน double-award: upsert สร้างแค่ครั้งแรก
    });

    // นับเฉพาะกรณี create ใหม่จริง (upsert ไม่บอกตรง ๆ — ใช้เทคนิคเทียบ syncedAt)
    const isNew = result.syncedAt && Date.now() - new Date(result.syncedAt).getTime() < 5000;
    if (isNew) {
      earned += points;
      newRuns += 1;
    }
  }

  if (earned > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { totalPoints: { increment: earned } },
    });
  }

  res.json({ newRuns, earned, activitiesChecked: activities.length });
});

async function ensureFreshToken(user) {
  if (user.tokenExpiresAt && user.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return user.accessToken;
  }
  const r = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });
  if (!r.ok) throw new HttpError(502, "Strava refresh failed", await r.text());
  const tok = await r.json();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      tokenExpiresAt: new Date(tok.expires_at * 1000),
    },
  });
  return tok.access_token;
}
