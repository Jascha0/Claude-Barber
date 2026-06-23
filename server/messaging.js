/**
 * WhatsApp messaging via Meta Cloud API.
 *
 * OPEN SLOTS — fill these per salon via the admin panel:
 *   settings key "meta_phone_number_id"  → from Meta Developer Console
 *   settings key "meta_waba_token"        → permanent system user token from Meta
 *
 * OPEN SLOTS — fill per staff member via the admin panel:
 *   staff.whatsapp_phone  → e.g. +4917612345678
 */

const { pool } = require("./db");

const META_API = "https://graph.facebook.com/v19.0";

async function getSalonWhatsAppConfig(salonId) {
  const keys = ["meta_phone_number_id", "meta_waba_token", "whatsapp_enabled", "meta_waba_token_expires"];
  const [rows] = await pool.execute(
    `SELECT \`key\`, value FROM settings WHERE salon_id = ? AND \`key\` IN (${keys.map(() => "?").join(",")})`,
    [salonId, ...keys]
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return cfg;
}

async function saveSetting(salonId, key, value) {
  await pool.execute(
    "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [salonId, key, value]
  );
}

/**
 * Exchanges a short- or long-lived token for a fresh 60-day token.
 * Requires META_APP_ID and META_APP_SECRET in env.
 * Returns the new token string, or null on failure.
 */
async function exchangeForLongLivedToken(currentToken) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;

  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error || !data.access_token) {
    console.error("[whatsapp] token exchange failed:", JSON.stringify(data.error || data));
    return null;
  }
  return data.access_token;
}

/**
 * Refreshes the WABA token for a salon. Exchanges the current token for a new
 * 60-day token and updates the DB. Called on token save and by the daily cron.
 */
async function refreshWabaToken(salonId) {
  const cfg = await getSalonWhatsAppConfig(salonId);
  if (!cfg.meta_waba_token) return;

  const newToken = await exchangeForLongLivedToken(cfg.meta_waba_token);
  if (!newToken) return;

  const expires = new Date();
  expires.setDate(expires.getDate() + 60);

  await saveSetting(salonId, "meta_waba_token", newToken);
  await saveSetting(salonId, "meta_waba_token_expires", expires.toISOString().slice(0, 10));
  console.log(`[whatsapp] salon ${salonId}: token refreshed, expires ${expires.toISOString().slice(0, 10)}`);
}

/**
 * Checks all salons and refreshes any token expiring within 20 days.
 * Called daily by the scheduler in reminders.js.
 */
async function refreshExpiringTokens() {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 20);
  const thresholdStr = threshold.toISOString().slice(0, 10);

  // Refresh salons that have a token but either no expiry date, or one within 20 days
  const [rows] = await pool.execute(`
    SELECT DISTINCT t.salon_id
    FROM settings t
    WHERE t.\`key\` = 'meta_waba_token'
      AND (
        NOT EXISTS (
          SELECT 1 FROM settings e
          WHERE e.salon_id = t.salon_id AND e.\`key\` = 'meta_waba_token_expires'
        )
        OR EXISTS (
          SELECT 1 FROM settings e
          WHERE e.salon_id = t.salon_id AND e.\`key\` = 'meta_waba_token_expires' AND e.value <= ?
        )
      )
  `, [thresholdStr]);

  for (const { salon_id } of rows) {
    await refreshWabaToken(salon_id).catch(e =>
      console.error(`[whatsapp] auto-refresh failed for salon ${salon_id}:`, e.message)
    );
  }
  if (rows.length) console.log(`[whatsapp] auto-refreshed tokens for ${rows.length} salon(s)`);
}

async function sendWhatsApp({ to, message, salonId }) {
  const cfg = await getSalonWhatsAppConfig(salonId);

  if (cfg.whatsapp_enabled !== "true") return;
  if (!cfg.meta_phone_number_id || !cfg.meta_waba_token) return; // slots not filled yet

  const phone = to.replace(/\s+/g, "").replace(/^\+/, "");

  const res = await fetch(`${META_API}/${cfg.meta_phone_number_id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.meta_waba_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error(`[whatsapp] send failed to ${phone}:`, JSON.stringify(err));
  }
}

function formatDate(dateStr) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("de-DE", {
    weekday: "long", day: "numeric", month: "long",
  });
}

// ── Outbound messages ─────────────────────────────────────────────────────────

async function sendBookingConfirmationToCustomer({ booking, service, staff, salon, salonId }) {
  const bookingUrl = salon.domain
    ? `https://${salon.domain}`
    : `https://${salon.slug}.barberbook.de`;

  await sendWhatsApp({
    to: booking.customer_phone,
    salonId,
    message:
      `✅ Termin bestätigt bei ${salon.name}!\n\n` +
      `📅 ${formatDate(booking.date)} um ${booking.time_slot} Uhr\n` +
      `✂️ ${service.name} · ${service.duration} Min. · ${service.price} €\n` +
      `👤 ${staff.name}\n` +
      `📍 ${salon.address}\n\n` +
      `Bis bald! 💈`,
  });
}

async function sendBookingAlertToStaff({ booking, service, staff, salon, salonId }) {
  // ── OPEN SLOT: staff.whatsapp_phone must be set in the admin panel ──
  if (!staff.whatsapp_phone) return;

  await sendWhatsApp({
    to: staff.whatsapp_phone,
    salonId,
    message:
      `🔔 Neuer Termin für dich!\n\n` +
      `👤 ${booking.customer_name} (${booking.customer_phone})\n` +
      `📅 ${formatDate(booking.date)} um ${booking.time_slot} Uhr\n` +
      `✂️ ${service.name} · ${service.duration} Min.\n` +
      `📍 ${salon.name}`,
  });
}

async function sendReminder({ booking, service, salon, salonId }) {
  await sendWhatsApp({
    to: booking.customer_phone,
    salonId,
    message:
      `⏰ Erinnerung: Morgen um ${booking.time_slot} Uhr hast du einen Termin bei ${salon.name}.\n` +
      `✂️ ${service.name} · ${salon.address}\n\n` +
      `Bei Fragen oder zum Absagen ruf uns an.`,
  });
}

// ── Inbound auto-reply ────────────────────────────────────────────────────────

async function sendBookingLinkReply({ to, salon, salonId }) {
  const bookingUrl = salon.domain
    ? `https://${salon.domain}`
    : `https://claude-barber-production.up.railway.app`; // fallback until domain is set

  await sendWhatsApp({
    to,
    salonId,
    message:
      `Hallo! 👋 Schön, dass du dich meldest.\n\n` +
      `Buche deinen Termin bei ${salon.name} direkt hier:\n` +
      `👉 ${bookingUrl}\n\n` +
      `Wähle Service, Friseur und Wunschzeit — alles in wenigen Klicks. ✂️`,
  });
}

module.exports = {
  sendBookingConfirmationToCustomer,
  sendBookingAlertToStaff,
  sendReminder,
  sendBookingLinkReply,
  refreshWabaToken,
  refreshExpiringTokens,
};
