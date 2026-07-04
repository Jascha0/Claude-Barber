/**
 * Salon-facing API tests — parameterized over every salon in tests/salons.js.
 *
 * These mirror the manual checks run against production: data loads, the
 * availability engine behaves, and Pass-1 booking validations reject bad input.
 * Everything is derived from each salon's own API, so the suite scales to new
 * shops without edits.
 */

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./helpers");
const SALONS = require("./salons");

for (const salon of SALONS) {
  describe(`Salon: ${salon.name}`, () => {
    const host = salon.host;
    let salonData;   // { name, hours, ... }
    let services;    // active services
    let firstService;

    before(async () => {
      const s = await H.getSalon(host);
      assert.equal(s.status, 200, `GET /api/salon should return 200 (got ${s.status}). Is the salon "${salon.name}" seeded and active?`);
      salonData = s.body;

      const sv = await H.getServices(host);
      assert.equal(sv.status, 200, "GET /api/services should return 200");
      services = (sv.body || []).filter((x) => x.active);
      firstService = services[0];
      assert.ok(firstService, "salon must have at least one active service");
    });

    test("salon info exposes name and opening hours", () => {
      assert.ok(salonData.name, "salon has a name");
      assert.equal(typeof salonData.hours, "object", "salon exposes an hours object");
    });

    test("services have valid id, price and duration", () => {
      for (const svc of services) {
        assert.ok(Number.isInteger(svc.id) && svc.id > 0, "service id is a positive int");
        assert.ok(svc.price >= 0, "service price is non-negative");
        assert.ok(svc.duration >= 5, "service duration is at least 5 min");
      }
    });

    test("slots endpoint returns an array on an open day", async () => {
      const openDow = H.firstOpenDow(salonData.hours);
      assert.notEqual(openDow, null, "salon should be open at least one day");
      const date = H.nextDateForDow(openDow);
      const r = await H.getSlots(host, { date, serviceId: firstService.id, staffId: 0 });
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body), "slots response is an array");
    });

    test("slots endpoint rejects an unknown staff member (400)", async () => {
      const openDow = H.firstOpenDow(salonData.hours);
      const date = H.nextDateForDow(openDow);
      const r = await H.getSlots(host, { date, serviceId: firstService.id, staffId: 999999 });
      assert.equal(r.status, 400, "unknown staffId must be rejected");
    });

    // ── Pass-1 booking validations ────────────────────────────────────────────

    test("booking in the past is rejected (400)", async () => {
      const r = await H.postBooking(host, {
        serviceId: firstService.id, staffId: 0,
        date: "2020-01-01", timeSlot: "10:00",
        customerName: "TEST_SUITE", customerPhone: H.uniquePhone(),
      });
      assert.equal(r.status, 400);
    });

    test("booking on a closed day is rejected (400)", async (t) => {
      const closedDow = H.firstClosedDow(salonData.hours);
      if (closedDow === null) return t.skip("salon is open every day — no closed day to test");
      const date = H.nextDateForDow(closedDow);
      const r = await H.postBooking(host, {
        serviceId: firstService.id, staffId: 0,
        date, timeSlot: "10:00",
        customerName: "TEST_SUITE", customerPhone: H.uniquePhone(),
      });
      assert.equal(r.status, 400);
    });

    test("booking before opening time is rejected (400)", async (t) => {
      const openDow = H.firstOpenDow(salonData.hours);
      const [open] = salonData.hours[openDow];
      const beforeOpenMin = Math.round(open * 60) - 30;
      if (beforeOpenMin < 0) return t.skip("opens at 00:00 — nothing before it");
      const date = H.nextDateForDow(openDow);
      const r = await H.postBooking(host, {
        serviceId: firstService.id, staffId: 0,
        date, timeSlot: H.decimalToTime(beforeOpenMin / 60),
        customerName: "TEST_SUITE", customerPhone: H.uniquePhone(),
      });
      assert.equal(r.status, 400, "slot before opening must be rejected");
    });

    // ── Happy path: book a real slot, then cancel it via its token ─────────────

    test("valid booking succeeds and can be self-cancelled", async (t) => {
      const openDow = H.firstOpenDow(salonData.hours);
      const date = H.nextDateForDow(openDow, 5); // far enough out to be free
      const slots = await H.getSlots(host, { date, serviceId: firstService.id, staffId: 0 });
      const free = (slots.body || []).find((s) => s.available);
      if (!free) return t.skip("no free slot available to test a booking");

      const created = await H.postBooking(host, {
        serviceId: firstService.id, staffId: 0,
        date, timeSlot: free.time,
        customerName: "TEST_SUITE", customerPhone: H.uniquePhone(),
      });
      assert.equal(created.status, 201, "valid booking should return 201");
      const token = created.body?.booking?.cancellation_token;
      assert.ok(token, "booking returns a cancellation token");

      // Cancel it again so the suite leaves no confirmed rows behind.
      const cancelled = await H.postCancel(token);
      assert.equal(cancelled.status, 200, "self-cancellation should succeed");
    });
  });
}
