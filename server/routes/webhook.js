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
const { sendBookingLinkReply } = require("../messaging");

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
  // Parse body (received as raw Buffer for signature verification)
  let body;
  try { body = JSON.parse(req.body); } catch { return res.sendStatus(200); }
  // Always respond 200 immediately — Meta will retry if we're slow
  res.sendStatus(200);

  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    if (change?.field !== "messages") return;

    const msg = change.value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const fromPhone     = msg.from;                          // customer's number
    const recipientId   = change.value?.metadata?.phone_number_id; // salon's Meta phone number ID

    // Find which salon this WhatsApp number belongs to
    const [[salRow]] = await pool.execute(
      "SELECT s.* FROM salons s JOIN settings st ON s.id = st.salon_id WHERE st.`key` = 'meta_phone_number_id' AND st.value = ? AND s.active = 1",
      [recipientId]
    );
    if (!salRow) return; // unknown number — ignore

    console.log(`[webhook] Message from +${fromPhone} to salon "${salRow.name}"`);

    // Auto-reply with booking link
    await sendBookingLinkReply({
      to: `+${fromPhone}`,
      salon: salRow,
      salonId: salRow.id,
    });
  } catch (err) {
    console.error("[webhook] Error processing message:", err.message);
  }
});

module.exports = router;
