/**
 * Admin CRUD surface (server/routes/admin.js) — staff, services, blocked
 * slots, hours, salon settings and password change. Uses its own throwaway
 * salon so it never touches the demo salon's real-looking data.
 *
 * Also covers the fixed FK-conflict bug: deleting a staff member or service
 * that still has bookings now returns a clean 409 instead of an uncaught 500.
 */

require("dotenv").config({ quiet: true });
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const H = require("./helpers");
const { createThrowawaySalon, teardownSalon } = require("./fixtures");

const PW = "admin-crud-test-pw";
const ctx = {};

before(async () => {
  ctx.salon = await createThrowawaySalon("crud", { prefix: "admincrud", password: PW });
  const login = await H.request("/api/admin/login", { method: "POST", host: ctx.salon.host, body: { password: PW } });
  assert.equal(login.status, 200, "admin login should succeed");
  ctx.token = login.body.token;
});

after(async () => {
  await teardownSalon(ctx.salon?.salonId);
  await pool.end();
});

function req(path, opts = {}) {
  return H.request(path, { host: ctx.salon.host, token: ctx.token, ...opts });
}

describe("Staff CRUD", () => {
  test("create staff (201) and read it back", async () => {
    const created = await req("/api/admin/staff", { method: "POST", body: { name: "New Barber" } });
    assert.equal(created.status, 201);
    ctx.plainStaffId = created.body.id;

    const list = await req("/api/admin/staff");
    assert.ok(list.body.some((s) => s.id === ctx.plainStaffId));
  });

  test("creating staff with a too-long name is rejected (400)", async () => {
    const r = await req("/api/admin/staff", { method: "POST", body: { name: "x".repeat(101) } });
    assert.equal(r.status, 400);
  });

  test("deleting a staff member with an existing booking is rejected (409), not a raw 500", async () => {
    const created = await req("/api/admin/staff", { method: "POST", body: { name: "Booked Barber" } });
    assert.equal(created.status, 201);
    const staffId = created.body.id;

    await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token) VALUES (?,?,?,?,?,?,?,?)",
      [ctx.salon.salonId, ctx.salon.serviceId, staffId, "2099-06-15", "10:00", "Blocker", "+491700009001", "crud-staff-block-" + Date.now()]
    );

    const del = await req(`/api/admin/staff/${staffId}`, { method: "DELETE" });
    assert.equal(del.status, 409, "must not 500 when the staff member still has bookings");
    assert.ok(del.body.error, "should return a readable error message");

    await pool.execute("DELETE FROM bookings WHERE salon_id = ? AND staff_id = ?", [ctx.salon.salonId, staffId]);
    const del2 = await req(`/api/admin/staff/${staffId}`, { method: "DELETE" });
    assert.equal(del2.status, 200, "deletable once the blocking booking is gone");
  });

  test("delete staff with no bookings (200)", async () => {
    const del = await req(`/api/admin/staff/${ctx.plainStaffId}`, { method: "DELETE" });
    assert.equal(del.status, 200);
  });
});

describe("Service CRUD", () => {
  test("create service (201) and read it back", async () => {
    const created = await req("/api/admin/services", { method: "POST", body: { name: "Beard Trim", price: 15, duration: 20 } });
    assert.equal(created.status, 201);
    ctx.plainServiceId = created.body.id;

    const list = await req("/api/admin/services");
    assert.ok(list.body.some((s) => s.id === ctx.plainServiceId));
  });

  test("creating a service with a negative price is rejected (400)", async () => {
    const r = await req("/api/admin/services", { method: "POST", body: { name: "Bad Service", price: -5, duration: 20 } });
    assert.equal(r.status, 400);
  });

  test("deleting a service with an existing booking is rejected (409), not a raw 500", async () => {
    const created = await req("/api/admin/services", { method: "POST", body: { name: "Booked Service", price: 10, duration: 15 } });
    assert.equal(created.status, 201);
    const serviceId = created.body.id;

    await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token) VALUES (?,?,?,?,?,?,?,?)",
      [ctx.salon.salonId, serviceId, ctx.salon.staffId, "2099-06-16", "10:00", "Blocker", "+491700009002", "crud-svc-block-" + Date.now()]
    );

    const del = await req(`/api/admin/services/${serviceId}`, { method: "DELETE" });
    assert.equal(del.status, 409, "must not 500 when the service still has bookings");

    await pool.execute("DELETE FROM bookings WHERE salon_id = ? AND service_id = ?", [ctx.salon.salonId, serviceId]);
    const del2 = await req(`/api/admin/services/${serviceId}`, { method: "DELETE" });
    assert.equal(del2.status, 200);
  });

  test("delete service with no bookings (200)", async () => {
    const del = await req(`/api/admin/services/${ctx.plainServiceId}`, { method: "DELETE" });
    assert.equal(del.status, 200);
  });
});

describe("Blocked slots", () => {
  const date = "2099-07-01";
  const timeSlot = "09:00";

  test("create then read a blocked slot", async () => {
    const created = await req("/api/admin/blocked-slots", {
      method: "POST", body: { staffId: ctx.salon.staffId, date, timeSlot, reason: "Urlaub" },
    });
    assert.equal(created.status, 201);

    const list = await req(`/api/admin/blocked-slots?date=${date}`);
    assert.ok(list.body.some((b) => b.time_slot.startsWith(timeSlot) && b.staff_id === ctx.salon.staffId));
  });

  test("delete the blocked slot", async () => {
    const del = await req("/api/admin/blocked-slots", { method: "DELETE", body: { staffId: ctx.salon.staffId, date, timeSlot } });
    assert.equal(del.status, 200);

    const list = await req(`/api/admin/blocked-slots?date=${date}`);
    assert.ok(!list.body.some((b) => b.time_slot.startsWith(timeSlot) && b.staff_id === ctx.salon.staffId));
  });
});

describe("Hours", () => {
  test("PATCH then GET round-trips the opening hours", async () => {
    const newHours = { 0: [9, 18], 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: null, 6: null };
    const patch = await req("/api/admin/hours", { method: "PATCH", body: newHours });
    assert.equal(patch.status, 200);

    const got = await req("/api/admin/hours");
    assert.equal(got.status, 200);
    assert.deepEqual(got.body["0"], [9, 18]);
  });
});

describe("Salon settings", () => {
  test("PATCH then GET round-trips salon name", async () => {
    const patch = await req("/api/admin/salon", { method: "PATCH", body: { name: "Renamed Salon" } });
    assert.equal(patch.status, 200);

    const got = await req("/api/admin/salon");
    assert.equal(got.status, 200);
    assert.equal(got.body.name, "Renamed Salon");
  });

  test("PATCH with a non-HTTPS image URL is rejected (400)", async () => {
    const r = await req("/api/admin/salon", { method: "PATCH", body: { hero_img_url: "http://insecure.example.com/x.jpg" } });
    assert.equal(r.status, 400);
  });
});

describe("Password change", () => {
  test("new password works, old one no longer does", async () => {
    const newPw = "brand-new-pw-123456";
    const patch = await req("/api/admin/password", { method: "PATCH", body: { newPassword: newPw } });
    assert.equal(patch.status, 200);

    const oldLogin = await H.request("/api/admin/login", { method: "POST", host: ctx.salon.host, body: { password: PW } });
    assert.equal(oldLogin.status, 401, "old password must be rejected after change");

    const newLogin = await H.request("/api/admin/login", { method: "POST", host: ctx.salon.host, body: { password: newPw } });
    assert.equal(newLogin.status, 200, "new password must work");
  });
});
