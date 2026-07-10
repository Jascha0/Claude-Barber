/**
 * Superadmin session-auth tests.
 *
 * Verifies the Pass-3 hardening: the password is exchanged for a random session
 * token (the password itself is no longer a valid token), protected endpoints
 * require a live session, and logout invalidates it. Runs when
 * SUPER_ADMIN_PASSWORD is set (it is in CI).
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");

const SUPER = process.env.SUPER_ADMIN_PASSWORD;

test("wrong superadmin password is rejected (401)", async () => {
  const r = await H.request("/api/superadmin/login", { method: "POST", body: { password: "definitely-wrong" } });
  assert.equal(r.status, 401);
});

test("protected superadmin route requires a token (401)", async () => {
  const r = await H.request("/api/superadmin/salons");
  assert.equal(r.status, 401);
});

test("login yields a session token that is NOT the password", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const token = await H.superLogin(SUPER);
  assert.ok(token, "login returns a token");
  assert.notEqual(token, SUPER, "token must not equal the password");

  // The session token works…
  const ok = await H.request("/api/superadmin/salons", { superToken: token });
  assert.equal(ok.status, 200);

  // …but the raw password used as a token does not.
  const asPw = await H.request("/api/superadmin/salons", { superToken: SUPER });
  assert.equal(asPw.status, 401, "password must not be usable as a session token");
});

test("logout invalidates the session token", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const token = await H.superLogin(SUPER);

  const before = await H.request("/api/superadmin/salons", { superToken: token });
  assert.equal(before.status, 200, "token works before logout");

  await H.request("/api/superadmin/logout", { method: "POST", superToken: token });

  const after = await H.request("/api/superadmin/salons", { superToken: token });
  assert.equal(after.status, 401, "token rejected after logout");
});
