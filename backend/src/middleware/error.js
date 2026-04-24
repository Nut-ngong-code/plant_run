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
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
};
