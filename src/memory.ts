// Date/time anchoring and session memory.
// All date resolution happens in code, not in the model.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const chrono = require("chrono-node") as typeof import("chrono-node");

const DATA_DIR = path.join(process.cwd(), "data", "sessions");
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_RECALL_MESSAGES = 14;
const MAX_RECALL_CHARS = 1_400;

// --- Types ---

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  at: string; // ISO 8601
  sources?: Array<{ index: number; url: string; title: string }>;
}

export interface Session {
  id: string;
  messages: StoredMessage[];
}

export interface TimeAnchor {
  text: string;
  day: string; // YYYY-MM-DD
  fallback?: string; // YYYY-MM-DD – alternative if primary has no history
}

export interface RecalledHistory {
  anchors: TimeAnchor[];
  messages: StoredMessage[];
  daysCovered: string[];
  count: number;
}

// --- Session ID validation ---

export function validateSessionId(id: unknown): id is string {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

// --- File I/O (atomic write via temp + rename) ---

function sessionPath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadSession(id: string): Session {
  ensureDataDir();
  const p = sessionPath(id);
  if (!fs.existsSync(p)) return { id, messages: [] };
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return { id, messages: [] };
  }
}

export function saveSession(session: Session): void {
  ensureDataDir();
  const p = sessionPath(session.id);
  const tmp = p + `.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

export function appendMessage(sessionId: string, msg: StoredMessage): void {
  const session = loadSession(sessionId);
  session.messages.push(msg);
  saveSession(session);
}

export function listSessions(): Array<{
  id: string;
  title: string;
  lastActivity: string;
}> {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  return files.flatMap((f) => {
    const id = f.replace(/\.json$/, "");
    if (!validateSessionId(id)) return [];
    const session = loadSession(id);
    if (session.messages.length === 0) return [];
    const firstUser = session.messages.find((m) => m.role === "user");
    const last = session.messages[session.messages.length - 1];
    return [
      {
        id,
        title: firstUser
          ? firstUser.content.slice(0, 80)
          : "(no messages)",
        lastActivity: last?.at ?? new Date().toISOString(),
      },
    ];
  });
}

// --- Date anchoring ---

// Convert tzOffset (minutes, as Date.getTimezoneOffset() returns) to a Date
// in that timezone at midnight of a given YYYY-MM-DD.
function toLocalDate(day: string, tzOffsetMinutes: number): Date {
  // Parse the day as UTC midnight, then adjust by tzOffset
  const utc = new Date(`${day}T00:00:00Z`);
  // tzOffset is positive for west of UTC, negative for east
  utc.setUTCMinutes(utc.getUTCMinutes() + tzOffsetMinutes);
  return utc;
}

function formatDay(d: Date, tzOffsetMinutes: number): string {
  // Convert UTC date to local date in the given tz
  const local = new Date(d.getTime() - tzOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Return the most recent past weekday (0=Sun, 1=Mon... 6=Sat) relative to now,
// excluding today if it matches, and the alternate (one week earlier).
function lastWeekday(
  targetWeekday: number,
  now: Date,
  tzOffsetMinutes: number
): { primary: Date; alternate: Date } {
  // Convert now to local date
  const localNow = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const localWeekday = localNow.getUTCDay();

  let daysBack = (localWeekday - targetWeekday + 7) % 7;
  // If daysBack == 0, the target is today; we want the PAST occurrence so go back 7
  if (daysBack === 0) daysBack = 7;

  const primary = new Date(localNow);
  primary.setUTCDate(primary.getUTCDate() - daysBack);
  primary.setUTCHours(0, 0, 0, 0);

  const alternate = new Date(primary);
  alternate.setUTCDate(alternate.getUTCDate() - 7);

  // Convert back to UTC for consistent storage
  const toUtc = (d: Date) => new Date(d.getTime() + tzOffsetMinutes * 60_000);
  return { primary: toUtc(primary), alternate: toUtc(alternate) };
}

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

// Detect "last <weekday>" patterns before passing to chrono
function extractLastWeekday(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/\b(?:last|this past)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
  if (m) {
    const name = m[1] ?? "";
    return WEEKDAY_NAMES[name] ?? null;
  }
  return null;
}

export interface AnchorResult {
  anchors: TimeAnchor[];
}

// Resolve natural-language time references in text to calendar days.
// nowMs: epoch ms at request time. tzOffset: minutes (Date.getTimezoneOffset()).
export function resolveAnchors(
  text: string,
  nowMs: number,
  tzOffset: number // minutes, positive = west of UTC
): AnchorResult {
  const now = new Date(nowMs);
  const anchors: TimeAnchor[] = [];

  // Check for "last <weekday>" first
  const lastWd = extractLastWeekday(text);
  if (lastWd !== null) {
    const { primary, alternate } = lastWeekday(lastWd, now, tzOffset);
    const primaryDay = formatDay(primary, tzOffset);
    const alternateDay = formatDay(alternate, tzOffset);

    // Find the weekday name from text
    const wdMatch = text
      .toLowerCase()
      .match(/\b(?:last|this past)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
    const wdName = wdMatch ? wdMatch[1] ?? "" : "";

    anchors.push({
      text: `last ${wdName}`,
      day: primaryDay,
      fallback: alternateDay,
    });
  }

  // Also try chrono for other date references, but filter out weekday-only
  // expressions already handled above
  const chronoRef = new Date(nowMs);
  const parsed = chrono.parse(text, chronoRef, { forwardDate: false });

  for (const result of parsed) {
    const matchText = result.text.toLowerCase().trim();

    // Skip if already handled as "last <weekday>"
    if (lastWd !== null && matchText.includes("last")) continue;

    let date = result.start.date();

    // Resolve to PAST only
    if (date > now) {
      // Check if it's a weekday-only reference (no month specified)
      const hasMonth = result.start.isCertain("month");
      const hasYear = result.start.isCertain("year");
      if (!hasMonth && !hasYear) {
        // Go back one week
        date = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1_000);
      } else if (hasMonth && !hasYear) {
        // Go back one year
        date = new Date(date);
        date.setFullYear(date.getFullYear() - 1);
      }
    }

    // Still in the future? Skip.
    if (date > now) continue;

    const day = formatDay(date, tzOffset);

    // Avoid duplicates
    if (!anchors.some((a) => a.day === day)) {
      anchors.push({ text: result.text, day });
    }
  }

  // Also handle bare "On Monday" (without "last") as most recent past
  if (anchors.length === 0 || (lastWd === null && !parsed.length)) {
    const onWeekdayMatch = text
      .toLowerCase()
      .match(/\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
    if (onWeekdayMatch) {
      const wdName = onWeekdayMatch[1] ?? "";
      const wd = WEEKDAY_NAMES[wdName];
      if (wd !== undefined) {
        const { primary } = lastWeekday(wd, now, tzOffset);
        const primaryDay = formatDay(primary, tzOffset);
        if (!anchors.some((a) => a.day === primaryDay)) {
          anchors.push({ text: onWeekdayMatch[0], day: primaryDay });
        }
      }
    }
  }

  return { anchors };
}

// --- Recall ---

function messageDay(msg: StoredMessage, tzOffset: number): string {
  const d = new Date(msg.at);
  return formatDay(d, tzOffset);
}

// Scan ALL session files for messages on the given days, in the user's tz.
export function recallByDays(
  days: string[],
  tzOffset: number
): RecalledHistory {
  ensureDataDir();
  const daySet = new Set(days);
  const matched: StoredMessage[] = [];

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    if (!validateSessionId(id)) continue;
    const session = loadSession(id);
    for (const msg of session.messages) {
      if (daySet.has(messageDay(msg, tzOffset))) {
        matched.push(msg);
      }
    }
  }

  // Sort by time
  matched.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Cap at MAX_RECALL_MESSAGES and MAX_RECALL_CHARS each
  const capped: StoredMessage[] = [];
  for (const msg of matched.slice(0, MAX_RECALL_MESSAGES)) {
    capped.push({
      ...msg,
      content: msg.content.slice(0, MAX_RECALL_CHARS),
    });
  }

  const daysCovered = [...new Set(capped.map((m) => messageDay(m, tzOffset)))];

  return {
    anchors: [],
    messages: capped,
    daysCovered,
    count: capped.length,
  };
}

