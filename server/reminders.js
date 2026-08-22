const cron = require("node-cron");
const { pool } = require("./db");
const { sendReminder, refreshExpiringTokens } = require("./messaging");

// Sends reminders for all salons' bookings tomorrow. Exported so it can be
// invoked directly (tests, manual runs) without waiting for the cron tick.
async function sendDueReminders() {
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const dateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(tomorrowDate);

  const [bookings] = await pool.execute(`
    SELECT b.*, s.name as service_name, s.duration, s.price,
           sal.name as salon_name, sal.address as salon_address, sal.domain as salon_domain
    FROM bookings b
    JOIN services s  ON b.service_id = s.id
    JOIN salons   sal ON b.salon_id  = sal.id
    WHERE b.date = ? AND b.status = 'confirmed'
  `, [dateStr]);

  for (const booking of bookings) {
    try {
      await sendReminder({
        booking,
        service: { name: booking.service_name, duration: booking.duration, price: booking.price },
        salon:   { name: booking.salon_name, address: booking.salon_address, domain: booking.salon_domain },
        salonId: booking.salon_id,
      });
    } catch (err) {
      console.error(`Reminder failed for booking ${booking.id}:`, err.message);
    }
  }

  if (bookings.length) {
    console.log(`[reminders] Sent ${bookings.length} reminder(s) for ${dateStr}`);
  }
  return bookings.length;
}

// ── GDPR data retention (Art. 5 Speicherbegrenzung) ───────────────────────────
// Retention windows are placeholders pending the AVV with each salon —
// override via env vars. Bookings are anonymized (not deleted) so slot
// history and stats stay intact; messages and leads are deleted outright.
const RETENTION = {
  bookingMonths: Number(process.env.RETENTION_BOOKING_MONTHS) || 6,
  messageDays:   Number(process.env.RETENTION_MESSAGE_DAYS)   || 90,
  leadMonths:    Number(process.env.RETENTION_LEAD_MONTHS)    || 12,
};

// Exported so tests can invoke the exact production retention logic directly,
// without waiting for the 04:00 cron tick.
async function runRetention() {
  const result = { anonymizedBookings: 0, deletedMessages: 0, deletedLeads: 0 };
  try {
    const [b] = await pool.execute(
      `UPDATE bookings
         SET customer_name = '[gelöscht]', customer_phone = '', cancellation_token = NULL
       WHERE date < DATE_SUB(CURDATE(), INTERVAL ? MONTH)
         AND customer_phone != ''`,
      [RETENTION.bookingMonths]
    );
    const [m] = await pool.execute(
      "DELETE FROM whatsapp_messages WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RETENTION.messageDays]
    );
    const [l] = await pool.execute(
      "DELETE FROM leads WHERE created_at < DATE_SUB(NOW(), INTERVAL ? MONTH)",
      [RETENTION.leadMonths]
    );
    result.anonymizedBookings = b.affectedRows;
    result.deletedMessages = m.affectedRows;
    result.deletedLeads = l.affectedRows;
    if (b.affectedRows || m.affectedRows || l.affectedRows) {
      console.log(`[retention] anonymized ${b.affectedRows} booking(s), deleted ${m.affectedRows} message(s), ${l.affectedRows} lead(s)`);
    }
  } catch (err) {
    console.error("[retention] cron error:", err.message);
  }
  return result;
}

// Registers the three cron jobs and runs the one-off startup token refresh.
// Kept separate from module load so simply requiring this file (e.g. from
// tests) has no side effects — nothing runs until the server calls this.
function startScheduler() {
  // Runs every day at 18:00 — sends reminders for all salons' bookings tomorrow
  cron.schedule("0 18 * * *", sendDueReminders);

  // Runs daily at 03:00 — refreshes WhatsApp tokens expiring within 20 days
  cron.schedule("0 3 * * *", () => {
    refreshExpiringTokens().catch(e => console.error("[whatsapp] token refresh cron error:", e.message));
  });

  // Runs daily at 04:00 — GDPR data retention
  cron.schedule("0 4 * * *", runRetention, { timezone: "Europe/Berlin" });

  // On startup — refresh any token that has no expiry date yet
  refreshExpiringTokens().catch(e => console.error("[whatsapp] startup token refresh error:", e.message));

  console.log("[reminders] Scheduler started — daily at 18:00 (reminders) + 03:00 (token refresh) + 04:00 (retention)");
}

module.exports = { startScheduler, sendDueReminders, runRetention };
