// Unit tests for memory.ts – date anchoring, spoken dates, recall, session validation.
// Uses node:test built-in runner.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAnchors, validateSessionId, normalizeSpokenDates } from "../src/memory.ts";

// Test reference: now = 2026-11-12T03:22:12Z (which is 2026-11-12 08:52 IST, offset -330)
// IST = UTC+5:30, so tzOffset = -330 (Date.getTimezoneOffset() returns negative for east)
const NOW_ISO = "2026-11-12T03:22:12Z";
const NOW_MS = new Date(NOW_ISO).getTime();
const TZ_OFFSET = -330; // IST: UTC+5:30

describe("resolveAnchors", () => {
  it("resolves 'On Monday' to 2026-11-09", () => {
    const { anchors } = resolveAnchors("On Monday we shortlisted 5 CRM tools", NOW_MS, TZ_OFFSET);
    assert.ok(anchors.length > 0, "should have at least one anchor");
    const mon = anchors.find((a) => a.day === "2026-11-09");
    assert.ok(mon, `expected 2026-11-09, got: ${JSON.stringify(anchors)}`);
  });

  it("resolves 'on 3 November' to 2026-11-03", () => {
    const { anchors } = resolveAnchors("What did I ask you on 3 November?", NOW_MS, TZ_OFFSET);
    assert.ok(anchors.length > 0, "should have at least one anchor");
    const nov3 = anchors.find((a) => a.day === "2026-11-03");
    assert.ok(nov3, `expected 2026-11-03, got: ${JSON.stringify(anchors)}`);
  });

  it("resolves spoken 'third November' to 2026-11-03", () => {
    const { anchors } = resolveAnchors("What did I ask you on third November?", NOW_MS, TZ_OFFSET);
    assert.ok(anchors.length > 0, "should have at least one anchor");
    const nov3 = anchors.find((a) => a.day === "2026-11-03");
    assert.ok(nov3, `expected 2026-11-03, got: ${JSON.stringify(anchors)}`);
  });

  it("resolves spoken 'November 3rd' to 2026-11-03", () => {
    const { anchors } = resolveAnchors("What did I ask you on November 3rd?", NOW_MS, TZ_OFFSET);
    assert.ok(anchors.length > 0, "should have at least one anchor");
    const nov3 = anchors.find((a) => a.day === "2026-11-03");
    assert.ok(nov3, `expected 2026-11-03, got: ${JSON.stringify(anchors)}`);
  });

  it("resolves 'last Tuesday' to 2026-11-10 with fallback 2026-11-03", () => {
    const { anchors } = resolveAnchors("Last Tuesday I asked about Postgres hosting", NOW_MS, TZ_OFFSET);
    assert.ok(anchors.length > 0, "should have at least one anchor");
    const tue = anchors.find((a) => a.day === "2026-11-10");
    assert.ok(tue, `expected primary 2026-11-10, got: ${JSON.stringify(anchors)}`);
    assert.equal(tue?.fallback, "2026-11-03", `expected fallback 2026-11-03, got: ${tue?.fallback}`);
  });

  it("never returns future dates", () => {
    const { anchors } = resolveAnchors("on December 25", NOW_MS, TZ_OFFSET);
    for (const a of anchors) {
      const d = new Date(a.day + "T00:00:00Z");
      assert.ok(d.getTime() <= NOW_MS + 24 * 3600 * 1000, `future date: ${a.day}`);
    }
  });

  it("returns empty array for plain text with no date refs", () => {
    const { anchors } = resolveAnchors("What is 2 + 2?", NOW_MS, TZ_OFFSET);
    assert.equal(anchors.length, 0);
  });
});

describe("normalizeSpokenDates", () => {
  it("normalizes word ordinals to numeric ordinals", () => {
    assert.equal(normalizeSpokenDates("first of May"), "1st May");
    assert.equal(normalizeSpokenDates("third November"), "3rd November");
    assert.equal(normalizeSpokenDates("twenty first of October"), "21st October");
  });
});

describe("validateSessionId", () => {
  it("accepts valid alphanumeric IDs", () => {
    assert.ok(validateSessionId("abc123"));
    assert.ok(validateSessionId("session-id_01"));
    assert.ok(validateSessionId("A"));
    assert.ok(validateSessionId("a".repeat(64)));
  });

  it("rejects empty string", () => {
    assert.ok(!validateSessionId(""));
  });

  it("rejects IDs longer than 64 chars", () => {
    assert.ok(!validateSessionId("a".repeat(65)));
  });

  it("rejects IDs with special chars", () => {
    assert.ok(!validateSessionId("bad id!"));
    assert.ok(!validateSessionId("../traversal"));
    assert.ok(!validateSessionId("id with space"));
  });

  it("rejects non-strings", () => {
    assert.ok(!validateSessionId(null));
    assert.ok(!validateSessionId(42));
    assert.ok(!validateSessionId(undefined));
  });
});
