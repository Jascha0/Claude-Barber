/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  /api/webhook/whatsapp  — Meta calls this once to verify the webhook
 * POST /api/webhook/whatsapp  — Meta calls this on every incoming message
 *
 * OPEN SLOT: set META_WEBHOOK_VERIFY_TOKEN in Railway env vars (any random string),
 * then register this URL in Meta Developer Console →
 * WhatsApp → Configuration → Webhook → Callback URL:
 *   https://claude-barber-production.up.railway.app/api/webhook/whatsapp
 */

const router  = require("express").Router();
const crypto  = require("crypto");
const { pool } = require("../db");
const { classifyIntent } = require("../ai");
const { sendWhatsAppText, sendBookingLinkReply } = require("../messaging");

function verifyMetaSignature(req, res, next) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return next();

  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return res.sendStatus(403);

  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.sendStatus(403);
  }
  next();
}

// ── Webhook verification ──────────────────────────────────────────────────────
router.get("/whatsapp", (req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Meta webhook verified.");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Incoming messages ─────────────────────────────────────────────────────────
router.post("/whatsapp", verifyMetaSignature, async (req, res) => {
  let body;
  try { body = JSON.parse(req.body); } catch { return res.sendStatus(200); }
  res.sendStatus(200); // always 200 immediately — Meta retries otherwise

  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== "messages") return;

    const msg = change.value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const fromPhone   = msg.from;
    const messageText = msg.text?.body || "";
    const recipientId = change.value?.metadata?.phone_number_id;

    // Find which salon this phone number belongs to
    const [[salon]] = await pool.execute(
      "SELECT s.* FROM salons s JOIN settings st ON s.id = st.salon_id WHERE st.`key` = 'meta_phone_number_id' AND st.value = ? AND s.active = 1",
      [recipientId]
    );
    if (!salon) return;

    const customerPhone = `+${fromPhone}`;
    console.log(`[webhook] "${messageText.slice(0, 60)}" from ${customerPhone} → salon "${salon.name}"`);

    // AI classification (falls back to keywords if ANTHROPIC_API_KEY not set)
    const intent = await classifyIntent(messageText);
    console.log(`[webhook] intent: ${intent}`);

    // Persist message with intent
    await pool.execute(
      "INSERT INTO whatsapp_messages (salon_id, from_phone, message_text, intent, replied) VALUES (?,?,?,?,?)",
      [salon.id, customerPhone, messageText, intent, intent !== "other" ? 1 : 0]
    );

    if (intent === "book") {
      await sendBookingLinkReply({ to: customerPhone, salon, salonId: salon.id });

    } else if (intent === "cancel") {
      await handleCancelIntent({ customerPhone, salon });

    } else {
      // Other — acknowledge and surface in admin inbox
      await sendWhatsAppText({
        to: customerPhone,
        salonId: salon.id,
        message:
          `Hallo! 👋 Danke für deine Nachricht.\n\n` +
          `Wir haben sie erhalten und melden uns so schnell wie möglich bei dir. ✂️\n\n` +
          `Möchtest du direkt einen Termin buchen?\n` +
          `👉 ${salon.domain ? `https://${salon.domain}` : `https://claude-barber-production.up.railway.app`}`,
      });
    }
  } catch (err) {
    console.error("[webhook] Error processing message:", err.message);
  }
});

// ── Cancel intent handler ─────────────────────────────────────────────────────
async function handleCancelIntent({ customerPhone, salon }) {
  // Normalize: strip everything except digits, take last 9 to match regardless of
  // how the customer typed their number at booking time (+49 179... vs 0179... etc.)
  const digits9 = customerPhone.replace(/\D/g, "").slice(-9);

  const [bookings] = await pool.execute(`
    SELECT b.id, DATE_FORMAT(b.date, '%Y-%m-%d') as date, b.time_slot, b.cancellation_token,
           s.name as service_name, st.name as staff_name
    FROM bookings b
    JOIN services s  ON b.service_id = s.id
    JOIN staff    st ON b.staff_id   = st.id
    WHERE b.salon_id = ?
      AND REGEXP_REPLACE(b.customer_phone, '[^0-9]', '') LIKE CONCAT('%', ?)
      AND b.status = 'confirmed' AND b.date >= CURDATE()
    ORDER BY b.date ASC, b.time_slot ASC
    LIMIT 3
  `, [salon.id, digits9]);

  if (!bookings.length) {
    await sendWhatsAppText({
      to: customerPhone,
      salonId: salon.id,
      message:
        `Hallo! 👋 Wir haben leider keine aktive Buchung für deine Nummer gefunden.\n\n` +
        `Falls du trotzdem Hilfe brauchst, ruf uns gerne an oder schreib uns erneut. ✂️`,
    });
    return;
  }

  const baseUrl = salon.domain
    ? `https://${salon.domain}`
    : `https://claude-barber-production.up.railway.app`;

  if (bookings.length === 1) {
    const b = bookings[0];
    const d = new Date(b.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
    const cancelUrl = b.cancellation_token ? `${baseUrl}/cancel/${b.cancellation_token}` : null;

    await sendWhatsAppText({
      to: customerPhone,
      salonId: salon.id,
      message:
        `Hallo! 👋 Wir haben deinen Termin gefunden:\n\n` +
        `📅 ${d} um ${b.time_slot} Uhr\n` +
        `✂️ ${b.service_name} · ${b.staff_name}\n\n` +
        (cancelUrl
          ? `Um ihn abzusagen, klicke hier:\n❌ ${cancelUrl}`
          : `Ruf uns bitte an, um den Termin abzusagen.`),
    });
  } else {
    // Multiple bookings — list them all with their cancel links
    const lines = bookings.map((b, i) => {
      const d = new Date(b.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" });
      return b.cancellation_token
        ? `${i + 1}. ${d} ${b.time_slot} – ${b.service_name}\n   ❌ ${baseUrl}/cancel/${b.cancellation_token}`
        : `${i + 1}. ${d} ${b.time_slot} – ${b.service_name}`;
    }).join("\n\n");

    await sendWhatsAppText({
      to: customerPhone,
      salonId: salon.id,
      message:
        `Hallo! 👋 Wir haben mehrere Termine für dich gefunden:\n\n${lines}\n\n` +
        `Klicke auf den jeweiligen Link um einen Termin abzusagen.`,
    });
  }
}

module.exports = router;
