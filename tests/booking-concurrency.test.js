/**
 * Double-booking / race-condition protection.
 *
 * The app-level availability check in bookings.js (SELECT-then-decide) is not
 * atomic by itself — two requests can both pass it before either INSERTs. The
 * real guard is the DB unique key `uq_staff_slot` (salon_id, staff_id, date,
 * time_slot); bookings.js:138-141 catches the resulting ER_DUP_ENTRY and
 * returns 409. This test fires two real concurrent requests at the exact
 * same slot and proves that guard actually holds under real parallelism —
 * not just that the code path exists.
 */

require("dotenv").config({ quiet: true });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const H = require("./helpers");
const { createThrowawaySalon, teardownSalon } = require("./fixtures");

const ctx = {};

before(async () => {
  ctx.salon = await createThrowawaySalon("race", { prefix: "concurrency" });
});

after(async () => {
  await teardownSalon(ctx.salon?.salonId);
  await pool.end();
});

test("exactly one of two simultaneous bookings for the same slot succeeds", async () => {
  const date = "2099-08-01"; // far future, open Saturday per fixtures' 7-day-open hours
  const timeSlot = "10:00";

  const [resA, resB] = await Promise.all([
    H.postBooking(ctx.salon.host, {
      serviceId: ctx.salon.serviceId, staffId: ctx.salon.staffId,
      date, timeSlot, customerName: "Racer A", customerPhone: H.uniquePhone(),
    }),
    H.postBooking(ctx.salon.host, {
      serviceId: ctx.salon.serviceId, staffId: ctx.salon.staffId,
      date, timeSlot, customerName: "Racer B", customerPhone: H.uniquePhone(),
    }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [201, 409], "exactly one request must win the slot, the other must be rejected");

  const [rows] = await pool.execute(
    "SELECT id FROM bookings WHERE salon_id = ? AND staff_id = ? AND date = ? AND time_slot = ? AND status != 'cancelled'",
    [ctx.salon.salonId, ctx.salon.staffId, date, timeSlot]
  );
  assert.equal(rows.length, 1, "only one booking must exist for the contested slot");
});
