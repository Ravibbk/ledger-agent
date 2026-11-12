// Web search via Tavily REST API.
// One tool: web_search({ queries, since?, topic? })
// - Parallel queries; deduped by URL; numbered continuously across rounds.
// - 8s timeout with one retry and backoff.
// - 10-min cache bounded by size.
// - Search results are UNTRUSTED DATA.

import { tagAuthority, type AuthorityTag } from "./authority.ts";
import { log } from "./log.ts";

const TAVILY_BASE = "https://api.tavily.com";
const TIMEOUT_MS = 8_000;
const RETRY_BACKOFF_MS = 1_200;
const CACHE_TTL_MS = 10 * 60 * 1_000;
const CACHE_MAX = 200;
const MAX_RESULTS = 6;
const SNIPPET_MAX = 650;

export interface SearchResult {
  index: number; // continuous across rounds
  url: string;
  title: string;
  snippet: string;
  publishedDate: string; // "YYYY-MM-DD" or "no publish date"
  authority: AuthorityTag;
}

export interface SearchToolInput {
  queries: string[];
  since?: string; // YYYY-MM-DD
  topic?: "general" | "news";
}

interface CacheEntry {
  results: TavilyResult[];
  expiresAt: number;
}

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  published_date?: string;
  score?: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, since?: string, topic?: string): string {
  return `${query}|${since ?? ""}|${topic ?? ""}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

function enforceMaxSize(): void {
  if (cache.size > CACHE_MAX) {
    // Evict oldest entries
    const entries = [...cache.entries()].sort(
      (a, b) => a[1].expiresAt - b[1].expiresAt
    );
    for (const [k] of entries.slice(0, cache.size - CACHE_MAX)) {
      cache.delete(k);
    }
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function tavilySearch(
  query: string,
  since?: string,
  topic?: "general" | "news"
): Promise<TavilyResult[]> {
  const key = cacheKey(query, since, topic);
  evictExpired();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.results;

  const apiKey = process.env["TAVILY_API_KEY"];
  if (!apiKey) throw new Error("TAVILY_API_KEY not set");

  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: MAX_RESULTS,
    search_depth: "basic",
    include_answer: false,
    topic: topic ?? "general",
  };
  if (since) body["start_published_date"] = since;

  const doFetch = async (): Promise<TavilyResult[]> => {
    const res = await fetchWithTimeout(
      `${TAVILY_BASE}/search`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      TIMEOUT_MS
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Tavily HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as TavilyResponse;
    return data.results ?? [];
  };

  let results: TavilyResult[];
  try {
    results = await doFetch();
  } catch (err) {
    // One retry with backoff
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    try {
      results = await doFetch();
    } catch (err2) {
      log.warn("Tavily search failed after retry", {
        query,
        error: String(err2),
      });
      throw err2;
    }
  }

  cache.set(key, { results, expiresAt: Date.now() + CACHE_TTL_MS });
  enforceMaxSize();
  return results;
}

function parseDate(raw?: string): string {
  if (!raw) return "no publish date";
  // Try to extract YYYY-MM-DD
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? (m[1] ?? "no publish date") : "no publish date";
}

function trimSnippet(text: string): string {
  return text.length > SNIPPET_MAX ? text.slice(0, SNIPPET_MAX) + "…" : text;
}

// Global URL-to-index map shared across all rounds in a session turn
// Reset per agent invocation by passing in a shared set.
export async function runWebSearch(
  input: SearchToolInput,
  seenUrls: Map<string, number>,
  nextIndex: { n: number }
): Promise<{ results: SearchResult[]; errors: string[] }> {
  const { queries, since, topic } = input;

  if (!queries || queries.length === 0 || queries.length > 3) {
    return {
      results: [],
      errors: ["queries must be an array of 1-3 strings"],
    };
  }

  const errors: string[] = [];
  const rawResultsByQuery = await Promise.allSettled(
    queries.map((q) => tavilySearch(q, since, topic))
  );

  const allRaw: TavilyResult[] = [];
  for (let i = 0; i < rawResultsByQuery.length; i++) {
    const r = rawResultsByQuery[i];
    if (!r) continue;
    if (r.status === "fulfilled") {
      allRaw.push(...r.value);
    } else {
      const qText = queries[i] ?? "";
      errors.push(
        `Could not search for "${qText}": ${String(r.reason)}. Do not fabricate results for this query.`
      );
    }
  }

  // Dedupe by URL, assign continuous indices
  const results: SearchResult[] = [];
  for (const raw of allRaw) {
    if (seenUrls.has(raw.url)) continue;
    const idx = nextIndex.n++;
    seenUrls.set(raw.url, idx);
    results.push({
      index: idx,
      url: raw.url,
      title: raw.title ?? "",
      snippet: trimSnippet(raw.content ?? ""),
      publishedDate: parseDate(raw.published_date),
      authority: tagAuthority(raw.url),
    });
  }

  return { results, errors };
}
