// Express server: routes, middleware, rate limiting, env check, security headers.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { runAgent } from "./agent.ts";
import {
  validateSessionId,
  loadSession,
  listSessions,
  saveSession,
  type StoredMessage,
} from "./memory.ts";
import { log, newReqId } from "./log.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Env check at startup ---
const REQUIRED_KEYS = ["ANTHROPIC_API_KEY", "TAVILY_API_KEY"];
const missing = REQUIRED_KEYS.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

// --- Security headers (same-origin, no wildcard CORS) ---
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'");
  next();
});

// --- In-memory per-IP rate limiter (20 chat req/min) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// Clean up rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) {
    if (v.resetAt < now) rateLimitMap.delete(k);
  }
}, 60_000).unref();

// --- Request logging middleware ---
app.use((req, res, next) => {
  const reqId = newReqId();
  const start = Date.now();
  (req as unknown as Record<string, unknown>)["reqId"] = reqId;
  res.on("finish", () => {
    log.request(reqId, `${req.method} ${req.path}`, res.statusCode, Date.now() - start);
  });
  next();
});

// --- Body parsing (4000 char limit enforced per-route) ---
app.use(express.json({ limit: "32kb" }));

// --- Static files ---
app.use(express.static(path.join(__dirname, "..", "public")));

// --- Health check ---
app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// --- Sessions list ---
app.get("/api/sessions", (_req, res) => {
  try {
    res.json(listSessions());
  } catch (err) {
    res.status(500).json({ error: "Failed to list sessions." });
  }
});

// --- Session detail ---
app.get("/api/sessions/:id", (req, res) => {
  const id = req.params["id"];
  if (!validateSessionId(id)) {
    res.status(400).json({ error: "Invalid session ID." });
    return;
  }
  try {
    const session = loadSession(id);
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: "Failed to load session." });
  }
});

// --- Seed endpoint for reviewers ---
app.post("/api/seed", (req, res) => {
  const body = req.body as unknown;
  if (!Array.isArray(body)) {
    res.status(400).json({ error: "Body must be an array." });
    return;
  }
  if (body.length > 50) {
    res.status(400).json({ error: "Too many sessions to seed (max 50)." });
    return;
  }

  const errors: string[] = [];
  for (const item of body) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>)["sessionId"] !== "string"
    ) {
      errors.push("Each item must have a sessionId string.");
      continue;
    }
    const { sessionId, messages } = item as {
      sessionId: string;
      messages?: unknown[];
    };
    if (!validateSessionId(sessionId)) {
      errors.push(`Invalid sessionId: ${sessionId}`);
      continue;
    }
    if (!Array.isArray(messages)) {
      errors.push(`${sessionId}: messages must be an array.`);
      continue;
    }

    const storedMsgs: StoredMessage[] = [];
    for (const m of messages) {
      if (typeof m !== "object" || m === null) continue;
      const { role, content, at } = m as Record<string, unknown>;
      if (
        (role !== "user" && role !== "assistant") ||
        typeof content !== "string" ||
        typeof at !== "string"
      )
        continue;
      storedMsgs.push({ role, content, at });
    }

    saveSession({ id: sessionId, messages: storedMsgs });
  }

  if (errors.length > 0) {
    res.status(207).json({ ok: true, errors });
  } else {
    res.json({ ok: true });
  }
});

// --- Chat (SSE over POST) ---
app.post("/api/chat", (req, res) => {
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({
      error: "Too many requests. Please wait a minute before trying again.",
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const { sessionId, message, tzOffset } = body;

  if (!validateSessionId(sessionId)) {
    res.status(400).json({ error: "Invalid or missing sessionId." });
    return;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message must be a non-empty string." });
    return;
  }
  if (message.length > 4000) {
    res.status(400).json({ error: "message must be 4000 characters or fewer." });
    return;
  }
  const tzOff =
    typeof tzOffset === "number" && Number.isFinite(tzOffset)
      ? Math.round(tzOffset)
      : 0;

  const reqId = (req as unknown as Record<string, unknown>)["reqId"] as string ?? newReqId();

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Tie AbortSignal to client disconnect
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  runAgent(
    { sessionId, message: message.trim(), tzOffset: tzOff, reqId },
    res,
    controller.signal
  )
    .catch((err) => {
      log.error("Agent error", { reqId, error: String(err) });
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: "An unexpected error occurred. Please try again." })}\n\n`
      );
    })
    .finally(() => {
      res.end();
    });
});

// --- Start ---
app.listen(PORT, "0.0.0.0", () => {
  log.info(`Ledger listening`, { port: PORT });
});
