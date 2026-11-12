// Eval script: seeds history, fires the 3 reviewer prompts, verifies SSE event order.
// Run with: tsx scripts/eval.ts

import "../src/env.ts";
import * as http from "node:http";
import { randomUUID } from "node:crypto";

const BASE_URL = process.env["EVAL_BASE_URL"] ?? "http://localhost:3000";
const TZ_OFFSET = -330; // IST

// --- Helpers ---

function post(path: string, body: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(path, BASE_URL);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

interface SseEvent {
  event: string;
  data: unknown;
}

function chatSSE(
  sessionId: string,
  message: string
): Promise<SseEvent[]> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ sessionId, message, tzOffset: TZ_OFFSET });
    const url = new URL("/api/chat", BASE_URL);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const events: SseEvent[] = [];
        let buffer = "";
        let currentEvent = "message";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              try {
                events.push({ event: currentEvent, data: JSON.parse(dataStr) });
              } catch {
                events.push({ event: currentEvent, data: dataStr });
              }
              currentEvent = "message";
            }
          }
        });

        res.on("end", () => resolve(events));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// --- Seed dated history ---

const SEED_SESSION_1 = `eval-seed-${randomUUID().slice(0, 8)}`;
const SEED_SESSION_2 = `eval-seed-${randomUUID().slice(0, 8)}`;

// Prompt 2 scenario: on 3 November user asked about CRM tools
const NOV3_AT = "2026-11-03T10:00:00.000Z";
// Prompt 3 scenario: last Tuesday user asked about Postgres hosting
const LAST_TUE_AT = "2026-11-10T14:30:00.000Z";

async function seedHistory(): Promise<void> {
  console.log("Seeding history...");
  const body = [
    {
      sessionId: SEED_SESSION_1,
      messages: [
        {
          role: "user",
          content:
            "What are the best CRM tools for a 20-person sales team? We're evaluating Salesforce, HubSpot, Pipedrive, Zoho CRM, and Monday CRM.",
          at: NOV3_AT,
        },
        {
          role: "assistant",
          content:
            "For a 20-person sales team, here are the five CRMs you're evaluating:\n\n1. Salesforce Sales Cloud – Enterprise-grade, starts at $25/user/month (Starter). Most feature-rich but steep learning curve.\n2. HubSpot CRM – Free tier available; Sales Hub Professional at $90/user/month. Strong email and pipeline tools.\n3. Pipedrive – $14.90/user/month (Essential). Clean pipeline view, great for small sales teams.\n4. Zoho CRM – $14/user/month (Standard). Good automation, solid mobile app.\n5. Monday CRM – $10/user/month (Basic). Flexible but lighter on sales-specific features.",
          at: "2026-11-03T10:02:00.000Z",
        },
      ],
    },
    {
      sessionId: SEED_SESSION_2,
      messages: [
        {
          role: "user",
          content:
            "What are the best options for hosted Postgres? Looking at Neon, Supabase, Railway, PlanetScale, and Render Postgres.",
          at: LAST_TUE_AT,
        },
        {
          role: "assistant",
          content:
            "For hosted Postgres, here's what I found:\n\n1. Neon – Serverless Postgres, free tier available; Pro plan starts at $19/month. Branching features great for dev workflows.\n2. Supabase – Free tier (500MB); Pro at $25/month. Full BaaS with Postgres, auth, storage.\n3. Railway – Usage-based, ~$0.000463/GB-hour. Simple deploys, good DX.\n4. PlanetScale – MySQL (not Postgres); Hobby free tier discontinued in 2024.\n5. Render Postgres – Free tier (90-day limit); paid from $7/month. Easy Render integration.",
          at: "2026-11-10T14:32:00.000Z",
        },
      ],
    },
  ];

  const result = await post("/api/seed", body);
  console.log("Seed result:", result);
}

// --- Eval runners ---

interface EvalResult {
  prompt: string;
  sessionId: string;
  passed: boolean;
  issues: string[];
  stats: {
    searches: number;
    msToFirstToken: number;
    totalMs: number;
    citationsPresent: boolean;
    eventOrder: string[];
  };
}

function checkEventOrder(events: SseEvent[]): string[] {
  const eventNames = events.map((e) => e.event);
  const issues: string[] = [];

  // Expected: (anchors?) (memory?) (search?) sources? token+ done
  const doneIdx = eventNames.lastIndexOf("done");
  const tokenIndices = eventNames
    .map((e, i) => (e === "token" ? i : -1))
    .filter((i) => i >= 0);
  const searchIdx = eventNames.indexOf("search");
  const sourcesIdx = eventNames.indexOf("sources");

  if (doneIdx === -1) issues.push("missing 'done' event");
  if (tokenIndices.length === 0) issues.push("no 'token' events");
  if (tokenIndices.length > 0 && doneIdx !== -1) {
    if (tokenIndices[tokenIndices.length - 1]! >= doneIdx) {
      issues.push("token event after done");
    }
  }
  if (searchIdx !== -1 && sourcesIdx !== -1 && sourcesIdx < searchIdx) {
    issues.push("sources before search");
  }

  return issues;
}

function checkCitations(events: SseEvent[]): boolean {
  const tokens = events
    .filter((e) => e.event === "token")
    .map((e) => (e.data as { text?: string })?.text ?? "")
    .join("");
  return /\[\d+\]/.test(tokens);
}

