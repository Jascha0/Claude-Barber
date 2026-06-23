const cron = require("node-cron");
const { pool } = require("./db");
const { sendReminder, refreshExpiringTokens } = require("./messaging");

// Runs every day at 18:00 — sends reminders for all salons' bookings tomorrow
cron.schedule("0 18 * * *", async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const [bookings] = await pool.execute(`
    SELECT b.*, s.name as service_name, s.duration, s.price
    FROM bookings b
    JOIN services s ON b.service_id = s.id AND b.salon_id = s.salon_id
    WHERE b.date = ? AND b.status = 'confirmed'
  `, [dateStr]);

  for (const booking of bookings) {
    try {
      await sendReminder({
        booking,
        service:  { name: booking.service_name, duration: booking.duration, price: booking.price },
        salonId:  booking.salon_id,
      });
    } catch (err) {
      console.error(`Reminder failed for booking ${booking.id}:`, err.message);
    }
  }

  if (bookings.length) {
    console.log(`[reminders] Sent ${bookings.length} reminder(s) for ${dateStr}`);
  }
});

// Runs daily at 03:00 — refreshes WhatsApp tokens expiring within 20 days
cron.schedule("0 3 * * *", () => {
  refreshExpiringTokens().catch(e => console.error("[whatsapp] token refresh cron error:", e.message));
});

// On startup — refresh any token that has no expiry date yet
refreshExpiringTokens().catch(e => console.error("[whatsapp] startup token refresh error:", e.message));

console.log("[reminders] Scheduler started — daily at 18:00 (reminders) + 03:00 (token refresh)");
