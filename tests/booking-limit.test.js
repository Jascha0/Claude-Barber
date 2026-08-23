/**
 * Per-customer active-booking limit (bookings.js:110-122, default 3).
 *
 * Books up to the default limit for one phone number, then proves the next
 * booking is rejected with 409 — and that a different phone number is
 * unaffected (the limit is per-customer, not a salon-wide cap).
 *
 * Uses its own throwaway salon rather than the shared demo salon: several
 * other test files resolve a booking date via `nextDateForDow`, which can
 * collapse to the *same* calendar date across files with different
 * `minAhead` values once they share the same first-open weekday. Consuming
 * several slots there caused real, intermittent collisions with
 * gdpr.test.js and salon-api.test.js in CI. A dedicated salon removes the
 * shared state entirely.
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const H = require("./helpers");
const { createThrowawaySalon, teardownSalon } = require("./fixtures");

const LIMIT = 3; // default from bookings.js when no `max_bookings_per_customer` setting exists
const DATE = "2099-09-01"; // far future, salon fixture is open every day 8-20

describe("Per-customer booking limit", () => {
  const ctx = {};

  before(async () => {
    ctx.salon = await createThrowawaySalon("limit", { prefix: "booklimit" });
  });

  after(async () => {
    await teardownSalon(ctx.salon?.salonId);
    await pool.end();
  });

  test(`the (${LIMIT + 1})th active booking for one phone number is rejected (409)`, async () => {
    const phone = H.uniquePhone();

    for (let i = 0; i < LIMIT; i++) {
      const timeSlot = `${String(9 + i).padStart(2, "0")}:00`;
      const r = await H.postBooking(ctx.salon.host, {
        serviceId: ctx.salon.serviceId, staffId: ctx.salon.staffId,
        date: DATE, timeSlot, customerName: "LIMIT_TEST", customerPhone: phone,
      });
      assert.equal(r.status, 201, `booking ${i + 1}/${LIMIT} should succeed`);
    }

    const over = await H.postBooking(ctx.salon.host, {
      serviceId: ctx.salon.serviceId, staffId: ctx.salon.staffId,
      date: DATE, timeSlot: `${String(9 + LIMIT).padStart(2, "0")}:00`,
      customerName: "LIMIT_TEST", customerPhone: phone,
    });
    assert.equal(over.status, 409, "booking beyond the limit must be rejected");
    assert.match(over.body.error, new RegExp(`${LIMIT}`), "error message should mention the limit");
  });

  test("a different phone number is not affected by another customer's limit", async () => {
    const r = await H.postBooking(ctx.salon.host, {
      serviceId: ctx.salon.serviceId, staffId: ctx.salon.staffId,
      date: DATE, timeSlot: "15:00", // untouched by the previous test's 09:00-12:00 slots
      customerName: "LIMIT_TEST_OTHER", customerPhone: H.uniquePhone(),
    });
    assert.equal(r.status, 201, "a different customer must still be able to book");
  });
});
