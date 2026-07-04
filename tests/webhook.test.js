/**
 * WhatsApp webhook tests — global (not tenant-scoped).
 *
 * Verifies the Meta webhook handshake: a correct verify token echoes the
 * challenge, a wrong one is rejected. The correct-token case only runs when
 * META_WEBHOOK_VERIFY_TOKEN is set (it is in CI).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { request } = require("./helpers");

test("webhook verification rejects a wrong verify token (403)", async () => {
  const r = await request(
    "/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=DEFINITELY_WRONG&hub.challenge=abc123"
  );
  assert.equal(r.status, 403);
});

test("webhook verification echoes challenge for the correct token", async (t) => {
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!token) return t.skip("META_WEBHOOK_VERIFY_TOKEN not set");
  const challenge = "challenge_" + Date.now();
  const r = await request(
    `/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${challenge}`
  );
  assert.equal(r.status, 200);
  assert.equal(r.raw, challenge, "must echo the exact challenge back to Meta");
});
