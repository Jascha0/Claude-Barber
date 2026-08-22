/**
 * Shared DB fixtures for tests that need a real, throwaway salon.
 *
 * Talks to the DB directly (fast, deterministic) — the same pattern every
 * DB-touching test file used to duplicate. `createThrowawaySalon` seeds a
 * salon with open-every-day hours, a bcrypt admin password, one service and
 * one staff member; `teardownSalon` removes it and everything under it in
 * FK-safe order. Callers still own `pool.end()` in their own `after()` —
 * node's test runner isolates each file into its own process, so each file
 * that requires `../server/db` owns its own pool lifecycle.
 */

const bcrypt = require("bcryptjs");
const { pool } = require("../server/db");

const OPEN_HOURS = JSON.stringify({ 0: [8, 20], 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [8, 20] });
const SUFFIX = process.env.TEST_HOST_SUFFIX || "test";

/**
 * Creates a salon with a unique slug, open every day 8-20, one service and
 * one staff member. `extraSettings` (plain object of key -> string value) is
 * written into the `settings` table alongside `hours`/`admin_password` —
 * useful for e.g. `meta_phone_number_id` in webhook tests.
 */
async function createThrowawaySalon(label, { prefix = "test", password = "throwaway-test-pw", extraSettings = {} } = {}) {
  const slug = `${prefix}-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  const [sr] = await pool.execute(
    "INSERT INTO salons (name, slug, active) VALUES (?,?,1)",
    [`${prefix} ${label}`, slug]
  );
  const salonId = sr.insertId;

  const hash = await bcrypt.hash(password, 12);
  const settingsRows = [["hours", OPEN_HOURS], ["admin_password", hash], ...Object.entries(extraSettings)];
  for (const [key, value] of settingsRows) {
    await pool.execute("INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?)", [salonId, key, value]);
  }

  const [svc] = await pool.execute(
    "INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)",
    [salonId, `Cut ${label}`, 25, 30]
  );
  const [stf] = await pool.execute(
    "INSERT INTO staff (salon_id, name) VALUES (?,?)",
    [salonId, `Barber ${label}`]
  );

  return {
    salonId, slug, host: `${slug}.${SUFFIX}`,
    serviceId: svc.insertId, staffId: stf.insertId,
    password,
  };
}

/** Removes a throwaway salon and everything under it, in FK-safe order. */
async function teardownSalon(salonId) {
  if (!salonId) return;
  await pool.execute("DELETE FROM sessions WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM bookings WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM blocked_slots WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM whatsapp_messages WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM settings WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM services WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM staff WHERE salon_id = ?", [salonId]);
  await pool.execute("DELETE FROM salons WHERE id = ?", [salonId]);
}

module.exports = { createThrowawaySalon, teardownSalon };
