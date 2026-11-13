// Date/time anchoring and session memory.
// All date resolution happens in code, not in the model.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";

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
  via?: "voice" | "text";
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

// --- Spoken date normalization ---

const ORDINAL_MAP: Array<[RegExp, string]> = [
  [/\bthirty[- ]first\b/gi, "31st"],
  [/\bthirtieth\b/gi, "30th"],
  [/\btwenty[- ]ninth\b/gi, "29th"],
  [/\btwenty[- ]eighth\b/gi, "28th"],
  [/\btwenty[- ]seventh\b/gi, "27th"],
  [/\btwenty[- ]sixth\b/gi, "26th"],
  [/\btwenty[- ]fifth\b/gi, "25th"],
  [/\btwenty[- ]fourth\b/gi, "24th"],
  [/\btwenty[- ]third\b/gi, "23rd"],
  [/\btwenty[- ]second\b/gi, "22nd"],
  [/\btwenty[- ]first\b/gi, "21st"],
  [/\btwentieth\b/gi, "20th"],
  [/\bnineteenth\b/gi, "19th"],
  [/\beighteenth\b/gi, "18th"],
  [/\bseventeenth\b/gi, "17th"],
  [/\bsixteenth\b/gi, "16th"],
  [/\bfifteenth\b/gi, "15th"],
  [/\bfourteenth\b/gi, "14th"],
  [/\bthirteenth\b/gi, "13th"],
  [/\btwelfth\b/gi, "12th"],
  [/\beleventh\b/gi, "11th"],
  [/\btenth\b/gi, "10th"],
  [/\bninth\b/gi, "9th"],
  [/\beighth\b/gi, "8th"],
  [/\bseventh\b/gi, "7th"],
  [/\bsixth\b/gi, "6th"],
  [/\bfifth\b/gi, "5th"],
  [/\bfourth\b/gi, "4th"],
  [/\bthird\b/gi, "3rd"],
  [/\bsecond\b/gi, "2nd"],
  [/\bfirst\b/gi, "1st"],
];

export function normalizeSpokenDates(text: string): string {
  let normalized = text;
  for (const [pattern, replacement] of ORDINAL_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Normalise patterns like "3rd of November" -> "3rd November"
  normalized = normalized.replace(/(\b\d{1,2}(?:st|nd|rd|th))\s+of\s+([a-zA-Z]+)/gi, "$1 $2");
  return normalized;
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
  const tmp = p + `.tmp.${process.pid}.${Date.now()}`;
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

function formatDay(d: Date, tzOffsetMinutes: number): string {
  const local = new Date(d.getTime() - tzOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function lastWeekday(
  targetWeekday: number,
  now: Date,
  tzOffsetMinutes: number
): { primary: Date; alternate: Date } {
  const localNow = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const localWeekday = localNow.getUTCDay();

  let daysBack = (localWeekday - targetWeekday + 7) % 7;
  if (daysBack === 0) daysBack = 7;

  const primary = new Date(localNow);
  primary.setUTCDate(primary.getUTCDate() - daysBack);
  primary.setUTCHours(0, 0, 0, 0);

  const alternate = new Date(primary);
  alternate.setUTCDate(alternate.getUTCDate() - 7);

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

export function resolveAnchors(
  rawText: string,
  nowMs: number,
  tzOffset: number
): AnchorResult {
  const text = normalizeSpokenDates(rawText);
  const now = new Date(nowMs);
  const anchors: TimeAnchor[] = [];

  const lastWd = extractLastWeekday(text);
  if (lastWd !== null) {
    const { primary, alternate } = lastWeekday(lastWd, now, tzOffset);
    const primaryDay = formatDay(primary, tzOffset);
    const alternateDay = formatDay(alternate, tzOffset);

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

  const chronoRef = new Date(nowMs);
  const parsed = chrono.parse(text, chronoRef, { forwardDate: false });

  for (const result of parsed) {
    const matchText = result.text.toLowerCase().trim();

    if (lastWd !== null && matchText.includes("last")) continue;

    let date = result.start.date();

    if (date > now) {
      const hasMonth = result.start.isCertain("month");
      const hasYear = result.start.isCertain("year");
      if (!hasMonth && !hasYear) {
        date = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1_000);
      } else if (hasMonth && !hasYear) {
        date = new Date(date);
        date.setFullYear(date.getFullYear() - 1);
      }
    }

    if (date > now) continue;

    const day = formatDay(date, tzOffset);

    if (!anchors.some((a) => a.day === day)) {
      anchors.push({ text: result.text, day });
    }
  }

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

  matched.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

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
