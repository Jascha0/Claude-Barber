/**
 * Incoming WhatsApp message pipeline (POST /api/webhook/whatsapp).
 *
 * Not tenant-scoped by Host header — the route resolves the salon itself by
 * looking up which salon owns the `phone_number_id` Meta sent the message to
 * (server/index.js mounts this route without the `tenant` middleware).
 *
 * Runs only when META_APP_SECRET is set (it is in CI); skipped otherwise, same
 * as the existing verify-token test in webhook.test.js.
 *
 * ANTHROPIC_API_KEY is cleared before requiring anything, so classification
 * always takes the deterministic keyword path — no real API call, no cost,
 * regardless of what's in a local .env.
 */

delete process.env.ANTHROPIC_API_KEY;

require("dotenv").config({ quiet: true });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const H = require("./helpers");
const { createThrowawaySalon, teardownSalon } = require("./fixtures");

const SECRET = process.env.META_APP_SECRET;
const ctx = {};

before(async () => {
  if (!SECRET) return;
  ctx.recipientId = `pnid-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  ctx.salon = await createThrowawaySalon("wh", {
    prefix: "webhook",
    extraSettings: { meta_phone_number_id: ctx.recipientId },
  });
});

after(async () => {
  await teardownSalon(ctx.salon?.salonId);
  await pool.end();
});

function metaPayload({ from, text, recipientId }) {
  return {
    entry: [{
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: recipientId },
          messages: [{ type: "text", from, text: { body: text } }],
        },
      }],
    }],
  };
}

test("POST without a signature is rejected (403)", async (t) => {
  if (!SECRET) return t.skip("META_APP_SECRET not set");
  const rawBody = JSON.stringify(metaPayload({ from: "+491701112222", text: "hi", recipientId: ctx.recipientId }));
  const r = await H.request("/api/webhook/whatsapp", { method: "POST", rawBody });
  assert.equal(r.status, 403);
});

test("POST with a wrong signature is rejected (403)", async (t) => {
  if (!SECRET) return t.skip("META_APP_SECRET not set");
  const rawBody = JSON.stringify(metaPayload({ from: "+491701112222", text: "hi", recipientId: ctx.recipientId }));
  const r = await H.request("/api/webhook/whatsapp", {
    method: "POST", rawBody,
    headers: { "x-hub-signature-256": "sha256=deadbeef" },
  });
  assert.equal(r.status, 403);
});

test("a validly signed booking-intent message is classified and stored", async (t) => {
  if (!SECRET) return t.skip("META_APP_SECRET not set");
  const fromPhone = "+4917012345" + String(Date.now()).slice(-4);
  const rawBody = JSON.stringify(metaPayload({
    from: fromPhone, text: "Ich möchte gerne einen Termin buchen", recipientId: ctx.recipientId,
  }));
  const signature = H.computeMetaSignature(SECRET, rawBody);

  const r = await H.request("/api/webhook/whatsapp", {
    method: "POST", rawBody,
    headers: { "x-hub-signature-256": signature },
  });
  assert.equal(r.status, 200, "webhook must always ack 200 immediately, before async processing");

  // The handler responds before it finishes writing to the DB — poll briefly.
  const row = await H.waitFor(async () => {
    const [[m]] = await pool.execute(
      "SELECT * FROM whatsapp_messages WHERE salon_id = ? AND from_phone = ?",
      [ctx.salon.salonId, fromPhone]
    );
    return m || null;
  });
  assert.equal(row.intent, "book");
  assert.equal(row.message_text, "Ich möchte gerne einen Termin buchen");
});

test("a message for an unknown phone_number_id is acked but not stored", async (t) => {
  if (!SECRET) return t.skip("META_APP_SECRET not set");
  const fromPhone = "+4917099988" + String(Date.now()).slice(-3);
  const rawBody = JSON.stringify(metaPayload({
    from: fromPhone, text: "Hallo", recipientId: "unknown-pnid-does-not-exist",
  }));
  const signature = H.computeMetaSignature(SECRET, rawBody);

  const r = await H.request("/api/webhook/whatsapp", {
    method: "POST", rawBody,
    headers: { "x-hub-signature-256": signature },
  });
  assert.equal(r.status, 200);

  // No salon owns this recipient id, so nothing should ever be written for this phone.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const [[m]] = await pool.execute("SELECT * FROM whatsapp_messages WHERE from_phone = ?", [fromPhone]);
  assert.equal(m, undefined, "message for an unrecognized recipient must not be stored");
});
