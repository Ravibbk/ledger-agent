// Unit tests for citations.ts – parsing citations and linking sources safely.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCitationSegments } from "../web/src/lib/citations.ts";

describe("parseCitationSegments", () => {
  it("splits text into text segments and citation segments", () => {
    const text = "Salesforce raised prices [1], while Zoho did not [2].";
    const sources = [
      { index: 1, url: "https://salesforce.com/pricing", title: "Salesforce Pricing" },
      { index: 2, url: "https://zoho.com/pricing", title: "Zoho Pricing" },
    ];

    const segments = parseCitationSegments(text, sources);
    assert.equal(segments.length, 5);

    assert.equal(segments[0]?.type, "text");
    assert.equal(segments[0]?.value, "Salesforce raised prices ");

    assert.equal(segments[1]?.type, "citation");
    assert.equal(segments[1]?.index, 1);
    assert.equal(segments[1]?.source?.url, "https://salesforce.com/pricing");

    assert.equal(segments[2]?.type, "text");
    assert.equal(segments[2]?.value, ", while Zoho did not ");

    assert.equal(segments[3]?.type, "citation");
    assert.equal(segments[3]?.index, 2);
    assert.equal(segments[3]?.source?.url, "https://zoho.com/pricing");

    assert.equal(segments[4]?.type, "text");
    assert.equal(segments[4]?.value, ".");
  });

  it("handles text with no citations", () => {
    const text = "No citations here.";
    const segments = parseCitationSegments(text);
    assert.equal(segments.length, 1);
    assert.equal(segments[0]?.type, "text");
    assert.equal(segments[0]?.value, text);
  });

  it("handles citation with no matching source gracefully", () => {
    const text = "Unlinked [99].";
    const segments = parseCitationSegments(text, []);
    assert.equal(segments.length, 3);
    assert.equal(segments[1]?.type, "citation");
    assert.equal(segments[1]?.index, 99);
    assert.equal(segments[1]?.source, undefined);
  });
});
