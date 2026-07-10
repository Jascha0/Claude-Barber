/**
 * GDPR data-subject endpoint tests (Art. 15 access / Art. 17 erasure).
 *
 * Books a slot with a known phone number, exports it via the superadmin
 * data-subject endpoint, erases it, and confirms it is gone. Runs only when
 * SUPER_ADMIN_PASSWORD is set (it is in CI); skipped otherwise.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");
const SALONS = require("./salons");

const SUPER = process.env.SUPER_ADMIN_PASSWORD;
const host = SALONS[0].host;

test("superadmin data-subject endpoint requires auth (401)", async (t) => {
  const r = await H.request("/api/superadmin/customer-data?phone=%2B491701234567");
  assert.equal(r.status, 401);
});

test("customer data can be exported and then erased", async (t) => {
  if (!SUPER) return t.skip("SUPER_ADMIN_PASSWORD not set");
  const superToken = await H.superLogin(SUPER);
  assert.ok(superToken, "superadmin login should succeed");

  // Arrange: create a booking with a unique phone.
  const salon = await H.getSalon(host);
  const services = (await H.getServices(host)).body.filter((s) => s.active);
  const openDow = H.firstOpenDow(salon.body.hours);
  const date = H.nextDateForDow(openDow, 6);
  const slots = await H.getSlots(host, { date, serviceId: services[0].id, staffId: 0 });
  const free = (slots.body || []).find((s) => s.available);
  if (!free) return t.skip("no free slot to seed test data");

  const phone = H.uniquePhone();
  const created = await H.postBooking(host, {
    serviceId: services[0].id, staffId: 0,
    date, timeSlot: free.time,
    customerName: "GDPR_TEST", customerPhone: phone,
  });
  assert.equal(created.status, 201);

  // Act 1: export → the booking shows up.
  const exp = await H.request(`/api/superadmin/customer-data?phone=${encodeURIComponent(phone)}`, { superToken });
  assert.equal(exp.status, 200);
  assert.ok(exp.body.bookings.some((b) => b.customer_phone === phone), "export contains the booking");

  // Act 2: erase.
  const del = await H.request(`/api/superadmin/customer-data?phone=${encodeURIComponent(phone)}`, { method: "DELETE", superToken });
  assert.equal(del.status, 200);
  assert.ok(del.body.anonymizedBookings >= 1, "at least one booking anonymized");

  // Assert: a second export no longer returns the phone.
  const exp2 = await H.request(`/api/superadmin/customer-data?phone=${encodeURIComponent(phone)}`, { superToken });
  assert.equal(exp2.body.bookings.length, 0, "erased data no longer retrievable by phone");
});
