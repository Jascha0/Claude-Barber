/**
 * Tenant isolation tests — the application-layer stand-in for row-level security.
 *
 * MySQL has no RLS, so isolation is enforced by `WHERE salon_id = ?` in every
 * query. This suite actively proves that holds: it spins up two fresh salons
 * (A and B) directly in the DB, then asserts over HTTP that salon B can neither
 * read, modify, nor delete anything belonging to salon A — and that a session
 * token minted for one salon is worthless against the other.
 *
 * Setup/teardown talk to the DB directly (fast, deterministic); every assertion
 * goes through the real HTTP API, exactly as an attacker would.
 */

require("dotenv").config({ quiet: true }); // local: load .env; CI: vars already in env
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { pool } = require("../server/db");
const H = require("./helpers");

const SUFFIX = process.env.TEST_HOST_SUFFIX || "test";
const PW = "isolation-test-pw";
const OPEN_HOURS = JSON.stringify({ 0: [8, 20], 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [8, 20] });

const ctx = { a: {}, b: {} };

async function makeSalon(label) {
  const slug = `iso-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const [sr] = await pool.execute(
    "INSERT INTO salons (name, slug, active) VALUES (?,?,1)",
    [`Isolation ${label}`, slug]
  );
  const salonId = sr.insertId;
  const hash = await bcrypt.hash(PW, 12);
  await pool.execute(
    "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?),(?,?,?)",
    [salonId, "hours", OPEN_HOURS, salonId, "admin_password", hash]
  );
  const [svc] = await pool.execute(
    "INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)",
    [salonId, `Cut ${label}`, 25, 30]
  );
  const [stf] = await pool.execute(
    "INSERT INTO staff (salon_id, name) VALUES (?,?)",
    [salonId, `Barber ${label}`]
  );
  return { salonId, slug, host: `${slug}.${SUFFIX}`, serviceId: svc.insertId, staffId: stf.insertId };
}

async function login(host) {
  const r = await H.request("/api/admin/login", { method: "POST", host, body: { password: PW } });
  assert.equal(r.status, 200, `login should succeed for ${host}`);
  return r.body.token;
}

before(async () => {
  ctx.a = await makeSalon("a");
  ctx.b = await makeSalon("b");

  // A booking that belongs to salon A only.
  const future = new Date();
  future.setDate(future.getDate() + 10);
  const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
  const [bk] = await pool.execute(
    "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token) VALUES (?,?,?,?,?,?,?,?)",
    [ctx.a.salonId, ctx.a.serviceId, ctx.a.staffId, dateStr, "10:00", "Alice A", "+491700000123", "iso-token-" + Date.now()]
  );
  ctx.a.bookingId = bk.insertId;

  ctx.a.token = await login(ctx.a.host);
  ctx.b.token = await login(ctx.b.host);
});

after(async () => {
  for (const id of [ctx.a.salonId, ctx.b.salonId].filter(Boolean)) {
    // FK-safe deletion order
    await pool.execute("DELETE FROM sessions WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM bookings WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM blocked_slots WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM whatsapp_messages WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM settings WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM services WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM staff WHERE salon_id = ?", [id]);
    await pool.execute("DELETE FROM salons WHERE id = ?", [id]);
  }
  await pool.end();
});

// ── Positive control: A can see its own booking ───────────────────────────────
test("salon A sees its own booking (positive control)", async () => {
  const r = await H.request("/api/admin/bookings", { host: ctx.a.host, token: ctx.a.token });
  assert.equal(r.status, 200);
  assert.ok(r.body.some((x) => x.id === ctx.a.bookingId), "A must see its own booking");
});

// ── Read isolation ────────────────────────────────────────────────────────────
test("salon B cannot see salon A's bookings", async () => {
  const r = await H.request("/api/admin/bookings", { host: ctx.b.host, token: ctx.b.token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
  assert.ok(!r.body.some((x) => x.id === ctx.a.bookingId), "B must NOT see A's booking");
  assert.ok(r.body.every((x) => x.salon_id === ctx.b.salonId), "every row B sees belongs to B");
});

test("salon B cannot see salon A's services", async () => {
  const r = await H.request("/api/admin/services", { host: ctx.b.host, token: ctx.b.token });
  assert.equal(r.status, 200);
  assert.ok(!r.body.some((x) => x.id === ctx.a.serviceId), "B must NOT see A's service");
});

// ── Write isolation ───────────────────────────────────────────────────────────
test("salon B cannot modify salon A's booking (404)", async () => {
  const r = await H.request(`/api/admin/bookings/${ctx.a.bookingId}`, {
    method: "PATCH", host: ctx.b.host, token: ctx.b.token, body: { status: "cancelled" },
  });
  assert.equal(r.status, 404, "cross-tenant PATCH must 404");

  // And A's booking is untouched.
  const [[row]] = await pool.execute("SELECT status FROM bookings WHERE id = ?", [ctx.a.bookingId]);
  assert.equal(row.status, "confirmed", "A's booking must remain confirmed");
});

test("salon B cannot delete salon A's booking", async () => {
  await H.request(`/api/admin/bookings/${ctx.a.bookingId}`, {
    method: "DELETE", host: ctx.b.host, token: ctx.b.token,
  });
  const [[row]] = await pool.execute("SELECT status FROM bookings WHERE id = ?", [ctx.a.bookingId]);
  assert.equal(row.status, "confirmed", "A's booking must not be cancelled by B");
});

// ── Session-token isolation ───────────────────────────────────────────────────
test("salon A's token is rejected on salon B's host (401)", async () => {
  const r = await H.request("/api/admin/bookings", { host: ctx.b.host, token: ctx.a.token });
  assert.equal(r.status, 401, "a session is bound to the salon it was minted for");
});
