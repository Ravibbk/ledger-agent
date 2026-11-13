// Unit tests for speechText.ts – citation stripping, markdown cleaning, sentence chunking.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanSpeechText, chunkSentences } from "../web/src/lib/speechText.ts";

describe("cleanSpeechText", () => {
  it("strips citations like [1] and [23]", () => {
    const raw = "Salesforce updated pricing [1] and HubSpot added a new tier [23].";
    const cleaned = cleanSpeechText(raw);
    assert.equal(cleaned, "Salesforce updated pricing and HubSpot added a new tier.");
  });

  it("strips URLs", () => {
    const raw = "See pricing at https://salesforce.com/pricing for details.";
    const cleaned = cleanSpeechText(raw);
    assert.equal(cleaned, "See pricing at for details.");
  });

  it("converts arrows -> and → to 'to'", () => {
    const raw = "Price went from $20 -> $25 and standard → pro.";
    const cleaned = cleanSpeechText(raw);
    assert.equal(cleaned, "Price went from $20 to $25 and standard to pro.");
  });

  it("strips markdown formatting", () => {
    const raw = "### Highlights\n**Salesforce** increased `Starter` price to _$30_.";
    const cleaned = cleanSpeechText(raw);
    assert.equal(cleaned, "Highlights Salesforce increased Starter price to $30.");
  });

  it("collapses list items into sentences", () => {
    const raw = "Here are the changes:\n1. Salesforce raised pricing.\n2. HubSpot added AI.\n- Zoho remained unchanged.";
    const cleaned = cleanSpeechText(raw);
    assert.equal(cleaned, "Here are the changes: Salesforce raised pricing. HubSpot added AI. Zoho remained unchanged.");
  });
});

describe("chunkSentences", () => {
  it("splits long text into sentence-bounded chunks under the limit", () => {
    const longText =
      "First sentence is clear and explains the CRM options. Second sentence gives pricing details for a 20-person team. Third sentence warns that enterprise tiers require an annual commitment. Fourth sentence confirms that no other changes were detected.";
    const chunks = chunkSentences(longText, 100);

    assert.ok(chunks.length > 1, "should have split into multiple chunks");
    for (const chunk of chunks) {
      assert.ok(chunk.length <= 100, `chunk exceeds limit: ${chunk}`);
    }
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(chunkSentences(""), []);
  });
});

