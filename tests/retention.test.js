/**
 * GDPR data-retention cron logic (server/reminders.js: runRetention).
 *
 * Seeds one "old" and one "fresh" row for each of the three retention rules
 * (bookings anonymized after 6 months, WhatsApp messages deleted after 90
 * days, leads deleted after 12 months — all defaults, see RETENTION in
 * server/reminders.js), calls the exact production function directly, and
 * asserts the old rows were swept up while the fresh ones survived.
 *
 * IMPORTANT: this exercises the *real* retention query, which is not
 * salon-scoped for whatsapp_messages/leads (by design — it's a global
 * maintenance job). In CI this is safe (fresh DB every run). Locally, only
 * run this against a throwaway database — never against a real/production
 * one — because it will also sweep up any other genuinely old rows already
 * sitting in whatever database it's pointed at. That matches the project's
 * existing local-dev rule (see CLAUDE.md).
 */

require("dotenv").config({ quiet: true });
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../server/db");
const { createThrowawaySalon, teardownSalon } = require("./fixtures");
const { runRetention } = require("../server/reminders");

const ctx = {};
const LEAD_MARKER = `retention-test-${Date.now()}`;

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

before(async () => {
  ctx.salon = await createThrowawaySalon("ret", { prefix: "retention" });

  const oldDate = new Date();   oldDate.setMonth(oldDate.getMonth() - 7);   // beyond the 6-month default
  const freshDate = new Date(); freshDate.setMonth(freshDate.getMonth() - 1); // within the window

  const [oldB] = await pool.execute(
    "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token, status) VALUES (?,?,?,?,?,?,?,?,?)",
    [ctx.salon.salonId, ctx.salon.serviceId, ctx.salon.staffId, ymd(oldDate), "10:00", "Old Customer", "+491700000001", "ret-old-" + Date.now(), "confirmed"]
  );
  ctx.oldBookingId = oldB.insertId;

  const [freshB] = await pool.execute(
    "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token, status) VALUES (?,?,?,?,?,?,?,?,?)",
    [ctx.salon.salonId, ctx.salon.serviceId, ctx.salon.staffId, ymd(freshDate), "11:00", "Fresh Customer", "+491700000002", "ret-fresh-" + Date.now(), "confirmed"]
  );
  ctx.freshBookingId = freshB.insertId;

  const [oldM] = await pool.execute(
    "INSERT INTO whatsapp_messages (salon_id, from_phone, message_text, intent, replied, created_at) VALUES (?,?,?,?,?, DATE_SUB(NOW(), INTERVAL 100 DAY))",
    [ctx.salon.salonId, "+491700000003", "old message", "other", 0]
  );
  ctx.oldMessageId = oldM.insertId;

  const [freshM] = await pool.execute(
    "INSERT INTO whatsapp_messages (salon_id, from_phone, message_text, intent, replied, created_at) VALUES (?,?,?,?,?, DATE_SUB(NOW(), INTERVAL 10 DAY))",
    [ctx.salon.salonId, "+491700000004", "fresh message", "other", 0]
  );
  ctx.freshMessageId = freshM.insertId;

  const [oldL] = await pool.execute(
    "INSERT INTO leads (salon_name, owner_name, phone, city, created_at) VALUES (?,?,?,?, DATE_SUB(NOW(), INTERVAL 13 MONTH))",
    [`${LEAD_MARKER}-old`, "Old Owner", "+491700000005", "Testcity"]
  );
  ctx.oldLeadId = oldL.insertId;

  const [freshL] = await pool.execute(
    "INSERT INTO leads (salon_name, owner_name, phone, city, created_at) VALUES (?,?,?,?, DATE_SUB(NOW(), INTERVAL 1 MONTH))",
    [`${LEAD_MARKER}-fresh`, "Fresh Owner", "+491700000006", "Testcity"]
  );
  ctx.freshLeadId = freshL.insertId;

  // Run the real production retention job once; all tests below assert on its result.
  ctx.result = await runRetention();
});

after(async () => {
  // The fresh lead should have survived; whatever's left of ours gets cleaned up here
  // (leads has no salon_id, so it isn't covered by teardownSalon).
  await pool.execute("DELETE FROM leads WHERE salon_name LIKE ?", [`${LEAD_MARKER}%`]);
  await teardownSalon(ctx.salon?.salonId);
  await pool.end();
});

test("runRetention reports at least one affected row per category", () => {
  assert.ok(ctx.result.anonymizedBookings >= 1, "expected at least our old booking to be anonymized");
  assert.ok(ctx.result.deletedMessages >= 1, "expected at least our old message to be deleted");
  assert.ok(ctx.result.deletedLeads >= 1, "expected at least our old lead to be deleted");
});

test("bookings older than the retention window are anonymized, recent ones are not", async () => {
  const [[oldRow]] = await pool.execute(
    "SELECT customer_name, customer_phone, cancellation_token FROM bookings WHERE id = ?", [ctx.oldBookingId]
  );
  assert.equal(oldRow.customer_name, "[gelöscht]");
  assert.equal(oldRow.customer_phone, "");
  assert.equal(oldRow.cancellation_token, null);

  const [[freshRow]] = await pool.execute(
    "SELECT customer_name, customer_phone FROM bookings WHERE id = ?", [ctx.freshBookingId]
  );
  assert.equal(freshRow.customer_name, "Fresh Customer");
  assert.equal(freshRow.customer_phone, "+491700000002");
});

test("whatsapp_messages older than the retention window are deleted, recent ones are not", async () => {
  const [[oldRow]] = await pool.execute("SELECT id FROM whatsapp_messages WHERE id = ?", [ctx.oldMessageId]);
  assert.equal(oldRow, undefined, "old message must be deleted");

  const [[freshRow]] = await pool.execute("SELECT id FROM whatsapp_messages WHERE id = ?", [ctx.freshMessageId]);
  assert.ok(freshRow, "fresh message must remain");
});

test("leads older than the retention window are deleted, recent ones are not", async () => {
  const [[oldRow]] = await pool.execute("SELECT id FROM leads WHERE id = ?", [ctx.oldLeadId]);
  assert.equal(oldRow, undefined, "old lead must be deleted");

  const [[freshRow]] = await pool.execute("SELECT id FROM leads WHERE id = ?", [ctx.freshLeadId]);
  assert.ok(freshRow, "fresh lead must remain");
});
