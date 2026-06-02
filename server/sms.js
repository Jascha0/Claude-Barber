require("dotenv").config();
const db = require("./db");

function isEnabled() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'twilio_enabled'").get();
  return row?.value === "true" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN;
}

function getClient() {
  if (!isEnabled()) return null;
  const twilio = require("twilio");
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

async function sendConfirmation({ booking, service, staff }) {
  const client = getClient();
  if (!client) return;

  const msg =
    `Hallo ${booking.customer_name}, dein Termin bei Next Level Salon ist bestätigt!\n` +
    `📅 ${formatDate(booking.date)} um ${booking.time_slot} Uhr\n` +
    `✂️ ${service.name} (${service.duration} Min.) – ${service.price} €\n` +
    `👤 Friseur: ${staff.name}\n` +
    `📍 Barer Str. 68, 80799 München\n` +
    `Bis bald!`;

  await client.messages.create({
    body: msg,
    from: process.env.TWILIO_FROM_NUMBER,
    to: booking.customer_phone,
  });
}

async function sendReminder({ booking, service }) {
  const client = getClient();
  if (!client) return;

  const msg =
    `Erinnerung: Morgen um ${booking.time_slot} Uhr hast du einen Termin bei Next Level Salon.\n` +
    `✂️ ${service.name} · Barer Str. 68, München.\n` +
    `Absagen oder Fragen? Ruf uns an.`;

  await client.messages.create({
    body: msg,
    from: process.env.TWILIO_FROM_NUMBER,
    to: booking.customer_phone,
  });
}

module.exports = { sendConfirmation, sendReminder };
