const { pool } = require("./db");

async function isEnabled(salonId) {
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'twilio_enabled'",
    [salonId]
  );
  return row?.value === "true" && !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
}

function getClient() {
  const twilio = require("twilio");
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
  });
}

async function sendConfirmation({ booking, service, staff, salonId }) {
  if (!await isEnabled(salonId)) return;
  const [[salon]] = await pool.execute("SELECT name, address FROM salons WHERE id = ?", [salonId]);
  const client = getClient();
  await client.messages.create({
    body:
      `Hallo ${booking.customer_name}, dein Termin bei ${salon.name} ist bestätigt!\n` +
      `📅 ${formatDate(booking.date)} um ${booking.time_slot} Uhr\n` +
      `✂️ ${service.name} (${service.duration} Min.) – ${service.price} €\n` +
      `👤 Friseur: ${staff.name}\n` +
      `📍 ${salon.address}\nBis bald!`,
    from: process.env.TWILIO_FROM_NUMBER,
    to:   booking.customer_phone,
  });
}

async function sendReminder({ booking, service, salonId }) {
  if (!await isEnabled(salonId)) return;
  const [[salon]] = await pool.execute("SELECT name, address FROM salons WHERE id = ?", [salonId]);
  const client = getClient();
  await client.messages.create({
    body:
      `Erinnerung: Morgen um ${booking.time_slot} Uhr hast du einen Termin bei ${salon.name}.\n` +
      `✂️ ${service.name} · ${salon.address}\nAbsagen oder Fragen? Ruf uns an.`,
    from: process.env.TWILIO_FROM_NUMBER,
    to:   booking.customer_phone,
  });
}

module.exports = { sendConfirmation, sendReminder };
