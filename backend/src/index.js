import express from "express";
import cors from "cors";

import { config } from "./lib/config.js";
import { errorHandler, notFound } from "./middleware/error.js";

import { sensorRouter } from "./routes/sensor.js";
import { deviceRouter } from "./routes/device.js";
import { userRouter } from "./routes/user.js";
import { actionRouter } from "./routes/action.js";
import { stravaRouter } from "./routes/strava.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use("/api/sensor", sensorRouter);
app.use("/api/device", deviceRouter);
app.use("/api/user", userRouter);
app.use("/api/action", actionRouter);
app.use("/api/auth/strava", stravaRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`🌱 Backend ready at http://localhost:${config.port}`);
});
