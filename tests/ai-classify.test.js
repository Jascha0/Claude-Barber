/**
 * Message-classification unit tests — the keyword fallback in server/ai.js.
 *
 * Deliberately clears ANTHROPIC_API_KEY before requiring the module so this
 * test always exercises the deterministic keyword path, never a real (paid)
 * API call, regardless of what's in the local .env.
 */

delete process.env.ANTHROPIC_API_KEY;

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyIntent } = require("../server/ai");

test("booking-intent phrases classify as 'book'", async () => {
  assert.equal(await classifyIntent("Ich möchte gerne einen Termin buchen"), "book");
  assert.equal(await classifyIntent("Habt ihr diese Woche noch was frei?"), "book");
  assert.equal(await classifyIntent("Ich würde gerne einen Termin reservieren"), "book");
});

test("cancellation-intent phrases classify as 'cancel'", async () => {
  assert.equal(await classifyIntent("Ich muss meinen Termin leider absagen"), "cancel");
  assert.equal(await classifyIntent("Kann ich stornieren?"), "cancel");
  assert.equal(await classifyIntent("Ich kann leider nicht kommen"), "cancel");
});

test("neutral/unrelated phrases classify as 'other'", async () => {
  assert.equal(await classifyIntent("Wie sind eure Öffnungszeiten?"), "other");
  assert.equal(await classifyIntent("Was kostet ein Herrenhaarschnitt?"), "other");
});

test("keyword fallback never returns 'private' (only the AI path can)", async () => {
  assert.equal(await classifyIntent("Hey, wie geht's dir heute?"), "other");
});
