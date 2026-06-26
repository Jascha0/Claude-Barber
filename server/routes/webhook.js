/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  /api/webhook/whatsapp  — Meta calls this once to verify the webhook
 * POST /api/webhook/whatsapp  — Meta calls this on every incoming message
 *
 * OPEN SLOT: set META_WEBHOOK_VERIFY_TOKEN in .env (any random string you choose),
 * then register this URL in Meta Developer Console →
 * WhatsApp → Configuration → Webhook → Callback URL:
 *   https://claude-barber-production.up.railway.app/api/webhook/whatsapp
 */

const router  = require("express").Router();
const crypto  = require("crypto");
const { pool } = require("../db");
const { sendBookingLinkReply, sendWhatsAppText } = require("../messaging");

// German keywords that strongly suggest the customer wants to book
const BOOK_KEYWORDS = [
  "termin", "buchen", "buchung", "reservier", "slot", "zeit", "uhrzeit",
  "verfügbar", "frei", "wann", "morgen", "heute", "nächste woche", "diese woche",
  "appointment", "book", "available", "schnitt", "haarschnitt", "bart",
  "möchte", "kann ich", "hätte gerne", "würde gerne", "bitte einen termin",
];

function detectIntent(text) {
  const lower = text.toLowerCase();
  return BOOK_KEYWORDS.some(kw => lower.includes(kw)) ? "book" : "other";
}

function verifyMetaSignature(req, res, next) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return next(); // skip if not configured yet

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

// ── Webhook verification (Meta calls this once during setup) ──────────────────
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
  // Always respond 200 immediately — Meta retries if we're slow
  res.sendStatus(200);

  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== "messages") return;

    const msg = change.value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const fromPhone   = msg.from;
    const messageText = msg.text?.body || "";
    const recipientId = change.value?.metadata?.phone_number_id;

    // Find which salon this WhatsApp number belongs to
    const [[salRow]] = await pool.execute(
      "SELECT s.* FROM salons s JOIN settings st ON s.id = st.salon_id WHERE st.`key` = 'meta_phone_number_id' AND st.value = ? AND s.active = 1",
      [recipientId]
    );
    if (!salRow) return;

    console.log(`[webhook] Message from +${fromPhone} to salon "${salRow.name}": "${messageText.slice(0, 60)}"`);

    const intent = detectIntent(messageText);

    // Persist message
    await pool.execute(
      "INSERT INTO whatsapp_messages (salon_id, from_phone, message_text, intent, replied) VALUES (?,?,?,?,?)",
      [salRow.id, `+${fromPhone}`, messageText, intent, intent === "book" ? 1 : 0]
    );

    if (intent === "book") {
      // Customer wants to book — send them the booking link
      await sendBookingLinkReply({ to: `+${fromPhone}`, salon: salRow, salonId: salRow.id });
    } else {
      // Other question — acknowledge and let admin respond manually
      await sendWhatsAppText({
        to: `+${fromPhone}`,
        salonId: salRow.id,
        message:
          `Hallo! 👋 Danke für deine Nachricht.\n\n` +
          `Wir haben sie erhalten und melden uns so schnell wie möglich bei dir. ✂️\n\n` +
          `Wenn du direkt einen Termin buchen möchtest:\n` +
          `👉 ${salRow.domain ? `https://${salRow.domain}` : `https://claude-barber-production.up.railway.app`}`,
      });
    }
  } catch (err) {
    console.error("[webhook] Error processing message:", err.message);
  }
});

module.exports = router;
