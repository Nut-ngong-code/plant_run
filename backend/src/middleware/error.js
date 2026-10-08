import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (_req, res) => {
  res.status(404).json({ error: "Not found" });
};

// Express 5 passes async errors automatically; this handles all thrown errors.
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request", issues: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // error จาก express.json() เช่น JSON ผิดรูปแบบ (400) / body ใหญ่เกิน 1mb (413) — เป็นความผิดของคำขอ ไม่ใช่ของ server
  if (err.expose && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.type === "entity.parse.failed" ? "Invalid JSON" : err.message });
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
};
