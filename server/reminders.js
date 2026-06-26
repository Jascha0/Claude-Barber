const cron = require("node-cron");
const { pool } = require("./db");
const { sendReminder, refreshExpiringTokens } = require("./messaging");

// Runs every day at 18:00 — sends reminders for all salons' bookings tomorrow
cron.schedule("0 18 * * *", async () => {
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
});

// Runs daily at 03:00 — refreshes WhatsApp tokens expiring within 20 days
cron.schedule("0 3 * * *", () => {
  refreshExpiringTokens().catch(e => console.error("[whatsapp] token refresh cron error:", e.message));
});

// On startup — refresh any token that has no expiry date yet
refreshExpiringTokens().catch(e => console.error("[whatsapp] startup token refresh error:", e.message));

console.log("[reminders] Scheduler started — daily at 18:00 (reminders) + 03:00 (token refresh)");
