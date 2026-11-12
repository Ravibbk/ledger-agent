// Authority tagging: classify search result domains as official / press / other.
// Heuristics: vendor's own domain with /pricing, /changelog, docs.*, blog.* = official.

export type AuthorityTag = "official" | "press" | "other";

// Press/review domains that are never the vendor's own site
const PRESS_DOMAINS = new Set([
  "techcrunch.com",
  "venturebeat.com",
  "theverge.com",
  "wired.com",
  "forbes.com",
  "bloomberg.com",
  "reuters.com",
  "businessinsider.com",
  "zdnet.com",
  "cnet.com",
  "pcmag.com",
  "g2.com",
  "capterra.com",
  "getapp.com",
  "trustpilot.com",
  "producthunt.com",
  "indiehackers.com",
  "ycombinator.com",
  "reddit.com",
  "medium.com",
  "substack.com",
]);

export function tagAuthority(url: string): AuthorityTag {
  let hostname: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname.toLowerCase();
    pathname = parsed.pathname.toLowerCase();
  } catch {
    return "other";
  }

  const bare = hostname.replace(/^www\./, "");

  if (PRESS_DOMAINS.has(bare)) return "press";

  // Subdomains that signal official content: docs.*, blog.*, support.*, help.*,
  // changelog.*, status.*, api.*
  const officialSubdomainPrefixes = [
    "docs.",
    "blog.",
    "support.",
    "help.",
    "changelog.",
    "status.",
    "api.",
    "developer.",
    "developers.",
  ];
  for (const prefix of officialSubdomainPrefixes) {
    if (hostname.startsWith(prefix)) return "official";
  }

  // Official URL paths: /pricing, /changelog, /docs, /releases
  const officialPaths = [
    "/pricing",
    "/changelog",
    "/docs",
    "/releases",
    "/blog",
    "/news",
    "/announcements",
    "/release-notes",
    "/whats-new",
  ];
  for (const p of officialPaths) {
    if (pathname.startsWith(p)) return "official";
  }

  // If nothing else matches, treat as other (could still be vendor's main domain
  // but we can't know without a vendor list)
  return "other";
}