function getDoneStats(events: SseEvent[]): {
  searches: number;
  msToFirstToken: number;
  totalMs: number;
} {
  const done = events.find((e) => e.event === "done");
  if (!done) return { searches: 0, msToFirstToken: 0, totalMs: 0 };
  const data = done.data as {
    stats?: { searches?: number; msToFirstToken?: number; totalMs?: number };
  };
  return {
    searches: data.stats?.searches ?? 0,
    msToFirstToken: data.stats?.msToFirstToken ?? 0,
    totalMs: data.stats?.totalMs ?? 0,
  };
}

async function runEval(
  prompt: string,
  sessionId: string,
  assertions: (events: SseEvent[], result: EvalResult) => void
): Promise<EvalResult> {
  console.log(`\nRunning: "${prompt.slice(0, 60)}..."`);
  const events = await chatSSE(sessionId, prompt);

  const result: EvalResult = {
    prompt: prompt.slice(0, 60),
    sessionId,
    passed: true,
    issues: [],
    stats: {
      ...getDoneStats(events),
      citationsPresent: checkCitations(events),
      eventOrder: events.map((e) => e.event),
    },
  };

  // Check event order
  const orderIssues = checkEventOrder(events);
  result.issues.push(...orderIssues);

  // Check searches <= 3 per round (we check total <= 9 for 3 rounds)
  if (result.stats.searches > 9) {
    result.issues.push(`too many searches: ${result.stats.searches}`);
  }

  // Run specific assertions
  assertions(events, result);

  if (result.issues.length > 0) result.passed = false;
  return result;
}

// --- Main ---

async function main(): Promise<void> {
  // Check server health
  try {
    const url = new URL("/healthz", BASE_URL);
    await new Promise<void>((resolve, reject) => {
      http.get(url.toString(), (res) => {
        if (res.statusCode === 200) resolve();
        else reject(new Error(`healthz returned ${res.statusCode}`));
      }).on("error", reject);
    });
    console.log(`Server healthy at ${BASE_URL}`);
  } catch (err) {
    console.error(`Server not reachable at ${BASE_URL}: ${err}`);
    console.error("Start the server with: npm run dev");
    process.exit(1);
  }

  await seedHistory();

  const results: EvalResult[] = [];

  // Prompt 1: CRM tools (new session, no seed – must say it has no record)
  const sess1 = `eval-noseed-${randomUUID().slice(0, 8)}`;
  results.push(
    await runEval(
      "On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?",
      sess1,
      (_events, result) => {
        const hasAnchors = result.stats.eventOrder.includes("anchors");
        if (!hasAnchors) result.issues.push("no anchors event emitted");
        // Without seed, it should state it has no record
      }
    )
  );

  // Prompt 2: Reference the seeded Nov 3 session
  const sess2 = `eval-p2-${randomUUID().slice(0, 8)}`;
  results.push(
    await runEval(
      "What did I ask you on 3 November? Is your answer still correct today?",
      sess2,
      (events, result) => {
        const tokens = events
          .filter((e) => e.event === "token")
          .map((e) => (e.data as { text?: string })?.text ?? "")
          .join("");

        // Should reference a date
        if (!/november|nov\s*3|2026-11-03/i.test(tokens)) {
          result.issues.push("response doesn't reference November 3");
        }
        // Should have searched for current info
        if (result.stats.searches === 0) {
          result.issues.push("no searches performed for 'still correct' check");
        }
        if (!result.stats.citationsPresent) {
          result.issues.push("no citations [n] found in response");
        }
      }
    )
  );

  // Prompt 3: Postgres hosting
  const sess3 = `eval-p3-${randomUUID().slice(0, 8)}`;
  results.push(
    await runEval(
      "Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?",
      sess3,
      (events, result) => {
        const hasAnchors = result.stats.eventOrder.includes("anchors");
        if (!hasAnchors) result.issues.push("no anchors event emitted");
        if (result.stats.searches === 0) {
          result.issues.push("no searches performed");
        }
        if (!result.stats.citationsPresent) {
          result.issues.push("no citations [n] found in response");
        }
      }
    )
  );

  // Print results table
  console.log("\n" + "=".repeat(72));
  console.log("EVAL RESULTS");
  console.log("=".repeat(72));

  const header = [
    "Prompt".padEnd(30),
    "Pass".padEnd(6),
    "Searches".padEnd(10),
    "FirstTok".padEnd(10),
    "Total".padEnd(10),
    "Cited",
  ].join(" ");
  console.log(header);
  console.log("-".repeat(72));

  let allPassed = true;
  for (const r of results) {
    const pass = r.passed ? "✓" : "✗";
    const row = [
      r.prompt.padEnd(30),
      pass.padEnd(6),
      String(r.stats.searches).padEnd(10),
      `${r.stats.msToFirstToken}ms`.padEnd(10),
      `${r.stats.totalMs}ms`.padEnd(10),
      r.stats.citationsPresent ? "yes" : "no",
    ].join(" ");
    console.log(row);
    if (!r.passed) {
      allPassed = false;
      for (const issue of r.issues) {
        console.log(`  ✗ ${issue}`);
      }
    }
  }

  console.log("=".repeat(72));
  if (!allPassed) {
    console.error("EVAL FAILED");
    process.exit(1);
  } else {
    console.log("EVAL PASSED");
  }
}

main().catch((err) => {
  console.error("Eval error:", err);
  process.exit(1);
});

