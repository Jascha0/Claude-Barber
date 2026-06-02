const cron = require("node-cron");
const db = require("./db");
const { sendReminder } = require("./sms");

// Runs every day at 18:00 — sends reminders for tomorrow's bookings
cron.schedule("0 18 * * *", async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const bookings = db.prepare(`
    SELECT b.*, s.name as service_name, s.duration, s.price
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    WHERE b.date = ? AND b.status = 'confirmed'
  `).all(dateStr);

  for (const booking of bookings) {
    try {
      await sendReminder({
        booking,
        service: { name: booking.service_name, duration: booking.duration, price: booking.price },
      });
    } catch (err) {
      console.error(`Reminder failed for booking ${booking.id}:`, err.message);
    }
  }

  if (bookings.length > 0) {
    console.log(`[reminders] Sent ${bookings.length} reminder(s) for ${dateStr}`);
  }
});

console.log("[reminders] Scheduler started — daily at 18:00");
