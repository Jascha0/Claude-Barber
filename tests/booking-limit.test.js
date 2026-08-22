/**
 * Per-customer active-booking limit (bookings.js:110-122, default 3).
 *
 * Books up to the default limit for one phone number, then proves the next
 * booking is rejected with 409 — and that a different phone number is
 * unaffected (the limit is per-customer, not a salon-wide cap).
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");
const SALONS = require("./salons");

const host = SALONS[0].host;
const LIMIT = 3; // default from bookings.js when no `max_bookings_per_customer` setting exists

describe("Per-customer booking limit", () => {
  let firstService;
  let openDow;
  let date;
  let freeSlots;
  const createdTokens = []; // cancelled in after(), regardless of which assertion fails

  before(async () => {
    const salon = await H.getSalon(host);
    assert.equal(salon.status, 200);
    openDow = H.firstOpenDow(salon.body.hours);
    assert.notEqual(openDow, null, "salon should be open at least one day");
    date = H.nextDateForDow(openDow, 9); // far enough out to avoid colliding with other suites' bookings

    const services = (await H.getServices(host)).body.filter((s) => s.active);
    firstService = services[0];
    assert.ok(firstService, "salon must have at least one active service");

    const slots = await H.getSlots(host, { date, serviceId: firstService.id, staffId: 0 });
    freeSlots = (slots.body || []).filter((s) => s.available);
  });

  after(async () => {
    for (const token of createdTokens) {
      await H.postCancel(token);
    }
  });

  test(`the (${LIMIT + 1})th active booking for one phone number is rejected (409)`, async (t) => {
    if (freeSlots.length < LIMIT + 1) {
      return t.skip(`need ${LIMIT + 1} free slots on ${date}, only ${freeSlots.length} available`);
    }
    const phone = H.uniquePhone();

    for (let i = 0; i < LIMIT; i++) {
      const r = await H.postBooking(host, {
        serviceId: firstService.id, staffId: 0,
        date, timeSlot: freeSlots[i].time,
        customerName: "LIMIT_TEST", customerPhone: phone,
      });
      assert.equal(r.status, 201, `booking ${i + 1}/${LIMIT} should succeed`);
      createdTokens.push(r.body.booking.cancellation_token);
    }

    const over = await H.postBooking(host, {
      serviceId: firstService.id, staffId: 0,
      date, timeSlot: freeSlots[LIMIT].time,
      customerName: "LIMIT_TEST", customerPhone: phone,
    });
    assert.equal(over.status, 409, "booking beyond the limit must be rejected");
    assert.match(over.body.error, new RegExp(`${LIMIT}`), "error message should mention the limit");
  });

  test("a different phone number is not affected by another customer's limit", async (t) => {
    if (freeSlots.length < LIMIT + 2) {
      return t.skip(`need ${LIMIT + 2} free slots on ${date}, only ${freeSlots.length} available`);
    }
    // Slot LIMIT+1 (index) is free because the previous test only used slots 0..LIMIT.
    const r = await H.postBooking(host, {
      serviceId: firstService.id, staffId: 0,
      date, timeSlot: freeSlots[LIMIT + 1].time,
      customerName: "LIMIT_TEST_OTHER", customerPhone: H.uniquePhone(),
    });
    assert.equal(r.status, 201, "a different customer must still be able to book");
    createdTokens.push(r.body.booking.cancellation_token);
  });
});
