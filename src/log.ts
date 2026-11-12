// Structured JSON logging. Never logs keys or message content.
import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  reqId?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  errorCategory?: string;
  msg: string;
  [key: string]: unknown;
}

function write(level: LogLevel, entry: Omit<LogEntry, "ts" | "level">): void {
  const line = { ts: new Date().toISOString(), level, ...entry };
  process.stdout.write(JSON.stringify(line) + "\n");
}

export const log = {
  info: (msg: string, extra?: Record<string, unknown>) =>
    write("info", { msg, ...extra }),
  warn: (msg: string, extra?: Record<string, unknown>) =>
    write("warn", { msg, ...extra }),
  error: (msg: string, extra?: Record<string, unknown>) =>
    write("error", { msg, ...extra }),
  request: (
    reqId: string,
    route: string,
    status: number,
    durationMs: number,
    errorCategory?: string
  ) =>
    write(errorCategory ? "error" : "info", {
      reqId,
      route,
      status,
      durationMs,
      errorCategory,
      msg: `${route} ${status} ${durationMs}ms`,
    }),
};

export function newReqId(): string {
  return randomUUID().slice(0, 8);
}
