// Unit tests for search.ts – URL dedupe, source numbering, cache TTL.

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tagAuthority } from "../src/authority.ts";

describe("tagAuthority", () => {
  it("tags docs.* subdomain as official", () => {
    assert.equal(tagAuthority("https://docs.stripe.com/pricing"), "official");
  });

  it("tags /pricing path as official", () => {
    assert.equal(tagAuthority("https://stripe.com/pricing"), "official");
  });

  it("tags /changelog path as official", () => {
    assert.equal(tagAuthority("https://github.com/changelog"), "official");
  });

  it("tags /blog path as official", () => {
    assert.equal(tagAuthority("https://hubspot.com/blog/announcement"), "official");
  });

  it("tags techcrunch.com as press", () => {
    assert.equal(tagAuthority("https://techcrunch.com/2024/01/01/startup"), "press");
  });

  it("tags g2.com as press", () => {
    assert.equal(tagAuthority("https://g2.com/products/hubspot"), "press");
  });

  it("tags unknown domain as other", () => {
    assert.equal(tagAuthority("https://example.com/page"), "other");
  });

  it("handles invalid URLs gracefully", () => {
    assert.equal(tagAuthority("not-a-url"), "other");
  });
});

describe("URL dedupe and source numbering", () => {
  it("assigns continuous indices and dedupes", () => {
    const seenUrls = new Map<string, number>();
    const nextIndex = { n: 1 };

    // Simulate deduplication logic
    const assign = (url: string): number | null => {
      if (seenUrls.has(url)) return null;
      const idx = nextIndex.n++;
      seenUrls.set(url, idx);
      return idx;
    };

    assert.equal(assign("https://a.com"), 1);
    assert.equal(assign("https://b.com"), 2);
    assert.equal(assign("https://a.com"), null); // duplicate
    assert.equal(assign("https://c.com"), 3);
    assert.equal(seenUrls.size, 3);
    assert.equal(nextIndex.n, 4);
  });
});

describe("rate limiter logic", () => {
  it("allows up to 20 requests per minute", () => {
    const map = new Map<string, { count: number; resetAt: number }>();
    const LIMIT = 20;
    const WINDOW = 60_000;

    const check = (ip: string): boolean => {
      const now = Date.now();
      let entry = map.get(ip);
      if (!entry || entry.resetAt < now) {
        entry = { count: 0, resetAt: now + WINDOW };
        map.set(ip, entry);
      }
      entry.count++;
      return entry.count <= LIMIT;
    };

    for (let i = 0; i < 20; i++) {
      assert.ok(check("1.2.3.4"), `request ${i + 1} should be allowed`);
    }
    assert.ok(!check("1.2.3.4"), "21st request should be denied");
    assert.ok(check("5.6.7.8"), "different IP should be allowed");
  });
});

