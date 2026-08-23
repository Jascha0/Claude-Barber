/**
 * Onboarding test — a salon created via the superadmin API must be immediately
 * usable: it comes with services, staff, and bookable slots out of the box.
 *
 * Creation goes through the real HTTP API; teardown talks to the DB directly.
 * Runs when SUPER_ADMIN_PASSWORD is set (it is in CI); skipped otherwise.
 */

require("dotenv").config({ quiet: true });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const H = require("./helpers");
const { teardownSalon } = require("./fixtures");

const SUPER = process.env.SUPER_ADMIN_PASSWORD;
const SUFFIX = process.env.TEST_HOST_SUFFIX || "test";

const ctx = {};

before(async () => {
  if (!SUPER) return; // the tests below skip individually
  const superToken = await H.superLogin(SUPER);
  assert.ok(superToken, "superadmin login should succeed");

  const slug = `onb-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const created = await H.request("/api/superadmin/salons", {
    method: "POST",
    superToken,
    body: { name: `Onboarding ${slug}`, slug, adminPassword: "onboard-pw" },
  });
  assert.equal(created.status, 201, "salon creation should return 201");

  ctx.salonId = created.body.id;
  ctx.host = `${slug}.${SUFFIX}`;
});

after(async () => {
  await teardownSalon(ctx.salonId);
  await pool.end();
});

test("a new salon starts with services", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const r = await H.getServices(ctx.host);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body) && r.body.length > 0, "new salon has default services");
});

test("a new salon starts with staff", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const r = await H.getStaff(ctx.host);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body) && r.body.length > 0, "new salon has default staff");
});

test("a new salon is immediately bookable (has free slots)", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const salon = await H.getSalon(ctx.host);
  assert.equal(salon.status, 200);
  const services = (await H.getServices(ctx.host)).body;
  const openDow = H.firstOpenDow(salon.body.hours);
  assert.notEqual(openDow, null, "salon should be open at least one day");
  const date = H.nextDateForDow(openDow);

  const slots = await H.getSlots(ctx.host, { date, serviceId: services[0].id, staffId: 0 });
  assert.equal(slots.status, 200);
  assert.ok((slots.body || []).some((s) => s.available), "new salon has at least one free slot");
});
