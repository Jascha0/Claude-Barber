# Claude-Barber — Full Codebase Snapshot
# Generated for Fable 5 project review
# Stack: Node.js/Express + MySQL (Railway) | Multi-tenant SaaS barbershop booking platform
# Features: online booking, WhatsApp AI classification (Haiku), self-cancellation, admin/superadmin panels, leads system

`````````````````````````````````````````nFILE: package.json
`````````````````````````````````````````n{
  "name": "claude-barber",
  "version": "1.0.0",
  "description": "Building a Website for Barbers with an automatised response system",
  "main": "index.js",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/Jascha0/Claude-Barber.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "bugs": {
    "url": "https://github.com/Jascha0/Claude-Barber/issues"
  },
  "homepage": "https://github.com/Jascha0/Claude-Barber#readme",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.106.0",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "express-rate-limit": "^8.5.2",
    "express-validator": "^7.3.2",
    "helmet": "^8.2.0",
    "lucide": "^1.21.0",
    "mysql2": "^3.22.5",
    "node-cron": "^4.2.1"
  }
}


`````````````````````````````````````````nFILE: server/index.js
`````````````````````````````````````````nrequire("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const { initDb } = require("./db");
const tenant     = require("./middleware/tenant");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https:"],
      frameSrc:    ["https://www.google.com"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use((_, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));

// Raw body needed for WhatsApp webhook signature verification — must come before express.json()
app.use("/api/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking requests. Try again later." },
});

const leadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

app.use("/api/admin/login",     loginLimiter);
app.use("/api/bookings",        bookingLimiter);
app.use("/api/superadmin/leads", leadsLimiter);

// ── Static files (tenant-agnostic templates) ──────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "ich-will-schauen-was-besser-ist", "barber-demo")));
app.use("/admin",      express.static(path.join(__dirname, "..", "admin")));
app.use("/superadmin", express.static(path.join(__dirname, "..", "superadmin")));
app.use("/landing",    express.static(path.join(__dirname, "..", "landing")));
app.use("/vendor/lucide", express.static(path.join(__dirname, "..", "node_modules", "lucide", "dist", "umd")));

// Cancellation page — token is in the URL path, served as SPA
app.get("/cancel/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "cancel", "index.html"));
});

// ── Root-domain (barberbook.de with no subdomain → landing page) ─────────────
app.get("/", (req, res, next) => {
  const parts = req.hostname.split(".");
  // Root domain has ≤2 parts (e.g. barberbook.de); subdomains have ≥3
  if (parts.length <= 2 && req.hostname !== "localhost") {
    return res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
  }
  next();
});

// ── Super admin API (no tenant context needed) ────────────────────────────────
app.use("/api/superadmin", require("./routes/superadmin"));

// ── Self-cancellation API (no tenant context — keyed by cancellation_token) ──
app.use("/api/cancel", require("./routes/cancel"));

// ── Meta WhatsApp webhook (no tenant context — identified by phone number ID) ─
app.use("/api/webhook", require("./routes/webhook"));

// ── Tenant-scoped API routes ──────────────────────────────────────────────────
app.use("/api/salon",    tenant, require("./routes/salon"));
app.use("/api/services", tenant, require("./routes/services"));
app.use("/api/staff",    tenant, require("./routes/staff"));
app.use("/api/slots",    tenant, require("./routes/slots"));
app.use("/api/bookings", tenant, require("./routes/bookings"));
app.use("/api/admin",    tenant, require("./routes/admin"));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    require("./reminders");
    app.listen(PORT, () => {
      console.log(`Server running → http://localhost:${PORT}`);
      console.log(`Super admin  → http://localhost:${PORT}/superadmin`);
    });
  })
  .catch(err => {
    console.error("Database initialization failed:", err.message);
    process.exit(1);
  });


`````````````````````````````````````````nFILE: server/db.js
`````````````````````````````````````````nconst mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function initDb() {
  const conn = await pool.getConnection();
  try {
    // Migration: add WhatsApp columns to existing tables if missing
    // MySQL on Railway does not support ADD COLUMN IF NOT EXISTS — use separate try/catch
    for (const tbl of ["salons", "staff"]) {
      await conn.execute(`ALTER TABLE ${tbl} ADD COLUMN whatsapp_phone VARCHAR(30)`).catch(e => {
        if (e.code !== "ER_DUP_FIELDNAME") throw e; // ignore "column already exists"
      });
    }

    // salons is the root table — must come first
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS salons (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        name           VARCHAR(100) NOT NULL,
        slug           VARCHAR(100) UNIQUE NOT NULL,
        domain         VARCHAR(255),
        address        VARCHAR(255),
        phone          VARCHAR(30),
        city           VARCHAR(100),
        primary_color  VARCHAR(7)   NOT NULL DEFAULT '#c9a84c',
        logo_initials  VARCHAR(4)   NOT NULL DEFAULT 'NL',
        hero_img_url   VARCHAR(500),
        maps_url       VARCHAR(500),
        active         TINYINT      NOT NULL DEFAULT 1,
        created_at     DATETIME     NOT NULL DEFAULT NOW()
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        name      VARCHAR(100) NOT NULL,
        price     INT NOT NULL,
        duration  INT NOT NULL,
        active    TINYINT NOT NULL DEFAULT 1,
        CONSTRAINT fk_svc_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS staff (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        salon_id       INT NOT NULL,
        name           VARCHAR(100) NOT NULL,
        active         TINYINT NOT NULL DEFAULT 1,
        whatsapp_phone VARCHAR(30),
        CONSTRAINT fk_stf_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        \`key\`   VARCHAR(100) NOT NULL,
        value     TEXT NOT NULL,
        UNIQUE KEY uq_setting (salon_id, \`key\`),
        CONSTRAINT fk_set_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id                  INT PRIMARY KEY AUTO_INCREMENT,
        salon_id            INT NOT NULL,
        service_id          INT NOT NULL,
        staff_id            INT NOT NULL,
        date                DATE NOT NULL,
        time_slot           VARCHAR(5) NOT NULL,
        customer_name       VARCHAR(100) NOT NULL,
        customer_phone      VARCHAR(30) NOT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        cancellation_token  VARCHAR(36) UNIQUE,
        created_at          DATETIME NOT NULL DEFAULT NOW(),
        UNIQUE KEY uq_staff_slot (salon_id, staff_id, date, time_slot),
        CONSTRAINT fk_bk_salon   FOREIGN KEY (salon_id)   REFERENCES salons(id),
        CONSTRAINT fk_bk_service FOREIGN KEY (service_id) REFERENCES services(id),
        CONSTRAINT fk_bk_staff   FOREIGN KEY (staff_id)   REFERENCES staff(id)
      )
    `);

    // Migration: add cancellation_token if table already exists without it
    await conn.execute("ALTER TABLE bookings ADD COLUMN cancellation_token VARCHAR(36) UNIQUE").catch(e => {
      if (e.code !== "ER_DUP_FIELDNAME") throw e;
    });

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        staff_id  INT NOT NULL,
        date      DATE NOT NULL,
        time_slot VARCHAR(5) NOT NULL,
        reason    VARCHAR(255),
        UNIQUE KEY uq_block (salon_id, staff_id, date, time_slot),
        CONSTRAINT fk_bl_salon FOREIGN KEY (salon_id) REFERENCES salons(id),
        CONSTRAINT fk_bl_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id         INT PRIMARY KEY AUTO_INCREMENT,
        salon_name VARCHAR(150) NOT NULL,
        owner_name VARCHAR(100) NOT NULL,
        phone      VARCHAR(30)  NOT NULL,
        city       VARCHAR(100),
        created_at DATETIME NOT NULL DEFAULT NOW(),
        contacted  TINYINT NOT NULL DEFAULT 0
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id           INT PRIMARY KEY AUTO_INCREMENT,
        salon_id     INT NOT NULL,
        from_phone   VARCHAR(30)  NOT NULL,
        message_text TEXT         NOT NULL,
        intent       VARCHAR(20)  NOT NULL DEFAULT 'other',
        replied      TINYINT      NOT NULL DEFAULT 0,
        is_read      TINYINT      NOT NULL DEFAULT 0,
        created_at   DATETIME     NOT NULL DEFAULT NOW(),
        CONSTRAINT fk_wam_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    // ── Seed demo salon if empty ──────────────────────────────────────────────
    const [[{ n: salonCount }]] = await conn.execute("SELECT COUNT(*) as n FROM salons");
    if (salonCount > 0) return; // already seeded

    const [salonResult] = await conn.execute(
      `INSERT INTO salons (name, slug, address, phone, city, primary_color, logo_initials, hero_img_url, maps_url)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        "Next Level Salon",
        "next-level-salon",
        "Barer Straße 68, 80799 München",
        "+4989123456",
        "München",
        "#c9a84c",
        "NL",
        "https://cdn1.treatwell.net/images/view/v2.i15345598.w1080.h720.x16FB2A17/",
        "https://www.google.com/maps?q=Barer%20Stra%C3%9Fe%2068%20M%C3%BCnchen",
      ]
    );
    const sid = salonResult.insertId;

    const insService = `INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)`;
    for (const [n, p, d] of [
      ["Herrenhaarschnitt", 25, 30],
      ["Herrenhaarschnitt + Bart", 35, 45],
      ["Bartpflege & Styling", 18, 20],
      ["Bartrasur (klassisch)", 22, 25],
      ["Damenhaarschnitt", 30, 40],
      ["Kinder (bis 12 J.)", 15, 20],
      ["Haarpflege & Maske", 20, 20],
      ["Komplett-Paket", 50, 70],
    ]) await conn.execute(insService, [sid, n, p, d]);

    for (const name of ["Ali", "Mehmet", "Karim"]) {
      await conn.execute("INSERT INTO staff (salon_id, name) VALUES (?,?)", [sid, name]);
    }

    const hours = JSON.stringify({
      0: null, 1: [9.5, 19], 2: [9.5, 19], 3: [9, 19],
      4: [9, 19], 5: [9.5, 19], 6: [9, 17],
    });
    await conn.execute(
      "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?)",
      [sid, "hours", hours, sid, "admin_password", "barber123", sid, "twilio_enabled", "false", sid, "salon_phone", "+4989123456"]
    );
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDb };


`````````````````````````````````````````nFILE: server/messaging.js
`````````````````````````````````````````n/**
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

async function sendWhatsAppText({ to, salonId, message }) {
  return sendWhatsApp({ to, salonId, message });
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
  const baseUrl = salon.domain
    ? `https://${salon.domain}`
    : `https://claude-barber-production.up.railway.app`;
  const cancelUrl = booking.cancellation_token
    ? `${baseUrl}/cancel/${booking.cancellation_token}`
    : null;

  await sendWhatsApp({
    to: booking.customer_phone,
    salonId,
    message:
      `✅ Termin bestätigt bei ${salon.name}!\n\n` +
      `📅 ${formatDate(booking.date)} um ${booking.time_slot} Uhr\n` +
      `✂️ ${service.name} · ${service.duration} Min. · ${service.price} €\n` +
      `👤 ${staff.name}\n` +
      `📍 ${salon.address}\n\n` +
      (cancelUrl ? `❌ Termin absagen: ${cancelUrl}\n\n` : "") +
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
  sendWhatsAppText,
  refreshWabaToken,
  refreshExpiringTokens,
};


`````````````````````````````````````````nFILE: server/ai.js
`````````````````````````````````````````n/**
 * AI-powered message classification using Claude Haiku.
 * Falls back to keyword matching if ANTHROPIC_API_KEY is not set.
 *
 * Returns: "book" | "cancel" | "other"
 */

const Anthropic = require("@anthropic-ai/sdk");

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const SYSTEM_PROMPT = `You are a message classifier for a barbershop / hair salon booking system.
A customer just sent a WhatsApp message. Classify it into exactly one of these three categories:

- book   → customer wants to make, schedule, or inquire about booking a new appointment
- cancel → customer wants to cancel, reschedule, or remove an existing appointment
- other  → anything else: questions about prices, hours, directions, complaints, greetings, thanks, unclear messages, etc.

Rules:
- Reply with exactly one word: book, cancel, or other
- No punctuation, no explanation
- When in doubt, prefer "other" so a human can handle it`;

async function classifyWithAI(text) {
  const ai = getClient();
  if (!ai) return null; // no key → fall back to keywords

  try {
    const msg = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 5,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    const result = msg.content[0]?.text?.trim().toLowerCase();
    if (result === "book" || result === "cancel" || result === "other") return result;
    return "other"; // unexpected output → safe default
  } catch (err) {
    console.error("[ai] classifyIntent failed:", err.message);
    return null; // failure → fall back to keywords
  }
}

// Keyword fallback — used when AI is unavailable
// More specific phrases first to avoid false positives (e.g. "heute" alone is too broad)
const CANCEL_KEYWORDS = [
  "absagen", "absage", "abgesagt", "sagt ab", "termin ab", "sage ab",
  "stornieren", "storno", "storniert",
  "abmelden", "abbestellen",
  "verschieben", "umbuchen", "umplanen",
  "cancel", "nicht mehr kommen", "kann nicht kommen", "kann leider nicht",
  "muss leider absagen", "komme nicht",
];
const BOOK_KEYWORDS = [
  "termin buchen", "termin machen", "termin anfragen", "termin reserv",
  "buchen", "buchung", "reservier", "appointment", "book",
  "noch was frei", "noch frei", "noch platz frei", "noch ein platz",
  "verfügbar", "nächste woche", "diese woche",
  "wann kann ich", "wann habt ihr noch",
  "hätte gerne", "würde gerne",
];

function classifyWithKeywords(text) {
  const lower = text.toLowerCase();
  if (CANCEL_KEYWORDS.some(kw => lower.includes(kw))) return "cancel";
  if (BOOK_KEYWORDS.some(kw => lower.includes(kw)))   return "book";
  return "other";
}

async function classifyIntent(text) {
  const aiResult = await classifyWithAI(text);
  if (aiResult !== null) return aiResult;
  return classifyWithKeywords(text);
}

module.exports = { classifyIntent };


`````````````````````````````````````````nFILE: server/reminders.js
`````````````````````````````````````````nconst cron = require("node-cron");
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


`````````````````````````````````````````nFILE: server/middleware/tenant.js
`````````````````````````````````````````nconst { pool } = require("../db");

module.exports = async function tenantMiddleware(req, res, next) {
  try {
    let salon = null;

    // 1. Dev override: SALON_SLUG env var makes every request hit the same salon
    if (process.env.SALON_SLUG) {
      const [[row]] = await pool.execute(
        "SELECT * FROM salons WHERE slug = ? AND active = 1",
        [process.env.SALON_SLUG]
      );
      salon = row || null;
    }

    if (!salon) {
      const host = req.hostname; // e.g. nextelevel.barberbook.de or localhost

      // 2. Match exact custom domain (clients who bring their own domain)
      const [[byDomain]] = await pool.execute(
        "SELECT * FROM salons WHERE domain = ? AND active = 1",
        [host]
      );
      salon = byDomain || null;

      // 3. Match subdomain slug (nextelevel.barberbook.de → slug "nextelevel")
      if (!salon) {
        const parts = host.split(".");
        if (parts.length >= 2) {
          const slug = parts[0];
          const [[bySlug]] = await pool.execute(
            "SELECT * FROM salons WHERE slug = ? AND active = 1",
            [slug]
          );
          salon = bySlug || null;
        }
      }
    }

    if (!salon) {
      return res.status(404).json({ error: "Salon not found" });
    }

    req.salon = salon;
    next();
  } catch (err) {
    next(err);
  }
};


`````````````````````````````````````````nFILE: server/middleware/validate.js
`````````````````````````````````````````nconst { body, param, validationResult } = require("express-validator");

function rejectIfInvalid(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
}

const rules = {
  booking: [
    body("customerName")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
    body("customerPhone")
      .trim().notEmpty().withMessage("Telefonnummer ist erforderlich")
      .matches(/^\+?[\d\s\-().]{6,20}$/).withMessage("Ungültige Telefonnummer"),
    body("date")
      .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("Ungültiges Datum"),
    body("timeSlot")
      .matches(/^\d{2}:\d{2}$/).withMessage("Ungültige Uhrzeit"),
    body("serviceId")
      .isInt({ min: 1 }).withMessage("Ungültige Service-ID"),
    body("staffId")
      .isInt({ min: 0 }).withMessage("Ungültige Mitarbeiter-ID"),
  ],

  login: [
    body("password")
      .notEmpty().withMessage("Passwort erforderlich")
      .isLength({ max: 200 }).withMessage("Eingabe zu lang"),
  ],

  addService: [
    body("name")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
    body("price")
      .isFloat({ min: 0.01, max: 10000 }).withMessage("Ungültiger Preis"),
    body("duration")
      .isInt({ min: 5, max: 480 }).withMessage("Dauer muss zwischen 5 und 480 Minuten liegen"),
  ],

  addStaff: [
    body("name")
      .trim().notEmpty().withMessage("Name ist erforderlich")
      .isLength({ max: 100 }).withMessage("Name zu lang"),
  ],

  updateSalon: [
    body("name").optional().trim().isLength({ max: 100 }).withMessage("Name zu lang"),
    body("address").optional().trim().isLength({ max: 200 }).withMessage("Adresse zu lang"),
    body("phone").optional().trim()
      .matches(/^(\+?[\d\s\-().]{0,20})?$/).withMessage("Ungültige Telefonnummer"),
    body("city").optional().trim().isLength({ max: 100 }).withMessage("Stadt zu lang"),
    body("hero_img_url").optional({ checkFalsy: true })
      .isURL({ protocols: ["https"] }).withMessage("Bild-URL muss HTTPS sein"),
    body("maps_url").optional({ checkFalsy: true })
      .isURL({ protocols: ["https"] }).withMessage("Maps-URL muss HTTPS sein"),
  ],

  changePassword: [
    body("newPassword")
      .isLength({ min: 6, max: 200 }).withMessage("Passwort muss mindestens 6 Zeichen haben"),
  ],

  idParam: [
    param("id").isInt({ min: 1 }).withMessage("Ungültige ID"),
  ],
};

module.exports = { rules, rejectIfInvalid };


`````````````````````````````````````````nFILE: server/routes/admin.js
`````````````````````````````````````````nconst router  = require("express").Router();
const bcrypt  = require("bcryptjs");
const { pool } = require("../db");
const { rules, rejectIfInvalid } = require("../middleware/validate");
const { refreshWabaToken } = require("../messaging");

async function auth(req, res, next) {
  const token   = req.headers["x-admin-token"];
  const salonId = req.salon.id;
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'admin_password'",
    [salonId]
  );
  if (!token || !row?.value) return res.status(401).json({ error: "Unauthorized" });
  const valid = await bcrypt.compare(token, row.value);
  if (!valid) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// POST /api/admin/login
router.post("/login", rules.login, rejectIfInvalid, async (req, res) => {
  const { password } = req.body;
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'admin_password'",
    [req.salon.id]
  );
  if (!row?.value) return res.status(401).json({ error: "Wrong password" });
  const valid = await bcrypt.compare(password, row.value);
  if (!valid) return res.status(401).json({ error: "Wrong password" });
  res.json({ token: password });
});

// GET /api/admin/bookings?date=YYYY-MM-DD&status=...
router.get("/bookings", auth, async (req, res) => {
  const { date, status } = req.query;
  let sql = `
    SELECT b.id, b.salon_id, b.service_id, b.staff_id, b.time_slot, b.status,
           b.customer_name, b.customer_phone, b.created_at,
           DATE_FORMAT(b.date, '%Y-%m-%d') as date,
           s.name as service_name, s.price, s.duration, st.name as staff_name
    FROM bookings b
    JOIN services s  ON b.service_id = s.id
    JOIN staff    st ON b.staff_id   = st.id
    WHERE b.salon_id = ?
  `;
  const params = [req.salon.id];
  if (date)   { sql += " AND b.date = ?";   params.push(date); }
  if (status) { sql += " AND b.status = ?"; params.push(status); }
  sql += " ORDER BY b.date, b.time_slot";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

// GET /api/admin/bookings/today
router.get("/bookings/today", auth, async (req, res) => {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [rows] = await pool.execute(`
    SELECT b.id, b.salon_id, b.service_id, b.staff_id, b.time_slot, b.status,
           b.customer_name, b.customer_phone, b.created_at,
           DATE_FORMAT(b.date, '%Y-%m-%d') as date,
           s.name as service_name, s.price, s.duration, st.name as staff_name
    FROM bookings b
    JOIN services s  ON b.service_id = s.id
    JOIN staff    st ON b.staff_id   = st.id
    WHERE b.salon_id = ? AND b.date = ? AND b.status != 'cancelled'
    ORDER BY b.time_slot
  `, [req.salon.id, today]);
  res.json(rows);
});

// PATCH /api/admin/bookings/:id
router.patch("/bookings/:id", auth, async (req, res) => {
  const { status } = req.body;
  const allowed = ["confirmed", "done", "no-show", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  const id = Number(req.params.id);
  await pool.execute(
    "UPDATE bookings SET status = ? WHERE id = ? AND salon_id = ?",
    [status, id, req.salon.id]
  );
  const [[updated]] = await pool.execute("SELECT * FROM bookings WHERE id = ?", [id]);
  res.json(updated);
});

// DELETE /api/admin/bookings/:id
router.delete("/bookings/:id", auth, async (req, res) => {
  await pool.execute(
    "UPDATE bookings SET status = 'cancelled' WHERE id = ? AND salon_id = ?",
    [Number(req.params.id), req.salon.id]
  );
  res.json({ ok: true });
});

// GET /api/admin/blocked-slots?date=YYYY-MM-DD
router.get("/blocked-slots", auth, async (req, res) => {
  const { date } = req.query;
  let sql = `
    SELECT bs.*, st.name as staff_name
    FROM blocked_slots bs
    LEFT JOIN staff st ON bs.staff_id = st.id
    WHERE bs.salon_id = ?
  `;
  const params = [req.salon.id];
  if (date) { sql += " AND bs.date = ?"; params.push(date); }
  sql += " ORDER BY bs.date, bs.time_slot";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

// POST /api/admin/blocked-slots
router.post("/blocked-slots", auth, async (req, res) => {
  const { staffId, date, timeSlot, reason } = req.body;
  try {
    if (Number(staffId) === 0) {
      // "All staff" — insert one row per active staff member so slot checker picks it up
      const [staffRows] = await pool.execute(
        "SELECT id FROM staff WHERE salon_id = ? AND active = 1",
        [req.salon.id]
      );
      for (const { id } of staffRows) {
        await pool.execute(
          `INSERT INTO blocked_slots (salon_id, staff_id, date, time_slot, reason) VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
          [req.salon.id, id, date, timeSlot, reason || null]
        );
      }
    } else {
      await pool.execute(
        `INSERT INTO blocked_slots (salon_id, staff_id, date, time_slot, reason) VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
        [req.salon.id, Number(staffId), date, timeSlot, reason || null]
      );
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/admin/blocked-slots
router.delete("/blocked-slots", auth, async (req, res) => {
  const { staffId, date, timeSlot } = req.body;
  if (Number(staffId) === 0) {
    // Delete all staff's blocks at this slot
    await pool.execute(
      "DELETE FROM blocked_slots WHERE salon_id = ? AND date = ? AND time_slot = ?",
      [req.salon.id, date, timeSlot]
    );
  } else {
    await pool.execute(
      "DELETE FROM blocked_slots WHERE salon_id = ? AND staff_id = ? AND date = ? AND time_slot = ?",
      [req.salon.id, Number(staffId), date, timeSlot]
    );
  }
  res.json({ ok: true });
});

// GET /api/admin/stats
router.get("/stats", auth, async (req, res) => {
  const sid = req.salon.id;
  const fmt = d => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
  const today = fmt(new Date());
  const todayMidnight = new Date(today + "T00:00:00");
  const dow = todayMidnight.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const weekStartDate = new Date(todayMidnight);
  weekStartDate.setDate(weekStartDate.getDate() - daysFromMon);
  const ws = weekStartDate.toISOString().slice(0, 10);

  const [
    [[{ n: todayCount }]],
    [[{ t: todayRevenue }]],
    [[{ n: weekCount }]],
    [[{ t: weekRevenue }]],
    [[{ n: totalBookings }]],
  ] = await Promise.all([
    pool.execute("SELECT COUNT(*) as n FROM bookings WHERE salon_id=? AND date=? AND status!='cancelled'", [sid, today]),
    pool.execute("SELECT COALESCE(SUM(s.price),0) as t FROM bookings b JOIN services s ON b.service_id=s.id WHERE b.salon_id=? AND b.date=? AND b.status='done'", [sid, today]),
    pool.execute("SELECT COUNT(*) as n FROM bookings WHERE salon_id=? AND date>=? AND status!='cancelled'", [sid, ws]),
    pool.execute("SELECT COALESCE(SUM(s.price),0) as t FROM bookings b JOIN services s ON b.service_id=s.id WHERE b.salon_id=? AND b.date>=? AND b.status='done'", [sid, ws]),
    pool.execute("SELECT COUNT(*) as n FROM bookings WHERE salon_id=? AND status!='cancelled'", [sid]),
  ]);
  res.json({ todayCount, todayRevenue, weekCount, weekRevenue, totalBookings });
});

// GET /api/admin/services
router.get("/services", auth, async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM services WHERE salon_id = ? ORDER BY id", [req.salon.id]);
  res.json(rows);
});

router.patch("/services/:id", auth, async (req, res) => {
  const { name, price, duration, active } = req.body;
  const id = Number(req.params.id);
  await pool.execute(
    "UPDATE services SET name=COALESCE(?,name), price=COALESCE(?,price), duration=COALESCE(?,duration), active=COALESCE(?,active) WHERE id=? AND salon_id=?",
    [name ?? null, price ?? null, duration ?? null, active ?? null, id, req.salon.id]
  );
  const [[updated]] = await pool.execute("SELECT * FROM services WHERE id=?", [id]);
  res.json(updated);
});

// GET /api/admin/staff
router.get("/staff", auth, async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM staff WHERE salon_id = ? ORDER BY id", [req.salon.id]);
  res.json(rows);
});

router.patch("/staff/:id", auth, async (req, res) => {
  const { name, active, whatsapp_phone } = req.body;
  const id = Number(req.params.id);
  if (whatsapp_phone !== undefined) {
    // Handle phone update separately so empty string can clear the field
    await pool.execute(
      "UPDATE staff SET name=COALESCE(?,name), active=COALESCE(?,active), whatsapp_phone=? WHERE id=? AND salon_id=?",
      [name ?? null, active ?? null, whatsapp_phone.trim() || null, id, req.salon.id]
    );
  } else {
    await pool.execute(
      "UPDATE staff SET name=COALESCE(?,name), active=COALESCE(?,active) WHERE id=? AND salon_id=?",
      [name ?? null, active ?? null, id, req.salon.id]
    );
  }
  const [[updated]] = await pool.execute("SELECT * FROM staff WHERE id=?", [id]);
  res.json(updated);
});

// GET /api/admin/whatsapp-settings
router.get("/whatsapp-settings", auth, async (req, res) => {
  const keys = ["whatsapp_enabled", "meta_phone_number_id", "meta_waba_token", "meta_webhook_verify_token", "meta_waba_token_expires"];
  const [rows] = await pool.execute(
    `SELECT \`key\`, value FROM settings WHERE salon_id = ? AND \`key\` IN (${keys.map(() => "?").join(",")})`,
    [req.salon.id, ...keys]
  );
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

// PATCH /api/admin/whatsapp-settings
router.patch("/whatsapp-settings", auth, async (req, res) => {
  const { key, value } = req.body;
  const allowed = ["whatsapp_enabled", "meta_phone_number_id", "meta_waba_token", "meta_webhook_verify_token"];
  if (!allowed.includes(key)) return res.status(400).json({ error: "Invalid key" });
  await pool.execute(
    "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [req.salon.id, key, value]
  );
  // When a new token is saved, immediately exchange it for a 60-day token
  if (key === "meta_waba_token") {
    refreshWabaToken(req.salon.id).catch(e =>
      console.error("[whatsapp] token exchange on save failed:", e.message)
    );
  }
  res.json({ ok: true });
});

// POST /api/admin/services — add new service
router.post("/services", auth, rules.addService, rejectIfInvalid, async (req, res) => {
  const { name, price, duration } = req.body;
  if (!name || !price || !duration) return res.status(400).json({ error: "name, price and duration required" });
  const [result] = await pool.execute(
    "INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)",
    [req.salon.id, name.trim(), Number(price), Number(duration)]
  );
  const [[created]] = await pool.execute("SELECT * FROM services WHERE id=?", [result.insertId]);
  res.status(201).json(created);
});

// DELETE /api/admin/services/:id
router.delete("/services/:id", auth, async (req, res) => {
  await pool.execute("DELETE FROM services WHERE id=? AND salon_id=?", [Number(req.params.id), req.salon.id]);
  res.json({ ok: true });
});

// POST /api/admin/staff — add new staff member
router.post("/staff", auth, rules.addStaff, rejectIfInvalid, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const [result] = await pool.execute(
    "INSERT INTO staff (salon_id, name) VALUES (?,?)",
    [req.salon.id, name.trim()]
  );
  const [[created]] = await pool.execute("SELECT * FROM staff WHERE id=?", [result.insertId]);
  res.status(201).json(created);
});

// DELETE /api/admin/staff/:id
router.delete("/staff/:id", auth, async (req, res) => {
  await pool.execute("DELETE FROM staff WHERE id=? AND salon_id=?", [Number(req.params.id), req.salon.id]);
  res.json({ ok: true });
});

// GET /api/admin/salon — salon public info
router.get("/salon", auth, async (req, res) => {
  const s = req.salon;
  res.json({
    name: s.name, address: s.address, phone: s.phone,
    city: s.city, hero_img_url: s.hero_img_url, maps_url: s.maps_url,
    logo_initials: s.logo_initials, primary_color: s.primary_color,
  });
});

// PATCH /api/admin/salon — update salon public info
router.patch("/salon", auth, rules.updateSalon, rejectIfInvalid, async (req, res) => {
  const { name, address, phone, city, hero_img_url, maps_url, logo_initials, primary_color } = req.body;
  await pool.execute(
    `UPDATE salons SET
      name=COALESCE(?,name), address=COALESCE(?,address), phone=COALESCE(?,phone),
      city=COALESCE(?,city), hero_img_url=COALESCE(?,hero_img_url), maps_url=COALESCE(?,maps_url),
      logo_initials=COALESCE(?,logo_initials), primary_color=COALESCE(?,primary_color)
     WHERE id=?`,
    [name||null, address||null, phone||null, city||null, hero_img_url||null, maps_url||null,
     logo_initials||null, primary_color||null, req.salon.id]
  );
  res.json({ ok: true });
});

// GET /api/admin/hours
router.get("/hours", auth, async (req, res) => {
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id=? AND `key`='hours'", [req.salon.id]
  );
  res.json(row ? JSON.parse(row.value) : {});
});

// PATCH /api/admin/hours
router.patch("/hours", auth, async (req, res) => {
  const hours = req.body;
  await pool.execute(
    "INSERT INTO settings (salon_id,`key`,value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [req.salon.id, "hours", JSON.stringify(hours)]
  );
  res.json({ ok: true });
});

// GET /api/admin/messages — WhatsApp inbox
router.get("/messages", auth, async (req, res) => {
  const { unread } = req.query;
  let sql = `
    SELECT id, from_phone, message_text, intent, replied, is_read, created_at
    FROM whatsapp_messages
    WHERE salon_id = ?
  `;
  const params = [req.salon.id];
  if (unread === "1") { sql += " AND is_read = 0"; }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
});

// GET /api/admin/messages/unread-count
router.get("/messages/unread-count", auth, async (req, res) => {
  const [[{ n }]] = await pool.execute(
    "SELECT COUNT(*) as n FROM whatsapp_messages WHERE salon_id = ? AND is_read = 0",
    [req.salon.id]
  );
  res.json({ count: n });
});

// PATCH /api/admin/messages/:id/read
router.patch("/messages/:id/read", auth, async (req, res) => {
  await pool.execute(
    "UPDATE whatsapp_messages SET is_read = 1 WHERE id = ? AND salon_id = ?",
    [Number(req.params.id), req.salon.id]
  );
  res.json({ ok: true });
});

// PATCH /api/admin/messages/read-all
router.patch("/messages/read-all", auth, async (req, res) => {
  await pool.execute(
    "UPDATE whatsapp_messages SET is_read = 1 WHERE salon_id = ?",
    [req.salon.id]
  );
  res.json({ ok: true });
});

// PATCH /api/admin/password
router.patch("/password", auth, rules.changePassword, rejectIfInvalid, async (req, res) => {
  const { newPassword } = req.body;
  const hash = await bcrypt.hash(newPassword, 12);
  await pool.execute(
    "INSERT INTO settings (salon_id,`key`,value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [req.salon.id, "admin_password", hash]
  );
  res.json({ ok: true });
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/bookings.js
`````````````````````````````````````````nconst router = require("express").Router();
const crypto = require("crypto");
const { pool } = require("../db");
const { sendBookingConfirmationToCustomer, sendBookingAlertToStaff } = require("../messaging");
const { rules, rejectIfInvalid } = require("../middleware/validate");

router.post("/", rules.booking, rejectIfInvalid, async (req, res) => {
  const { serviceId, staffId, date, timeSlot, customerName, customerPhone } = req.body;
  const salonId = req.salon.id;

  if (!serviceId || !date || !timeSlot || !customerName || !customerPhone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1",
    [Number(serviceId), salonId]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [allStaffRows] = await pool.execute(
    "SELECT id FROM staff WHERE salon_id = ? AND active = 1",
    [salonId]
  );
  const allStaff = allStaffRows.map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  const [takenRows] = await pool.execute(
    "SELECT staff_id FROM bookings WHERE salon_id = ? AND date = ? AND time_slot = ? AND status != 'cancelled'",
    [salonId, date, timeSlot]
  );
  const [blockedRows] = await pool.execute(
    "SELECT staff_id FROM blocked_slots WHERE salon_id = ? AND date = ? AND time_slot = ?",
    [salonId, date, timeSlot]
  );

  const busy = new Set([...takenRows.map(r => r.staff_id), ...blockedRows.map(r => r.staff_id)]);
  const assignedStaff = targetStaff.find(id => !busy.has(id));
  if (!assignedStaff) return res.status(409).json({ error: "Slot no longer available" });

  // Per-customer booking limit
  const [[limitRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'max_bookings_per_customer'",
    [salonId]
  );
  const limit = limitRow ? Number(limitRow.value) : 3;
  const [[{ n: activeCount }]] = await pool.execute(
    "SELECT COUNT(*) as n FROM bookings WHERE salon_id = ? AND customer_phone = ? AND status = 'confirmed' AND date >= CURDATE()",
    [salonId, customerPhone.trim()]
  );
  if (activeCount >= limit) {
    return res.status(409).json({ error: `Maximale Anzahl von ${limit} aktiven Buchungen pro Kunde erreicht.` });
  }

  try {
    const cancelToken = crypto.randomUUID();
    const [result] = await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token) VALUES (?,?,?,?,?,?,?,?)",
      [salonId, service.id, assignedStaff, date, timeSlot, customerName.trim(), customerPhone.trim(), cancelToken]
    );
    const [[booking]]  = await pool.execute("SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM bookings WHERE id = ?", [result.insertId]);
    const [[staffRow]] = await pool.execute("SELECT * FROM staff WHERE id = ?", [assignedStaff]);
    const [[salon]]    = await pool.execute("SELECT * FROM salons WHERE id = ?", [salonId]);

    // Fire-and-forget: customer confirmation + staff alert via WhatsApp
    sendBookingConfirmationToCustomer({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});
    sendBookingAlertToStaff({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});

    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slot no longer available" });
    throw e;
  }
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/cancel.js
`````````````````````````````````````````nconst router = require("express").Router();
const { pool } = require("../db");

// GET /api/cancel/:token — fetch booking details for the cancel page
router.get("/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length !== 36) return res.status(400).json({ error: "Ungültiger Link." });

  const [[row]] = await pool.execute(`
    SELECT b.id, b.status, DATE_FORMAT(b.date, '%Y-%m-%d') as date, b.time_slot,
           s.name as service_name, s.duration, s.price,
           st.name as staff_name,
           sal.name as salon_name, sal.logo_initials, sal.primary_color
    FROM bookings b
    JOIN services s  ON b.service_id = s.id
    JOIN staff    st ON b.staff_id   = st.id
    JOIN salons   sal ON b.salon_id  = sal.id
    WHERE b.cancellation_token = ?
  `, [token]);

  if (!row) return res.status(404).json({ error: "Buchung nicht gefunden." });
  if (row.status === "cancelled") return res.status(410).json({ error: "Dieser Termin wurde bereits abgesagt." });
  if (row.status === "done")      return res.status(410).json({ error: "Dieser Termin ist bereits abgeschlossen." });

  res.json({
    booking: { id: row.id, date: row.date, time_slot: row.time_slot, status: row.status },
    service: { name: row.service_name, duration: row.duration, price: row.price },
    staff:   { name: row.staff_name },
    salon:   { name: row.salon_name, logo_initials: row.logo_initials, primary_color: row.primary_color },
  });
});

// POST /api/cancel/:token — perform the cancellation
router.post("/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length !== 36) return res.status(400).json({ error: "Ungültiger Link." });

  const [[row]] = await pool.execute(
    "SELECT id, status FROM bookings WHERE cancellation_token = ?",
    [token]
  );

  if (!row) return res.status(404).json({ error: "Buchung nicht gefunden." });
  if (row.status === "cancelled") return res.status(410).json({ error: "Dieser Termin wurde bereits abgesagt." });
  if (row.status === "done")      return res.status(410).json({ error: "Dieser Termin ist bereits abgeschlossen und kann nicht mehr abgesagt werden." });

  await pool.execute(
    "UPDATE bookings SET status = 'cancelled' WHERE id = ?",
    [row.id]
  );

  res.json({ ok: true });
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/slots.js
`````````````````````````````````````````nconst router = require("express").Router();
const { pool } = require("../db");

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

router.get("/", async (req, res) => {
  const { date, serviceId, staffId } = req.query;
  const salonId = req.salon.id;

  if (!date || !serviceId) return res.status(400).json({ error: "date and serviceId required" });

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1",
    [Number(serviceId), salonId]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [[hoursRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'hours'",
    [salonId]
  );
  if (!hoursRow?.value) return res.json([]);
  let hours;
  try { hours = JSON.parse(hoursRow.value); } catch { return res.json([]); }

  const dow = new Date(date + "T12:00:00").getDay();
  const dayHours = hours[dow];
  if (!Array.isArray(dayHours) || dayHours.length < 2) return res.json([]);

  const [open, close] = dayHours;
  const durationH = service.duration / 60;
  const allSlots = [];
  for (let t = open; t + durationH <= close; t += 0.5) {
    allSlots.push(decimalToTime(t));
  }

  const [allStaffRows] = await pool.execute(
    "SELECT id FROM staff WHERE salon_id = ? AND active = 1",
    [salonId]
  );
  const allStaff = allStaffRows.map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  const [takenBookings] = await pool.execute(
    "SELECT staff_id, time_slot FROM bookings WHERE salon_id = ? AND date = ? AND status != 'cancelled'",
    [salonId, date]
  );
  const [takenBlocked] = await pool.execute(
    "SELECT staff_id, time_slot FROM blocked_slots WHERE salon_id = ? AND date = ?",
    [salonId, date]
  );

  const takenByStaff = {};
  [...takenBookings, ...takenBlocked].forEach(({ staff_id, time_slot }) => {
    if (!takenByStaff[staff_id]) takenByStaff[staff_id] = new Set();
    takenByStaff[staff_id].add(time_slot);
  });

  res.json(allSlots.map(slot => ({
    time: slot,
    available: targetStaff.some(sid => !(takenByStaff[sid] || new Set()).has(slot)),
  })));
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/webhook.js
`````````````````````````````````````````n/**
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


`````````````````````````````````````````nFILE: server/routes/salon.js
`````````````````````````````````````````nconst router = require("express").Router();
const { pool } = require("../db");

// GET /api/salon  — public salon info used by the customer frontend
router.get("/", async (req, res) => {
  const { id } = req.salon;

  const [[hoursRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'hours'",
    [id]
  );
  const hours = hoursRow ? JSON.parse(hoursRow.value) : {};

  const s = req.salon;
  res.json({
    name:         s.name,
    slug:         s.slug,
    address:      s.address,
    phone:        s.phone,
    city:         s.city,
    primaryColor: s.primary_color,
    logoInitials: s.logo_initials,
    heroImgUrl:   s.hero_img_url,
    mapsUrl:      s.maps_url,
    hours,
  });
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/services.js
`````````````````````````````````````````nconst router = require("express").Router();
const { pool } = require("../db");

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM services WHERE salon_id = ? AND active = 1 ORDER BY id",
    [req.salon.id]
  );
  res.json(rows);
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/staff.js
`````````````````````````````````````````nconst router = require("express").Router();
const { pool } = require("../db");

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM staff WHERE salon_id = ? AND active = 1 ORDER BY id",
    [req.salon.id]
  );
  res.json(rows);
});

module.exports = router;


`````````````````````````````````````````nFILE: server/routes/superadmin.js
`````````````````````````````````````````nconst router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");

function superAuth(req, res, next) {
  const token = req.headers["x-super-token"];
  if (!process.env.SUPER_ADMIN_PASSWORD || token !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// POST /api/superadmin/login
router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password && password === process.env.SUPER_ADMIN_PASSWORD) {
    res.json({ token: process.env.SUPER_ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});

// GET /api/superadmin/salons
router.get("/salons", superAuth, async (req, res) => {
  const [rows] = await pool.execute(`
    SELECT s.*,
      (SELECT COUNT(*) FROM bookings b WHERE b.salon_id = s.id AND b.status != 'cancelled') AS booking_count
    FROM salons s
    ORDER BY s.created_at DESC
  `);
  res.json(rows);
});

// POST /api/superadmin/salons  — create a new salon
router.post("/salons", superAuth, async (req, res) => {
  const {
    name, slug, address, phone, city,
    primaryColor, logoInitials, heroImgUrl, mapsUrl, adminPassword,
  } = req.body;

  if (!name || !slug) return res.status(400).json({ error: "name and slug are required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO salons (name, slug, address, phone, city, primary_color, logo_initials, hero_img_url, maps_url)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        name, slug,
        address    || null,
        phone      || null,
        city       || null,
        primaryColor  || "#c9a84c",
        logoInitials  || name.slice(0, 2).toUpperCase(),
        heroImgUrl || null,
        mapsUrl    || null,
      ]
    );
    const salonId = result.insertId;

    const hours = JSON.stringify({
      0: null, 1: [9.5, 19], 2: [9.5, 19], 3: [9, 19],
      4: [9, 19], 5: [9.5, 19], 6: [9, 17],
    });
    const pwHash = await bcrypt.hash(adminPassword || "barber123", 12);
    await conn.execute(
      "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?)",
      [
        salonId, "hours",           hours,
        salonId, "admin_password",  pwHash,
        salonId, "twilio_enabled",  "false",
        salonId, "salon_phone",     phone || "",
      ]
    );

    await conn.commit();
    const [[salon]] = await conn.execute("SELECT * FROM salons WHERE id = ?", [salonId]);
    res.status(201).json(salon);
  } catch (e) {
    await conn.rollback();
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slug already exists" });
    throw e;
  } finally {
    conn.release();
  }
});

// PATCH /api/superadmin/salons/:id  — update salon or toggle active
router.patch("/salons/:id", superAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, address, phone, city, primaryColor, logoInitials, heroImgUrl, mapsUrl, domain, active } = req.body;

  await pool.execute(
    `UPDATE salons SET
      name          = COALESCE(?, name),
      address       = COALESCE(?, address),
      phone         = COALESCE(?, phone),
      city          = COALESCE(?, city),
      primary_color = COALESCE(?, primary_color),
      logo_initials = COALESCE(?, logo_initials),
      hero_img_url  = COALESCE(?, hero_img_url),
      maps_url      = COALESCE(?, maps_url),
      domain        = COALESCE(?, domain),
      active        = COALESCE(?, active)
    WHERE id = ?`,
    [
      name ?? null, address ?? null, phone ?? null, city ?? null,
      primaryColor ?? null, logoInitials ?? null, heroImgUrl ?? null,
      mapsUrl ?? null, domain ?? null,
      active != null ? (active ? 1 : 0) : null,
      id,
    ]
  );

  const [[salon]] = await pool.execute("SELECT * FROM salons WHERE id = ?", [id]);
  res.json(salon);
});

// POST /api/leads — public, no auth required (from landing page contact form)
router.post("/leads", async (req, res) => {
  const { salonName, ownerName, phone, city } = req.body;
  if (!salonName || !ownerName || !phone) {
    return res.status(400).json({ error: "salonName, ownerName and phone are required" });
  }
  await pool.execute(
    "INSERT INTO leads (salon_name, owner_name, phone, city) VALUES (?,?,?,?)",
    [salonName.trim(), ownerName.trim(), phone.trim(), (city || "").trim() || null]
  );
  res.status(201).json({ ok: true });
});

// GET /api/superadmin/leads
router.get("/leads", superAuth, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM leads ORDER BY created_at DESC"
  );
  res.json(rows);
});

// PATCH /api/superadmin/leads/:id — mark contacted
router.patch("/leads/:id", superAuth, async (req, res) => {
  const { contacted } = req.body;
  await pool.execute(
    "UPDATE leads SET contacted = ? WHERE id = ?",
    [contacted ? 1 : 0, Number(req.params.id)]
  );
  res.json({ ok: true });
});

module.exports = router;


`````````````````````````````````````````nFILE: admin/admin.js
`````````````````````````````````````````nconst API = "/api/admin";
let TOKEN = localStorage.getItem("admin_token") || "";

function esc(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── BOOT ──
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  if (TOKEN) showDashboard();

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("passwordInput").value;
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      const { token } = await res.json();
      TOKEN = token;
      localStorage.setItem("admin_token", token);
      showDashboard();
    } else {
      document.getElementById("loginError").classList.remove("hidden");
    }
  });
});

function authHeaders() {
  return { "Content-Type": "application/json", "x-admin-token": TOKEN };
}

function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  lucide.createIcons();
  applyAdminBranding();
  switchView("today");
  setTodayDate();
  updateMsgBadge();
  // Poll unread count every 60s while dashboard is open
  setInterval(updateMsgBadge, 60_000);
}

async function applyAdminBranding() {
  try {
    const s = await fetch("/api/salon").then(r => r.json());
    if (s.primaryColor) {
      document.documentElement.style.setProperty("--accent", s.primaryColor);
    }
    if (s.logoInitials) {
      document.querySelectorAll(".brand-mark").forEach(el => el.textContent = s.logoInitials);
    }
    if (s.name) {
      document.querySelector(".sidebar-brand span:last-child").textContent = s.name.split(" ")[0];
      document.title = `Admin – ${s.name}`;
    }
  } catch { /* keep defaults */ }
}

function logout() {
  TOKEN = "";
  localStorage.removeItem("admin_token");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

// ── VIEWS ──
function switchView(name, btn) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.remove("hidden");
  if (btn) btn.classList.add("active");
  else {
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.classList.add("active");
  }

  if (name === "today")     loadToday();
  if (name === "bookings")  loadBookings();
  if (name === "services")  loadServices();
  if (name === "staff")     loadStaff();
  if (name === "messages")  loadMessages();
  if (name === "whatsapp")  loadWhatsApp();
  if (name === "settings")  loadSettings();
}

function setTodayDate() {
  const el = document.getElementById("todayDate");
  if (el) el.textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── TODAY ──
async function loadToday() {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [bookings, stats, blocked] = await Promise.all([
    fetch(`${API}/bookings/today`, { headers: authHeaders() }).then(r => { if (r.status === 401) { logout(); throw new Error("unauth"); } return r.json(); }),
    fetch(`${API}/stats`,         { headers: authHeaders() }).then(r => r.json()),
    fetch(`${API}/blocked-slots?date=${today}`, { headers: authHeaders() }).then(r => r.json()),
  ]);
  renderStats(stats);
  renderBookings("todayList", bookings);
  if (blocked.length) {
    const el = document.getElementById("todayList");
    el.insertAdjacentHTML("beforeend",
      `<div class="view-header" style="margin-top:1.5rem"><h3 style="font-size:1rem;font-weight:700;color:var(--muted)">Gesperrte Zeiten heute</h3></div>` +
      blocked.map(s => `
        <div class="booking-card blocked-slot-card">
          <div class="time">${esc(s.time_slot)}</div>
          <div class="info">
            <div class="customer">🔒 Gesperrt</div>
            <div class="details">${esc(s.staff_name) || "Alle Mitarbeiter"}${s.reason ? " · " + esc(s.reason) : ""}</div>
          </div>
          <div class="actions">
            <button class="action-btn danger"
              data-staff-id="${s.staff_id}"
              data-date="${esc(s.date)}"
              data-slot="${esc(s.time_slot)}"
              onclick="deleteBlockedSlot(this)">Entsperren</button>
          </div>
        </div>
      `).join("")
    );
  }
}

function renderStats(s) {
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card">
      <div class="label">Heute Termine</div>
      <div class="value">${s.todayCount}</div>
    </div>
    <div class="stat-card">
      <div class="label">Heute Umsatz</div>
      <div class="value">${s.todayRevenue} €</div>
      <div class="sub">abgeschlossene Termine</div>
    </div>
    <div class="stat-card">
      <div class="label">Diese Woche</div>
      <div class="value">${s.weekCount}</div>
      <div class="sub">${s.weekRevenue} € Umsatz</div>
    </div>
    <div class="stat-card">
      <div class="label">Gesamt</div>
      <div class="value">${s.totalBookings}</div>
      <div class="sub">Buchungen</div>
    </div>
  `;
}

// ── ALL BOOKINGS ──
async function loadBookings() {
  const date   = document.getElementById("filterDate")?.value || "";
  const status = document.getElementById("filterStatus")?.value || "";
  const params = new URLSearchParams();
  if (date)   params.set("date", date);
  if (status) params.set("status", status);
  const [bookings, blocked] = await Promise.all([
    fetch(`${API}/bookings?${params}`, { headers: authHeaders() }).then(r => { if (r.status === 401) { logout(); throw new Error("unauth"); } return r.json(); }),
    fetch(`${API}/blocked-slots?${date ? "date=" + date : ""}`, { headers: authHeaders() }).then(r => r.json()),
  ]);
  renderBookings("bookingsList", bookings);
  renderBlockedSlots(blocked);
}

// ── RENDER BOOKING CARDS ──
function renderBookings(containerId, bookings) {
  const el = document.getElementById(containerId);
  if (!bookings.length) {
    el.innerHTML = `<div class="empty-msg">Keine Termine gefunden.</div>`;
    return;
  }
  el.innerHTML = bookings.map(b => `
    <div class="booking-card" id="booking-${b.id}">
      <div class="time">${esc(b.time_slot)}</div>
      <div class="info">
        <div class="customer">${esc(b.customer_name)}</div>
        <div class="details">
          ${esc(b.service_name)} · ${b.duration} Min. · ${b.price} € · ${esc(b.staff_name)}
          ${containerId !== "todayList" ? `· ${esc(b.date)}` : ""}
        </div>
        <div class="details">${esc(b.customer_phone)} · <span class="badge badge-${esc(b.status)}">${statusLabel(b.status)}</span></div>
      </div>
      <div class="actions">
        ${b.status === "confirmed" ? `
          <button class="action-btn" onclick="updateStatus(${b.id}, 'done')">Erledigt</button>
          <button class="action-btn" onclick="updateStatus(${b.id}, 'no-show')">No-Show</button>
        ` : ""}
        ${b.status !== "cancelled" ? `
          <button class="action-btn danger" onclick="updateStatus(${b.id}, 'cancelled')">Stornieren</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

function statusLabel(s) {
  return { confirmed: "Bestätigt", done: "Erledigt", "no-show": "No-Show", cancelled: "Storniert" }[s] || s;
}

async function updateStatus(id, status) {
  const res = await fetch(`${API}/bookings/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (res.ok) {
    showToast("Status aktualisiert.");
    // Refresh whichever view is active
    const active = document.querySelector(".view:not(.hidden)")?.id?.replace("view-","");
    if (active === "today")    loadToday();
    if (active === "bookings") loadBookings();
  }
}

// ── SERVICES ──
async function loadServices() {
  const res = await fetch(`${API}/services`, { headers: authHeaders() });
  if (res.status === 401) { logout(); return; }
  const services = await res.json();
  document.getElementById("servicesList").innerHTML = services.map(s => `
    <div class="settings-card" id="svc-${s.id}">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.price} € · ${s.duration} Min.</div>
      </div>
      <div class="actions">
        <label class="toggle">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleService(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
        <button class="action-btn danger" onclick="deleteService(${s.id})">Löschen</button>
      </div>
    </div>
  `).join("");
}

function openServiceForm()  { document.getElementById("serviceFormWrap").classList.remove("hidden"); }
function closeServiceForm() { document.getElementById("serviceFormWrap").classList.add("hidden"); }

async function saveService() {
  const name     = document.getElementById("svcName").value.trim();
  const price    = document.getElementById("svcPrice").value;
  const duration = document.getElementById("svcDuration").value;
  if (!name || !price || !duration) { showToast("Bitte alle Felder ausfüllen."); return; }
  await fetch(`${API}/services`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name, price: Number(price), duration: Number(duration) }) });
  closeServiceForm();
  document.getElementById("svcName").value = "";
  document.getElementById("svcPrice").value = "";
  document.getElementById("svcDuration").value = "";
  showToast("Service hinzugefügt.");
  loadServices();
}

async function toggleService(id, active) {
  await fetch(`${API}/services/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ active: active ? 1 : 0 }) });
  showToast(active ? "Service aktiviert." : "Service deaktiviert.");
}

async function deleteService(id) {
  if (!confirm("Service wirklich löschen?")) return;
  await fetch(`${API}/services/${id}`, { method: "DELETE", headers: authHeaders() });
  showToast("Service gelöscht.");
  loadServices();
}

// ── STAFF ──
async function loadStaff() {
  const staff = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("staffList").innerHTML = staff.map(s => `
    <div class="settings-card" id="stf-${s.id}">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.active ? "Aktiv" : "Inaktiv"}</div>
      </div>
      <div class="actions">
        <label class="toggle">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleStaff(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
        <button class="action-btn danger" onclick="deleteStaff(${s.id})">Löschen</button>
      </div>
    </div>
  `).join("");
}

function openStaffForm()  { document.getElementById("staffFormWrap").classList.remove("hidden"); }
function closeStaffForm() { document.getElementById("staffFormWrap").classList.add("hidden"); }

async function saveStaff() {
  const name = document.getElementById("staffName").value.trim();
  if (!name) { showToast("Bitte Name eingeben."); return; }
  await fetch(`${API}/staff`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name }) });
  closeStaffForm();
  document.getElementById("staffName").value = "";
  showToast("Mitarbeiter hinzugefügt.");
  loadStaff();
}

async function toggleStaff(id, active) {
  await fetch(`${API}/staff/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ active: active ? 1 : 0 }) });
  showToast(active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
}

async function deleteStaff(id) {
  if (!confirm("Mitarbeiter wirklich löschen?")) return;
  await fetch(`${API}/staff/${id}`, { method: "DELETE", headers: authHeaders() });
  showToast("Mitarbeiter gelöscht.");
  loadStaff();
}

// ── SETTINGS ──
const DAY_LABELS = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function decToTime(d) {
  if (d == null) return "";
  const h = Math.floor(d), m = Math.round((d % 1) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToDec(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

async function loadSettings() {
  const [salon, hours] = await Promise.all([
    fetch(`${API}/salon`, { headers: authHeaders() }).then(r => r.json()),
    fetch(`${API}/hours`, { headers: authHeaders() }).then(r => r.json()),
  ]);

  document.getElementById("cfgName").value     = salon.name           || "";
  document.getElementById("cfgCity").value     = salon.city           || "";
  document.getElementById("cfgAddress").value  = salon.address        || "";
  document.getElementById("cfgPhone").value    = salon.phone          || "";
  document.getElementById("cfgInitials").value = salon.logo_initials  || "";
  document.getElementById("cfgHeroImg").value  = salon.hero_img_url   || "";
  document.getElementById("cfgMapsUrl").value  = salon.maps_url       || "";
  const color = salon.primary_color || "#c9a84c";
  document.getElementById("cfgColor").value       = color;
  document.getElementById("cfgColorPicker").value = color;
  // Sync color picker ↔ hex input
  document.getElementById("cfgColorPicker").oninput = e => { document.getElementById("cfgColor").value = e.target.value; };
  document.getElementById("cfgColor").oninput = e => {
    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) document.getElementById("cfgColorPicker").value = e.target.value;
  };

  document.getElementById("hoursList").innerHTML = DAY_LABELS.map((label, i) => {
    const h = hours[i];
    const open = h ? decToTime(h[0]) : "";
    const close = h ? decToTime(h[1]) : "";
    return `
      <div class="cfg-hour-row">
        <label class="cfg-day">
          <input type="checkbox" ${h ? "checked" : ""} onchange="toggleDay(${i}, this)" id="dayCheck${i}" />
          ${label}
        </label>
        <div class="cfg-times" id="dayTimes${i}" ${!h ? 'style="opacity:0.3;pointer-events:none"' : ""}>
          <input type="time" id="open${i}"  value="${open}"  />
          <span>–</span>
          <input type="time" id="close${i}" value="${close}" />
        </div>
      </div>`;
  }).join("");
}

function toggleDay(i, cb) {
  const times = document.getElementById(`dayTimes${i}`);
  if (cb.checked) {
    times.style.opacity = "1";
    times.style.pointerEvents = "auto";
    document.getElementById(`open${i}`).value  = "09:00";
    document.getElementById(`close${i}`).value = "19:00";
  } else {
    times.style.opacity = "0.3";
    times.style.pointerEvents = "none";
  }
}

async function saveSalonInfo() {
  const color = document.getElementById("cfgColor").value.trim();
  await fetch(`${API}/salon`, {
    method: "PATCH", headers: authHeaders(),
    body: JSON.stringify({
      name:          document.getElementById("cfgName").value.trim()     || null,
      city:          document.getElementById("cfgCity").value.trim()     || null,
      address:       document.getElementById("cfgAddress").value.trim()  || null,
      phone:         document.getElementById("cfgPhone").value.trim()    || null,
      logo_initials: document.getElementById("cfgInitials").value.trim() || null,
      primary_color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : null,
      hero_img_url:  document.getElementById("cfgHeroImg").value.trim()  || null,
      maps_url:      document.getElementById("cfgMapsUrl").value.trim()  || null,
    }),
  });
  showToast("Salon-Infos gespeichert.");
  applyAdminBranding();
}

async function saveHours() {
  const hours = {};
  for (let i = 0; i < 7; i++) {
    const checked = document.getElementById(`dayCheck${i}`).checked;
    if (!checked) { hours[i] = null; continue; }
    const open  = timeToDec(document.getElementById(`open${i}`).value);
    const close = timeToDec(document.getElementById(`close${i}`).value);
    hours[i] = open != null && close != null ? [open, close] : null;
  }
  await fetch(`${API}/hours`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(hours) });
  showToast("Öffnungszeiten gespeichert.");
}

async function savePassword() {
  const pw  = document.getElementById("cfgNewPw").value;
  const pw2 = document.getElementById("cfgConfirmPw").value;
  if (pw !== pw2)        { showToast("Passwörter stimmen nicht überein."); return; }
  if (pw.length < 6)     { showToast("Min. 6 Zeichen erforderlich."); return; }
  const res = await fetch(`${API}/password`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ newPassword: pw }) });
  if (res.ok) {
    showToast("Passwort geändert. Bitte neu einloggen.");
    setTimeout(logout, 2000);
  }
}

// ── WHATSAPP ──
async function loadWhatsApp() {
  // Load salon WhatsApp settings
  const settings = await fetch(`${API}/whatsapp-settings`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("waEnabled").checked        = settings.whatsapp_enabled === "true";
  document.getElementById("waPhoneNumberId").value    = settings.meta_phone_number_id || "";
  document.getElementById("waToken").value            = settings.meta_waba_token || "";
  document.getElementById("waWebhookUrl").value       = `${location.origin}/api/webhook/whatsapp`;
  document.getElementById("waVerifyToken").value      = settings.meta_webhook_verify_token || "(set META_WEBHOOK_VERIFY_TOKEN in Railway env vars)";

  // Token expiry status
  const statusEl = document.getElementById("waTokenStatus");
  if (statusEl) {
    const expires = settings.meta_waba_token_expires;
    const hasToken = !!settings.meta_waba_token;
    if (!hasToken) {
      statusEl.innerHTML = `<span class="wa-status wa-status--warn">⚠ Kein Token gespeichert</span>`;
    } else if (!expires) {
      statusEl.innerHTML = `<span class="wa-status wa-status--warn">Token-Ablauf unbekannt — wird automatisch erneuert</span>`;
    } else {
      const daysLeft = Math.floor((new Date(expires) - new Date()) / 86400000);
      if (daysLeft < 0) {
        statusEl.innerHTML = `<span class="wa-status wa-status--error">✕ Token abgelaufen seit ${expires}</span>`;
      } else if (daysLeft <= 10) {
        statusEl.innerHTML = `<span class="wa-status wa-status--warn">⚠ Token läuft ab in ${daysLeft} Tagen (${expires})</span>`;
      } else {
        statusEl.innerHTML = `<span class="wa-status wa-status--ok">✓ Token aktiv bis ${expires} (${daysLeft} Tage)</span>`;
      }
    }
  }

  // Load staff with WhatsApp numbers
  const staff = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("staffWaList").innerHTML = staff.map(s => `
    <div class="settings-card">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">Persönliche WhatsApp-Nummer</div>
      </div>
      <div class="wa-staff-input">
        <input
          placeholder="+49 ..."
          value="${s.whatsapp_phone || ""}"
          onblur="saveStaffWhatsApp(${s.id}, this.value)"
        />
      </div>
    </div>
  `).join("");
}

async function saveWaSetting(key, value) {
  await fetch(`${API}/whatsapp-settings`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ key, value }),
  });
  showToast("Gespeichert.");
}

async function saveStaffWhatsApp(staffId, phone) {
  await fetch(`${API}/staff/${staffId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ whatsapp_phone: phone.trim() || null }),
  });
  showToast("WhatsApp-Nummer gespeichert.");
}

function copyWebhookUrl() {
  navigator.clipboard.writeText(document.getElementById("waWebhookUrl").value);
  showToast("URL kopiert!");
}

// ── BLOCKED SLOTS ──
let STAFF_CACHE = [];

function renderBlockedSlots(slots) {
  const el = document.getElementById("blockedList");
  if (!el) return;
  if (!slots.length) {
    el.innerHTML = `<div class="empty-msg">Keine gesperrten Zeiten.</div>`;
    return;
  }
  el.innerHTML = slots.map(s => `
    <div class="booking-card blocked-slot-card">
      <div class="time">${esc(s.time_slot)}</div>
      <div class="info">
        <div class="customer">🔒 Gesperrt</div>
        <div class="details">${esc(s.date)} · ${esc(s.staff_name) || "Alle Mitarbeiter"}${s.reason ? " · " + esc(s.reason) : ""}</div>
      </div>
      <div class="actions">
        <button class="action-btn danger"
          data-staff-id="${s.staff_id}"
          data-date="${esc(s.date)}"
          data-slot="${esc(s.time_slot)}"
          onclick="deleteBlockedSlot(this)">Entsperren</button>
      </div>
    </div>
  `).join("");
}

async function openBlockModal() {
  const modal = document.getElementById("blockModal");
  modal.classList.remove("hidden");

  // Load staff if not cached
  if (!STAFF_CACHE.length) {
    STAFF_CACHE = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  }
  const sel = document.getElementById("blockStaff");
  sel.innerHTML = `<option value="0">Alle Mitarbeiter</option>` +
    STAFF_CACHE.map(s => `<option value="${s.id}">${s.name}</option>`).join("");

  // Reset state from any previous use
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  document.getElementById("blockDate").value  = today;
  document.getElementById("blockReason").value = "";
  document.getElementById("blockSlot").innerHTML = `<option value="">– Datum zuerst wählen –</option>`;
  await loadBlockSlots();

  document.getElementById("blockDate").onchange   = loadBlockSlots;
  document.getElementById("blockStaff").onchange  = loadBlockSlots;
}

async function loadBlockSlots() {
  const date      = document.getElementById("blockDate").value;
  const staffId   = document.getElementById("blockStaff").value;
  const slotSel   = document.getElementById("blockSlot");
  if (!date) return;
  slotSel.innerHTML = `<option>Lade Zeiten…</option>`;
  try {
    // Use first active service's duration to generate slot list
    const services  = await fetch(`${API}/services`, { headers: authHeaders() }).then(r => r.json());
    const firstSvc  = services.find(s => s.active) || services[0];
    const svcId     = firstSvc?.id ?? 1;
    const slots     = await fetch(`/api/slots?date=${date}&serviceId=${svcId}&staffId=${staffId}`, { headers: authHeaders() }).then(r => r.json());
    slotSel.innerHTML = slots.length
      ? slots.map(s => `<option value="${s.time}">${s.time}${!s.available ? " (belegt)" : ""}</option>`).join("")
      : `<option>Keine Zeiten verfügbar</option>`;
  } catch {
    slotSel.innerHTML = `<option>Fehler beim Laden</option>`;
  }
}

function closeBlockModal() {
  document.getElementById("blockModal").classList.add("hidden");
}

async function saveBlockedSlot() {
  const staffId  = Number(document.getElementById("blockStaff").value);
  const date     = document.getElementById("blockDate").value;
  const timeSlot = document.getElementById("blockSlot").value;
  const reason   = document.getElementById("blockReason").value.trim();

  if (!date || !timeSlot) { showToast("Datum und Uhrzeit wählen."); return; }

  const res = await fetch(`${API}/blocked-slots`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ staffId, date, timeSlot, reason: reason || null }),
  });
  if (res.ok) {
    closeBlockModal();
    showToast("Zeit gesperrt.");
    loadBookings();
  } else {
    showToast("Fehler beim Sperren.");
  }
}

async function deleteBlockedSlot(btn) {
  const staffId  = btn.dataset.staffId;
  const date     = btn.dataset.date;
  const timeSlot = btn.dataset.slot;
  const res = await fetch(`${API}/blocked-slots`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ staffId, date, timeSlot }),
  });
  if (res.ok) {
    showToast("Zeit entsperrt.");
    loadBookings();
  }
}

// ── MESSAGES / INBOX ──
async function updateMsgBadge() {
  try {
    const { count } = await fetch(`${API}/messages/unread-count`, { headers: authHeaders() }).then(r => r.json());
    const badge = document.getElementById("msgBadge");
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : count;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  } catch { /* ignore — badge stays as-is */ }
}

async function loadMessages() {
  const unreadOnly = document.getElementById("msgUnreadOnly")?.checked ? "1" : "";
  const url = `${API}/messages${unreadOnly ? "?unread=1" : ""}`;
  const msgs = await fetch(url, { headers: authHeaders() }).then(r => r.json());
  const el = document.getElementById("messagesList");
  if (!msgs.length) {
    el.innerHTML = `<div class="empty-msg">${unreadOnly ? "Keine ungelesenen Nachrichten." : "Noch keine Nachrichten eingegangen."}</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => {
    const intentLabel = m.intent === "book"
      ? `<span class="badge badge-confirmed">Buchungsanfrage</span>`
      : `<span class="badge badge-no-show">Andere Frage</span>`;
    const readClass = m.is_read ? "" : " msg-unread";
    const wa = `https://wa.me/${m.from_phone.replace(/[^0-9]/g, "")}`;
    const ts = new Date(m.created_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return `
      <div class="booking-card${readClass}" id="msg-${m.id}">
        <div class="time" style="min-width:3.5rem;font-size:0.75rem;text-align:center">${ts}</div>
        <div class="info">
          <div class="customer">${esc(m.from_phone)} ${intentLabel}</div>
          <div class="details" style="white-space:pre-wrap;max-width:60ch">${esc(m.message_text)}</div>
        </div>
        <div class="actions">
          <a class="action-btn" href="${wa}" target="_blank" rel="noopener" style="text-decoration:none">
            <i data-lucide="message-circle" style="width:14px;height:14px;vertical-align:middle"></i> Antworten
          </a>
          ${!m.is_read ? `<button class="action-btn" onclick="markAsRead(${m.id})">Gelesen</button>` : ""}
        </div>
      </div>`;
  }).join("");
  lucide.createIcons();
}

async function markAsRead(id) {
  await fetch(`${API}/messages/${id}/read`, { method: "PATCH", headers: authHeaders() });
  const card = document.getElementById(`msg-${id}`);
  if (card) card.classList.remove("msg-unread");
  const btn = card?.querySelector(`button[onclick="markAsRead(${id})"]`);
  if (btn) btn.remove();
  updateMsgBadge();
}

async function markAllRead() {
  await fetch(`${API}/messages/read-all`, { method: "PATCH", headers: authHeaders() });
  showToast("Alle als gelesen markiert.");
  loadMessages();
  updateMsgBadge();
}

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}


`````````````````````````````````````````nFILE: admin/index.html
`````````````````````````````````````````n<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin – Next Level Salon</title>
  <link rel="stylesheet" href="/admin/admin.css" />
  <script src="/vendor/lucide/lucide.min.js" defer></script>
  <script src="/admin/admin.js" defer></script>
</head>
<body>

  <!-- LOGIN SCREEN -->
  <div id="loginScreen" class="login-screen">
    <div class="login-card">
      <div class="brand-mark">NL</div>
      <h1>Admin-Login</h1>
      <p>Next Level Salon</p>
      <form id="loginForm">
        <input type="password" id="passwordInput" placeholder="Passwort" required autocomplete="current-password" />
        <button type="submit">Anmelden</button>
        <p id="loginError" class="error hidden">Falsches Passwort.</p>
      </form>
    </div>
  </div>

  <!-- DASHBOARD -->
  <div id="dashboard" class="hidden">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-mark">NL</span>
        <span>Next Level</span>
      </div>
      <nav>
        <button class="nav-item active" data-view="today" onclick="switchView('today', this)">
          <i data-lucide="calendar-days"></i> Heute
        </button>
        <button class="nav-item" data-view="bookings" onclick="switchView('bookings', this)">
          <i data-lucide="list"></i> Termine
        </button>
        <button class="nav-item" data-view="services" onclick="switchView('services', this)">
          <i data-lucide="scissors"></i> Services
        </button>
        <button class="nav-item" data-view="staff" onclick="switchView('staff', this)">
          <i data-lucide="users"></i> Mitarbeiter
        </button>
        <button class="nav-item" data-view="messages" onclick="switchView('messages', this)">
          <i data-lucide="inbox"></i> Nachrichten
          <span class="nav-badge hidden" id="msgBadge">0</span>
        </button>
        <button class="nav-item" data-view="whatsapp" onclick="switchView('whatsapp', this)">
          <i data-lucide="message-circle"></i> WhatsApp
        </button>
        <button class="nav-item" data-view="settings" onclick="switchView('settings', this)">
          <i data-lucide="settings"></i> Einstellungen
        </button>
      </nav>
      <a class="logout-btn" href="/" target="_blank" rel="noopener" style="text-decoration:none">
        <i data-lucide="external-link"></i> Buchungsseite
      </a>
      <button class="logout-btn" onclick="logout()">
        <i data-lucide="log-out"></i> Abmelden
      </button>
    </aside>

    <main class="content">

      <!-- TODAY VIEW -->
      <div id="view-today" class="view">
        <div class="view-header">
          <h2>Heute</h2>
          <span id="todayDate" class="muted"></span>
        </div>
        <div class="stats-row" id="statsRow"></div>
        <div id="todayList" class="booking-list"></div>
      </div>

      <!-- ALL BOOKINGS VIEW -->
      <div id="view-bookings" class="view hidden">
        <div class="view-header">
          <h2>Alle Termine</h2>
          <div class="filter-row">
            <input type="date" id="filterDate" onchange="loadBookings()" />
            <select id="filterStatus" onchange="loadBookings()">
              <option value="">Alle Status</option>
              <option value="confirmed">Bestätigt</option>
              <option value="done">Erledigt</option>
              <option value="no-show">No-Show</option>
              <option value="cancelled">Storniert</option>
            </select>
            <button class="cfg-add-btn" onclick="openBlockModal()">Zeit sperren</button>
          </div>
        </div>
        <div id="bookingsList" class="booking-list"></div>

        <div class="view-header" style="margin-top:2rem">
          <h3 style="font-size:1.1rem;font-weight:700">Gesperrte Zeiten</h3>
        </div>
        <div id="blockedList" class="booking-list"></div>
      </div>

      <!-- BLOCK SLOT MODAL -->
      <div id="blockModal" class="modal-backdrop hidden">
        <div class="modal-box">
          <div class="modal-head">
            <h3>Zeit sperren</h3>
            <button onclick="closeBlockModal()" class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <label class="modal-label">Mitarbeiter
              <select id="blockStaff"></select>
            </label>
            <label class="modal-label">Datum
              <input type="date" id="blockDate" />
            </label>
            <label class="modal-label">Uhrzeit
              <select id="blockSlot">
                <option value="">– Datum zuerst wählen –</option>
              </select>
            </label>
            <label class="modal-label">Grund (optional)
              <input id="blockReason" placeholder="z.B. Urlaub, Krank, Lieferant..." />
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn-ghost" onclick="closeBlockModal()">Abbrechen</button>
            <button class="btn-danger" onclick="saveBlockedSlot()">Sperren</button>
          </div>
        </div>
      </div>

      <!-- SERVICES VIEW -->
      <div id="view-services" class="view hidden">
        <div class="view-header">
          <h2>Services</h2>
          <button class="cfg-add-btn" onclick="openServiceForm()">+ Service hinzufügen</button>
        </div>
        <div id="serviceFormWrap" class="cfg-form hidden">
          <input id="svcName"     placeholder="Name (z.B. Herrenhaarschnitt)" />
          <input id="svcPrice"    placeholder="Preis (€)" type="number" min="1" />
          <input id="svcDuration" placeholder="Dauer (Min.)" type="number" min="5" />
          <button onclick="saveService()">Speichern</button>
          <button class="cfg-cancel" onclick="closeServiceForm()">Abbrechen</button>
        </div>
        <div id="servicesList" class="settings-list"></div>
      </div>

      <!-- STAFF VIEW -->
      <div id="view-staff" class="view hidden">
        <div class="view-header">
          <h2>Mitarbeiter</h2>
          <button class="cfg-add-btn" onclick="openStaffForm()">+ Mitarbeiter hinzufügen</button>
        </div>
        <div id="staffFormWrap" class="cfg-form hidden">
          <input id="staffName" placeholder="Name (z.B. Ali)" />
          <button onclick="saveStaff()">Speichern</button>
          <button class="cfg-cancel" onclick="closeStaffForm()">Abbrechen</button>
        </div>
        <div id="staffList" class="settings-list"></div>
      </div>

      <!-- SETTINGS VIEW -->
      <div id="view-settings" class="view hidden">
        <div class="view-header"><h2>Einstellungen</h2></div>

        <!-- Salon Info -->
        <div class="cfg-section">
          <h3>Salon-Infos</h3>
          <div class="cfg-grid">
            <label>Name<input id="cfgName" placeholder="Salonname" /></label>
            <label>Stadt<input id="cfgCity" placeholder="München" /></label>
            <label>Adresse<input id="cfgAddress" placeholder="Musterstraße 1, 80000 München" /></label>
            <label>Telefon<input id="cfgPhone" placeholder="+4989..." /></label>
            <label>Logo-Kürzel <span style="font-size:0.7rem;color:var(--muted);font-weight:400;text-transform:none">(2-4 Buchstaben)</span><input id="cfgInitials" placeholder="NL" maxlength="4" /></label>
            <label>Akzentfarbe
              <div style="display:flex;gap:8px;align-items:center">
                <input type="color" id="cfgColorPicker" style="width:42px;height:36px;padding:2px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);cursor:pointer" />
                <input id="cfgColor" placeholder="#c9a84c" maxlength="7" style="flex:1" />
              </div>
            </label>
            <label>Hero-Bild URL<input id="cfgHeroImg" placeholder="https://..." /></label>
            <label>Google Maps URL<input id="cfgMapsUrl" placeholder="https://www.google.com/maps?q=..." /></label>
          </div>
          <button class="cfg-save-btn" onclick="saveSalonInfo()">Speichern</button>
        </div>

        <!-- Opening Hours -->
        <div class="cfg-section">
          <h3>Öffnungszeiten</h3>
          <div id="hoursList" class="cfg-hours"></div>
          <button class="cfg-save-btn" onclick="saveHours()">Öffnungszeiten speichern</button>
        </div>

        <!-- Password -->
        <div class="cfg-section">
          <h3>Passwort ändern</h3>
          <div class="cfg-grid">
            <label>Neues Passwort<input id="cfgNewPw" type="password" placeholder="Min. 6 Zeichen" /></label>
            <label>Bestätigen<input id="cfgConfirmPw" type="password" placeholder="Wiederholen" /></label>
          </div>
          <button class="cfg-save-btn" onclick="savePassword()">Passwort ändern</button>
        </div>
      </div>

      <!-- MESSAGES / INBOX VIEW -->
      <div id="view-messages" class="view hidden">
        <div class="view-header">
          <h2>Nachrichten</h2>
          <div class="filter-row">
            <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;color:var(--muted)">
              <input type="checkbox" id="msgUnreadOnly" onchange="loadMessages()" style="width:auto" />
              Nur ungelesen
            </label>
            <button class="cfg-add-btn" onclick="markAllRead()">Alle als gelesen</button>
          </div>
        </div>
        <p class="wa-hint" style="margin-bottom:1.2rem">
          Eingehende WhatsApp-Nachrichten von Kunden. Buchungsanfragen werden automatisch mit dem Buchungslink beantwortet.
          Andere Nachrichten erscheinen hier zur manuellen Bearbeitung.
        </p>
        <div id="messagesList" class="booking-list"></div>
      </div>

      <!-- WHATSAPP VIEW -->
      <div id="view-whatsapp" class="view hidden">
        <div class="view-header"><h2>WhatsApp</h2></div>

        <div class="wa-section">
          <h3>Salon-Verbindung</h3>
          <p class="wa-hint">Trage hier die Zugangsdaten deiner WhatsApp Business Nummer ein. Diese findest du im <a href="https://developers.facebook.com" target="_blank" rel="noopener">Meta Developer Console</a> unter WhatsApp → API Setup.</p>

          <div class="wa-field">
            <label>WhatsApp aktiviert</label>
            <label class="toggle">
              <input type="checkbox" id="waEnabled" onchange="saveWaSetting('whatsapp_enabled', this.checked ? 'true' : 'false')" />
              <div class="toggle-track"></div>
            </label>
          </div>

          <div class="wa-field">
            <label>Phone Number ID <span class="wa-slot">← OPEN SLOT: aus Meta Developer Console</span></label>
            <input id="waPhoneNumberId" placeholder="z.B. 123456789012345" onblur="saveWaSetting('meta_phone_number_id', this.value)" />
          </div>

          <div class="wa-field">
            <label>Access Token <span class="wa-slot">← OPEN SLOT: Permanent System User Token aus Meta</span></label>
            <input id="waToken" type="password" placeholder="EAAxxxxxxxx..." onblur="saveWaSetting('meta_waba_token', this.value)" />
          </div>

          <div class="wa-field">
            <label>Webhook URL <span class="wa-hint-inline">(in Meta Developer Console eintragen)</span></label>
            <div class="wa-copy-row">
              <input id="waWebhookUrl" readonly />
              <button onclick="copyWebhookUrl()">Kopieren</button>
            </div>
          </div>

          <div class="wa-field">
            <label>Webhook Verify Token <span class="wa-hint-inline">(in Meta eintragen)</span></label>
            <input id="waVerifyToken" readonly placeholder="Wird vom Server gesetzt (META_WEBHOOK_VERIFY_TOKEN)" />
          </div>

          <div class="wa-token-status" id="waTokenStatus"></div>
        </div>

        <div class="wa-section">
          <h3>Mitarbeiter WhatsApp-Nummern</h3>
          <p class="wa-hint">Jeder Friseur gibt hier seine persönliche WhatsApp-Nummer ein. Bei einer Buchung wird nur er benachrichtigt.</p>
          <div id="staffWaList" class="settings-list"></div>
        </div>
      </div>

    </main>
  </div>

  <div class="toast" id="toast" role="status"></div>
</body>
</html>


`````````````````````````````````````````nFILE: ich-will-schauen-was-besser-ist/barber-demo/script.js
`````````````````````````````````````````nconst DAY_NAMES      = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const DAY_NAMES_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function esc(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

let SALON    = null;
let HOURS    = {};
let SERVICES = [];
let STAFF    = [];

let state = { serviceId: null, staffId: 0, date: null, slot: null };

// ── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  await loadSalon();
  await loadData();
  buildServiceGrid();
  buildServiceSelect();
  buildStaffSelect();
  buildDateRow();
  updateSummary();

  document.getElementById("bookingForm").addEventListener("submit", handleSubmit);
  document.getElementById("serviceSelect").addEventListener("change", e => {
    state.serviceId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
  document.getElementById("staffSelect").addEventListener("change", e => {
    state.staffId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
});

// ── SALON CONFIG ─────────────────────────────────────────────────────────────
async function loadSalon() {
  try {
    SALON = await fetch("/api/salon").then(r => r.json());
    HOURS = SALON.hours || {};
    applySalonBranding();
  } catch {
    // keep defaults if API unavailable
  }
}

function applySalonBranding() {
  const s = SALON;
  if (!s) return;

  // CSS accent color
  document.documentElement.style.setProperty("--accent", s.primaryColor);
  document.documentElement.style.setProperty("--accent-dim", darken(s.primaryColor, 0.15));

  // Page title + meta
  document.title = `${s.name} | Online buchen`;

  // DOM slots with data-salon attribute
  document.querySelectorAll("[data-salon='name']").forEach(el => el.textContent = s.name);
  document.querySelectorAll("[data-salon='initials']").forEach(el => el.textContent = s.logoInitials);
  document.querySelectorAll("[data-salon='address']").forEach(el => el.textContent = s.address || "");
  document.querySelectorAll("[data-salon='city']").forEach(el => el.textContent = s.city || "");

  // Hero image
  if (s.heroImgUrl) document.getElementById("heroImg").src = s.heroImgUrl;

  // Maps
  if (s.mapsUrl) {
    document.getElementById("mapsLink").href = s.mapsUrl;
    document.getElementById("mapsFrame").src = s.mapsUrl + "&output=embed";
  }

  // Today's hours in the quick strip
  const dow = new Date().getDay();
  const h   = HOURS[dow];
  document.getElementById("todayHours").textContent = h ? `${fmt(h[0])} – ${fmt(h[1])}` : "Heute geschlossen";

  // Full hours list in location section
  const dl = document.getElementById("hoursList");
  if (dl) {
    dl.innerHTML = DAY_NAMES_FULL.map((day, i) => {
      const dh = HOURS[i];
      return `<div><dt>${day}</dt><dd>${dh ? fmt(dh[0]) + " – " + fmt(dh[1]) : "Geschlossen"}</dd></div>`;
    }).join("");
  }
}

function darken(hex, amount) {
  const n = parseInt(hex.replace("#",""), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount));
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function fmt(h) {
  return `${String(Math.floor(h)).padStart(2,"0")}:${String(Math.round((h%1)*60)).padStart(2,"0")}`;
}

// ── DATA ─────────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [services, staff] = await Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/staff").then(r => r.json()),
    ]);
    SERVICES = services;
    STAFF    = [{ id: 0, name: "Egal (erster freier)" }, ...staff];
    state.serviceId = SERVICES[0]?.id ?? null;
  } catch {
    showToast("Verbindung zum Server fehlgeschlagen.");
  }
}

// ── SERVICE GRID ─────────────────────────────────────────────────────────────
function buildServiceGrid() {
  const grid = document.getElementById("serviceGrid");
  if (!grid) return;
  grid.innerHTML = SERVICES.map(s => `
    <div class="service-card" data-id="${s.id}" onclick="selectServiceFromCard(${s.id})">
      <div class="service-card__name">${esc(s.name)}</div>
      <div class="service-card__meta">
        <span class="service-card__price">${s.price} €</span>
        <span class="service-card__duration"><i data-lucide="clock"></i>${s.duration} Min.</span>
      </div>
    </div>
  `).join("");
  lucide.createIcons();
}

function selectServiceFromCard(id) {
  state.serviceId = id;
  document.getElementById("serviceSelect").value = id;
  state.slot = null;
  document.querySelectorAll(".service-card").forEach(c => c.classList.toggle("selected", Number(c.dataset.id) === id));
  buildSlotGrid();
  updateSummary();
  document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
}

// ── SELECTS ──────────────────────────────────────────────────────────────────
function buildServiceSelect() {
  const sel = document.getElementById("serviceSelect");
  sel.innerHTML = SERVICES.map(s =>
    `<option value="${s.id}">${esc(s.name)} – ${s.price} €</option>`
  ).join("");
  if (SERVICES.length) state.serviceId = SERVICES[0].id;
}

function buildStaffSelect() {
  document.getElementById("staffSelect").innerHTML = STAFF.map(s =>
    `<option value="${s.id}">${esc(s.name)}</option>`
  ).join("");
}

// ── DATE ROW ─────────────────────────────────────────────────────────────────
function buildDateRow() {
  const row = document.getElementById("dateRow");
  if (!row) return;
  const today = new Date();
  let html = "";
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow    = d.getDay();
    const closed = HOURS[dow] === null || HOURS[dow] === undefined;
    const iso    = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label  = i === 0 ? "Heute" : i === 1 ? "Morgen" : DAY_NAMES[dow];
    html += `
      <button type="button" class="date-btn${closed ? " taken" : ""}" data-date="${iso}"
        onclick="selectDate('${iso}', this)" ${closed ? "disabled" : ""}>
        <span>${label}</span>
        <strong>${d.getDate()}</strong>
        <span>${d.toLocaleString("de-DE",{month:"short"})}</span>
      </button>`;
  }
  row.innerHTML = html;
  const first = row.querySelector(".date-btn:not(.taken)");
  if (first) first.click();
}

function selectDate(iso, btn) {
  state.date = iso;
  state.slot = null;
  document.querySelectorAll(".date-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  buildSlotGrid();
  updateSummary();
}

// ── SLOT GRID ─────────────────────────────────────────────────────────────────
async function buildSlotGrid() {
  const grid = document.getElementById("slotGrid");
  if (!grid || !state.date || !state.serviceId) return;
  grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Lade Zeiten…</p>`;
  try {
    const slots = await fetch(
      `/api/slots?date=${state.date}&serviceId=${state.serviceId}&staffId=${state.staffId}`
    ).then(r => r.json());
    if (!slots.length) {
      grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Keine Zeiten verfügbar.</p>`;
      return;
    }
    const freeCount = slots.filter(s => s.available).length;
    const label = freeCount === 0
      ? `<p class="slots-label" style="color:var(--danger,#e05555)">Keine freien Zeiten</p>`
      : `<p class="slots-label">${freeCount} freie Zeit${freeCount !== 1 ? "en" : ""}</p>`;
    grid.innerHTML = label + slots.map(({ time, available }) => `
      <button type="button" class="slot-btn${!available ? " taken" : ""}"
        ${!available ? "disabled" : ""} onclick="selectSlot('${time}',this)">${time}</button>
    `).join("");
  } catch {
    grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Fehler beim Laden der Zeiten.</p>`;
  }
}

function selectSlot(slot, btn) {
  state.slot = slot;
  document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  updateSummary();
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
function updateSummary() {
  const el = document.getElementById("bookingSummary");
  if (!el) return;
  const service = SERVICES.find(s => s.id === state.serviceId);
  if (!state.date || !state.slot || !service) {
    el.textContent = service
      ? `${service.name} – ${service.price} € · ${service.duration} Min. — Bitte Datum und Uhrzeit wählen.`
      : "Wähle Service und freien Termin.";
    return;
  }
  const d     = new Date(state.date + "T12:00:00");
  const staff = STAFF.find(s => s.id === state.staffId);
  el.textContent =
    `${service.name} · ${state.slot} Uhr · ${DAY_NAMES_FULL[d.getDay()]}, ` +
    `${d.getDate()}. ${d.toLocaleString("de-DE",{month:"long"})} · ${staff?.name ?? ""} · ${service.price} €`;
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (!state.date || !state.slot) { showToast("Bitte wähle ein Datum und eine Uhrzeit."); return; }

  const customerName  = document.getElementById("nameInput").value.trim();
  const customerPhone = document.getElementById("phoneInput").value.trim();

  // Basic phone validation — must start with + and have 7-15 digits
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(customerPhone)) {
    showToast("Bitte gib eine gültige Telefonnummer ein (z.B. +49 179 1234567).");
    return;
  }

  const btn = e.target.querySelector(".submit-btn");
  btn.disabled = true;
  btn.textContent = "Wird gebucht…";

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId:     state.serviceId,
        staffId:       state.staffId,
        date:          state.date,
        timeSlot:      state.slot,
        customerName,
        customerPhone,
      }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      state.slot = null;
      updateSummary();
      showToast(data.error || "Diese Zeit wurde gerade gebucht. Bitte wähle eine andere.");
      buildSlotGrid();
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="calendar-check" aria-hidden="true"></i> Termin buchen`;
      lucide.createIcons();
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();
    showSuccess({ data, customerName, customerPhone });
    e.target.reset();
    state.slot = null;
  } catch {
    showToast("Fehler beim Buchen. Bitte versuche es erneut.");
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="calendar-check" aria-hidden="true"></i> Termin buchen`;
    lucide.createIcons();
  }
}

function showSuccess({ data, customerName, customerPhone }) {
  const d       = new Date(state.date + "T12:00:00");
  const service = SERVICES.find(s => s.id === state.serviceId);
  const staff   = STAFF.find(s => s.id === (data.staff?.id ?? state.staffId));
  const dateStr = `${DAY_NAMES_FULL[d.getDay()]}, ${d.getDate()}. ${d.toLocaleString("de-DE",{month:"long"})}`;

  const panel = document.getElementById("bookingPanel");
  const success = document.getElementById("bookingSuccess");

  document.getElementById("successName").textContent   = customerName;
  document.getElementById("successService").textContent = service?.name ?? "";
  document.getElementById("successDate").textContent    = dateStr;
  document.getElementById("successTime").textContent    = state.slot + " Uhr";
  document.getElementById("successStaff").textContent   = staff?.id === 0 ? "Erster freier Mitarbeiter" : (staff?.name ?? data.staff?.name ?? "");
  document.getElementById("successPrice").textContent   = (service?.price ?? data.service?.price ?? "") + " €";
  document.getElementById("successPhone").textContent   = customerPhone;

  panel.style.display   = "none";
  success.style.display = "flex";
  lucide.createIcons();
  success.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetBooking() {
  document.getElementById("bookingSuccess").style.display = "none";
  document.getElementById("bookingPanel").style.display   = "flex";
  state.slot = null;
  updateSummary();
  buildSlotGrid();
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}


`````````````````````````````````````````nFILE: ich-will-schauen-was-besser-ist/barber-demo/index.html
`````````````````````````````````````````n<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Salon | Online buchen</title>
    <meta name="description" content="Termin online buchen." />
    <link rel="stylesheet" href="styles.css" />
    <script src="/vendor/lucide/lucide.min.js" defer></script>
    <script src="script.js" defer></script>
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="#home" aria-label="Salon Startseite">
        <span class="brand-mark" data-salon="initials">NL</span>
        <span data-salon="name">Salon</span>
      </a>
      <nav class="nav" aria-label="Hauptnavigation">
        <a href="#services">Preise</a>
        <a href="#booking">Buchen</a>
        <a href="#location">Standort</a>
      </nav>
      <a class="top-cta" href="#booking">
        <i data-lucide="calendar-check" aria-hidden="true"></i>
        <span>Termin buchen</span>
      </a>
    </header>

    <main id="home">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-media" aria-hidden="true">
          <img id="heroImg" alt="" />
        </div>
        <div class="hero-content">
          <p class="eyebrow" data-salon="address"></p>
          <h1 id="hero-title">Dein nächster Schnitt.</h1>
          <p class="hero-copy">
            Wähle deinen Service und sichere dir direkt einen freien Termin.
          </p>
          <div class="hero-actions">
            <a class="primary-action" href="#booking">
              <i data-lucide="calendar-days" aria-hidden="true"></i>
              Termin buchen
            </a>
            <a class="secondary-action" href="#location">
              <i data-lucide="map-pin" aria-hidden="true"></i>
              Standort ansehen
            </a>
          </div>
        </div>
      </section>

      <section class="quick-strip" aria-label="Kurzinfos">
        <div>
          <span>Heute</span>
          <strong id="todayHours">â€“</strong>
        </div>
        <div>
          <span>Zahlung</span>
          <strong>Barzahlung</strong>
        </div>
        <div>
          <span>Standort</span>
          <strong data-salon="city"></strong>
        </div>
      </section>

      <section id="services" class="section">
        <div class="section-head">
          <p class="eyebrow">Leistungen</p>
          <h2>Beliebte Services direkt buchbar.</h2>
          <p>Klare Preise, transparente Dauer und schnelle Terminwahl.</p>
        </div>
        <div class="service-grid" id="serviceGrid" aria-live="polite"></div>
      </section>

      <section id="booking" class="booking-section" aria-labelledby="booking-title">
        <div class="booking-copy">
          <p class="eyebrow">Online buchen</p>
          <h2 id="booking-title">Freie Zeiten sehen. Direkt buchen.</h2>
          <p>Kunden sehen freie und belegte Zeiten direkt hier und reservieren ihren Termin sofort.</p>
          <ul class="trust-list">
            <li><i data-lucide="check" aria-hidden="true"></i> Preise und Dauer vor der Buchung sichtbar</li>
            <li><i data-lucide="banknote" aria-hidden="true"></i> Hinweis: laut Salonprofil nur Barzahlung</li>
            <li><i data-lucide="calendar-check" aria-hidden="true"></i> Gebuchte Zeiten werden automatisch blockiert</li>
          </ul>
        </div>

        <div class="booking-right">
          <div id="bookingPanel">
            <form class="booking-panel" id="bookingForm">
              <label>Gewünschte Leistung
                <select id="serviceSelect" name="serviceId" required></select>
              </label>
              <label>Gewünschter Friseur
                <select id="staffSelect" name="staffId"></select>
              </label>
              <div class="date-row" id="dateRow" role="group" aria-label="Datum Wählen"></div>
              <div class="slot-grid" id="slotGrid" role="group" aria-label="Uhrzeit Wählen"></div>
              <div class="input-grid">
                <label>Name
                  <input id="nameInput" name="name" placeholder="Dein Name" required />
                </label>
                <label>Telefon
                  <input id="phoneInput" name="phone" type="tel" placeholder="+49 179 1234567" required autocomplete="tel" />
                </label>
              </div>
              <div class="summary" id="bookingSummary">Wähle Service und freien Termin.</div>
              <button class="submit-btn" type="submit">
                <i data-lucide="calendar-check" aria-hidden="true"></i>
                Termin buchen
              </button>
              <p class="microcopy">Die freien Zeiten passen zur gewählten Leistung, Dauer und zum ausgewählten Mitarbeiter.</p>
            </form>
          </div>

          <div id="bookingSuccess" class="booking-success" style="display:none" aria-live="polite">
            <div class="success-check"><i data-lucide="check" aria-hidden="true"></i></div>
            <h3>Termin bestätigt!</h3>
            <p class="success-sub">Wir freuen uns auf deinen Besuch, <strong id="successName"></strong>.</p>
            <dl class="success-details">
              <div><dt><i data-lucide="scissors" aria-hidden="true"></i>Leistung</dt><dd id="successService"></dd></div>
              <div><dt><i data-lucide="calendar" aria-hidden="true"></i>Datum</dt><dd id="successDate"></dd></div>
              <div><dt><i data-lucide="clock" aria-hidden="true"></i>Uhrzeit</dt><dd id="successTime"></dd></div>
              <div><dt><i data-lucide="user" aria-hidden="true"></i>Mitarbeiter</dt><dd id="successStaff"></dd></div>
              <div><dt><i data-lucide="banknote" aria-hidden="true"></i>Preis</dt><dd id="successPrice"></dd></div>
              <div><dt><i data-lucide="smartphone" aria-hidden="true"></i>WhatsApp</dt><dd id="successPhone"></dd></div>
            </dl>
            <p class="success-note">Du erhältst eine Bestätigung per WhatsApp. Bitte erscheine pünktlich.</p>
            <button class="submit-btn" onclick="resetBooking()" style="margin-top:0.5rem">
              <i data-lucide="plus" aria-hidden="true"></i>
              Neuen Termin buchen
            </button>
          </div>
        </div>
      </section>

      <section id="location" class="section location-section">
        <div class="section-head">
          <p class="eyebrow">Standort</p>
          <h2 data-salon="name">Salon</h2>
          <p data-salon="address"></p>
        </div>
        <div class="location-layout">
          <div class="hours">
            <h3>Öffnungszeiten</h3>
            <dl id="hoursList"></dl>
            <a class="text-link" id="mapsLink" href="#" target="_blank" rel="noopener">
              Route öffnen
            </a>
          </div>
          <iframe id="mapsFrame" title="Standortkarte" src="" loading="lazy"></iframe>
        </div>
      </section>
    </main>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>

    <footer class="site-footer">
      <div class="site-footer__inner">
        <span class="brand-mark" style="font-size:0.65rem;width:28px;height:28px;display:grid;place-items:center;background:var(--accent);color:#000;font-weight:800;border-radius:6px;" data-salon="initials">NL</span>
        <span data-salon="name" style="font-size:0.85rem;font-weight:600;color:var(--muted)">Salon</span>
        <nav class="footer-links" aria-label="Rechtliches">
          <a href="/impressum">Impressum</a>
          <a href="/datenschutz">Datenschutz</a>
        </nav>
      </div>
    </footer>
  </body>
</html>


`````````````````````````````````````````nFILE: ich-will-schauen-was-besser-ist/barber-demo/styles.css
`````````````````````````````````````````n*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f0f;
  --surface: #1a1a1a;
  --surface2: #242424;
  --border: #2e2e2e;
  --text: #f0ede8;
  --muted: #888;
  --accent: #c9a84c;
  --accent-dim: #a8883a;
  --radius: 12px;
  --radius-sm: 8px;
}

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}

/* ── TOPBAR ── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 2rem;
  height: 64px;
  background: rgba(15,15,15,0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 1rem;
  white-space: nowrap;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  background: var(--accent);
  color: #000;
  font-weight: 800;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  border-radius: 8px;
}

.nav {
  display: flex;
  gap: 1.5rem;
  margin-left: auto;
}

.nav a {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.9rem;
  transition: color 0.2s;
}
.nav a:hover { color: var(--text); }

.top-cta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: var(--accent);
  color: #000;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.85rem;
  border-radius: 8px;
  transition: background 0.2s;
  white-space: nowrap;
}
.top-cta:hover { background: var(--accent-dim); }
.top-cta i { width: 16px; height: 16px; }

/* ── HERO ── */
.hero {
  position: relative;
  min-height: 88vh;
  display: flex;
  align-items: flex-end;
  padding: 4rem 2rem;
  overflow: hidden;
}

.hero-media {
  position: absolute;
  inset: 0;
}
.hero-media { background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); }
.hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}
.hero-media::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 60%, transparent 100%);
}

.hero-content {
  position: relative;
  max-width: 620px;
}

.eyebrow {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 1rem;
}

.hero-content h1 {
  font-size: clamp(2rem, 5vw, 3.2rem);
  font-weight: 800;
  line-height: 1.15;
  margin-bottom: 1rem;
}

.hero-copy {
  color: rgba(240,237,232,0.75);
  font-size: 1.05rem;
  margin-bottom: 2rem;
  max-width: 480px;
}

.hero-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.primary-action, .secondary-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.2s;
}
.primary-action { background: var(--accent); color: #000; }
.primary-action:hover { background: var(--accent-dim); }
.secondary-action { background: rgba(255,255,255,0.1); color: var(--text); border: 1px solid rgba(255,255,255,0.15); }
.secondary-action:hover { background: rgba(255,255,255,0.18); }
.primary-action i, .secondary-action i { width: 18px; height: 18px; }

/* ── QUICK STRIP ── */
.quick-strip {
  display: flex;
  justify-content: center;
  gap: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.quick-strip > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.2rem 2.5rem;
  gap: 2px;
  border-right: 1px solid var(--border);
}
.quick-strip > div:last-child { border-right: none; }
.quick-strip span { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.quick-strip strong { font-size: 0.95rem; }

/* ── SECTIONS ── */
.section {
  max-width: 1100px;
  margin: 0 auto;
  padding: 5rem 2rem;
}

.section-head {
  text-align: center;
  margin-bottom: 3rem;
}
.section-head h2 {
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 800;
  margin: 0.5rem 0;
}
.section-head p { color: var(--muted); max-width: 480px; margin: 0 auto; }

/* ── SERVICE GRID ── */
.service-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.service-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s, transform 0.2s;
  cursor: pointer;
}
.service-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.service-card.selected { border-color: var(--accent); background: rgba(201,168,76,0.07); }
.service-card__name { font-weight: 700; font-size: 1rem; }
.service-card__meta { display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); }
.service-card__price { font-size: 1.1rem; font-weight: 800; color: var(--accent); }
.service-card__duration { font-size: 0.8rem; color: var(--muted); display: flex; align-items: center; gap: 4px; }
.service-card__duration i { width: 14px; height: 14px; }

/* ── BOOKING SECTION ── */
.booking-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  max-width: 1100px;
  margin: 0 auto;
  padding: 5rem 2rem;
  align-items: start;
}

.booking-copy .eyebrow { margin-bottom: 0.75rem; }
.booking-copy h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 800; margin-bottom: 1rem; }
.booking-copy p { color: var(--muted); margin-bottom: 1.5rem; }

.trust-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.trust-list li { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: var(--muted); }
.trust-list i { width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; }

/* ── BOOKING PANEL ── */
.booking-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 3px solid var(--accent);
  border-radius: var(--radius);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.booking-panel label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.booking-panel select,
.booking-panel input {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  padding: 10px 14px;
  font-size: 0.95rem;
  outline: none;
  transition: border-color 0.2s;
  appearance: none;
}
.booking-panel select:focus,
.booking-panel input:focus { border-color: var(--accent); }
.booking-panel input::placeholder { color: var(--muted); }

.input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* ── DATE ROW ── */
.date-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.date-btn {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 14px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.15s;
}
.date-btn:hover { border-color: var(--accent); }
.date-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }
.date-btn strong { font-size: 1.1rem; font-weight: 800; }

/* ── SLOT GRID ── */
.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
  min-height: 44px;
}

.slot-btn {
  padding: 8px 4px;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  animation: fadeSlot 0.2s ease both;
}
@keyframes fadeSlot {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}

.slots-label {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: -8px;
}
.slot-btn:hover:not(.taken) { border-color: var(--accent); }
.slot-btn.active { background: var(--accent); color: #000; border-color: var(--accent); }
.slot-btn.taken { opacity: 0.3; cursor: not-allowed; text-decoration: line-through; }

/* ── SUMMARY + SUBMIT ── */
.summary {
  background: var(--surface2);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  font-size: 0.88rem;
  color: var(--muted);
  border-left: 3px solid var(--accent);
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  background: var(--accent);
  color: #000;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.submit-btn:hover { background: var(--accent-dim); }
.submit-btn i { width: 18px; height: 18px; }

.microcopy { font-size: 0.78rem; color: var(--muted); text-align: center; }

/* ── LOCATION ── */
.location-section { padding: 5rem 2rem; }
.location-section.section { max-width: 1100px; margin: 0 auto; }

.location-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 2rem;
  margin-top: 0;
}

.hours h3 { font-size: 1rem; font-weight: 700; margin-bottom: 1rem; }
.hours dl { display: flex; flex-direction: column; gap: 8px; }
.hours dl > div { display: flex; justify-content: space-between; font-size: 0.9rem; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.hours dt { color: var(--muted); }
.hours dd { font-weight: 600; }
.hours p { margin-top: 1rem; font-size: 0.85rem; color: var(--muted); }

.text-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 1rem;
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
}
.text-link:hover { text-decoration: underline; }

.location-layout iframe {
  width: 100%;
  height: 380px;
  border: none;
  border-radius: var(--radius);
  filter: grayscale(0.3);
}

/* ── TOAST ── */
.toast {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--surface);
  border: 1px solid var(--accent);
  color: var(--text);
  padding: 14px 28px;
  border-radius: var(--radius);
  font-size: 0.9rem;
  font-weight: 600;
  opacity: 0;
  transition: all 0.3s ease;
  pointer-events: none;
  z-index: 999;
  white-space: nowrap;
}
.toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ── RESPONSIVE ── */
@media (max-width: 900px) {
  .booking-section { grid-template-columns: 1fr; gap: 2.5rem; }
  .location-layout { grid-template-columns: 1fr; }
  .location-layout iframe { height: 260px; }
}

@media (max-width: 640px) {
  .topbar { padding: 0 1rem; gap: 0.75rem; }
  .top-cta span { display: none; }
  .top-cta { padding: 8px 12px; }
  .nav { display: none; }
  .hero { padding: 2rem 1rem; min-height: 70vh; }
  .hero-content h1 { font-size: 1.8rem; }
  .quick-strip { flex-wrap: wrap; }
  .quick-strip > div { flex: 1 1 45%; border-right: none; border-bottom: 1px solid var(--border); }
  .section, .booking-section { padding: 2.5rem 1rem; }
  .section-head h2 { font-size: 1.4rem; }
  .input-grid { grid-template-columns: 1fr; }
  .booking-panel { padding: 1.25rem; gap: 1rem; }
  .service-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .service-card { padding: 1rem; }
}

@media (max-width: 400px) {
  .service-grid { grid-template-columns: 1fr; }
  .slot-grid { grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); }
  .date-row { gap: 6px; }
  .date-btn { padding: 8px 10px; font-size: 0.75rem; }
  .date-btn strong { font-size: 1rem; }
  .quick-strip > div { flex: 1 1 100%; }
  .hero-actions { flex-direction: column; }
  .primary-action, .secondary-action { justify-content: center; }
}

/* ── BOOKING SUCCESS ── */
.booking-success {
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

.success-check {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  background: var(--accent);
  color: #000;
  border-radius: 50%;
  font-size: 1.5rem;
}
.success-check i { width: 28px; height: 28px; }

.booking-success h3 {
  font-size: 1.4rem;
  font-weight: 800;
}

.success-sub { color: var(--muted); font-size: 0.9rem; }

.success-details {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  margin-top: 0.5rem;
}
.success-details > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
}
.success-details dt {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-weight: 500;
}
.success-details dt i { width: 15px; height: 15px; }
.success-details dd { font-weight: 700; }

.success-note {
  font-size: 0.8rem;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}

/* ── FOOTER ── */
.site-footer {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 1.5rem 2rem;
}
.site-footer__inner {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.footer-links {
  margin-left: auto;
  display: flex;
  gap: 1.5rem;
}
.footer-links a {
  color: var(--muted);
  font-size: 0.85rem;
  text-decoration: none;
}
.footer-links a:hover { color: var(--text); }


`````````````````````````````````````````nFILE: cancel/index.html
`````````````````````````````````````````n<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Termin absagen</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --accent: #c9a84c;
      --bg: #0f0f0f;
      --surface: #1a1a1a;
      --border: #2e2e2e;
      --text: #f0ede8;
      --muted: #888;
      --red: #e05555;
      --green: #4caf6e;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, sans-serif;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 2.5rem 2rem;
      width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
    }
    .logo {
      font-size: 0.7rem;
      font-weight: 800;
      width: 32px; height: 32px;
      background: var(--accent);
      color: #000;
      border-radius: 8px;
      display: grid;
      place-items: center;
    }
    h1 { font-size: 1.35rem; }
    .muted { color: var(--muted); font-size: 0.9rem; }
    .detail-list {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.2rem;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      font-size: 0.9rem;
    }
    .detail-list dt { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .detail-list dd { font-weight: 600; }
    .btn {
      display: block;
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger { background: var(--red); color: #fff; }
    .btn-ghost  { background: var(--surface); color: var(--muted); border: 1px solid var(--border); }
    .status { text-align: center; font-size: 0.9rem; padding: 10px; border-radius: 8px; }
    .status.ok  { background: rgba(76,175,110,0.12); color: var(--green); }
    .status.err { background: rgba(224,85,85,0.12);  color: var(--red); }
    #loading { text-align: center; color: var(--muted); }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div id="loading">Lade Buchungsdaten…</div>
  </div>

  <script>
    const token = location.pathname.split("/cancel/")[1]?.replace(/\//g, "");

    async function loadBooking() {
      if (!token) { showError("Ungültiger Link."); return; }
      try {
        const res = await fetch(`/api/cancel/${token}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          showError(d.error || "Buchung nicht gefunden oder bereits abgesagt.");
          return;
        }
        const { booking, service, staff, salon } = await res.json();
        renderBooking(booking, service, staff, salon);
      } catch {
        showError("Verbindungsfehler. Bitte versuche es erneut.");
      }
    }

    function renderBooking(b, service, staff, salon) {
      const d = new Date(b.date + "T12:00:00");
      const dateStr = d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
      document.getElementById("card").innerHTML = `
        <div class="logo" id="salonLogo">BB</div>
        <h1>Termin absagen</h1>
        <p class="muted">Bist du sicher, dass du deinen Termin absagen möchtest?</p>
        <dl class="detail-list">
          <div><dt>Salon</dt><dd>${esc(salon.name)}</dd></div>
          <div><dt>Service</dt><dd>${esc(service.name)}</dd></div>
          <div><dt>Datum</dt><dd>${esc(dateStr)}</dd></div>
          <div><dt>Uhrzeit</dt><dd>${esc(b.time_slot)} Uhr</dd></div>
          <div><dt>Friseur</dt><dd>${esc(staff.name)}</dd></div>
        </dl>
        <div id="statusMsg"></div>
        <button class="btn btn-danger" id="cancelBtn" onclick="confirmCancel()">Termin absagen</button>
        <button class="btn btn-ghost" onclick="history.back()">Zurück</button>
      `;
      if (salon.logo_initials) document.getElementById("salonLogo").textContent = salon.logo_initials;
      if (salon.primary_color) document.getElementById("salonLogo").style.background = salon.primary_color;
    }

    async function confirmCancel() {
      const btn = document.getElementById("cancelBtn");
      btn.disabled = true;
      btn.textContent = "Wird abgesagt…";
      try {
        const res = await fetch(`/api/cancel/${token}`, { method: "POST" });
        const d = await res.json().catch(() => ({}));
        if (res.ok) {
          document.getElementById("statusMsg").innerHTML =
            `<div class="status ok">✓ Dein Termin wurde erfolgreich abgesagt.</div>`;
          btn.remove();
          document.querySelector(".btn-ghost").textContent = "Schließen";
        } else {
          document.getElementById("statusMsg").innerHTML =
            `<div class="status err">${esc(d.error || "Fehler beim Absagen. Bitte ruf uns an.")}</div>`;
          btn.disabled = false;
          btn.textContent = "Erneut versuchen";
        }
      } catch {
        document.getElementById("statusMsg").innerHTML =
          `<div class="status err">Verbindungsfehler. Bitte versuche es erneut.</div>`;
        btn.disabled = false;
        btn.textContent = "Erneut versuchen";
      }
    }

    function showError(msg) {
      document.getElementById("card").innerHTML = `
        <div class="logo">BB</div>
        <h1>Termin absagen</h1>
        <div class="status err">${esc(msg)}</div>
        <button class="btn btn-ghost" onclick="history.back()">Zurück</button>
      `;
    }

    function esc(v) {
      return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    loadBooking();
  </script>
</body>
</html>


`````````````````````````````````````````nFILE: landing/index.html
`````````````````````````````````````````n<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BarberBook â€“ Online-Buchungssystem für Barbershops</title>
  <meta name="description" content="Das Buchungssystem für Barbershops mit WhatsApp-Bestätigungen. Kunden buchen direkt online, du hast alles im Blick." />
  <link rel="stylesheet" href="/landing/landing.css" />
  <script src="/vendor/lucide/lucide.min.js" defer></script>
  <script defer>
    document.addEventListener("DOMContentLoaded", () => lucide.createIcons());
  </script>
</head>
<body>

  <header class="topbar">
    <a class="brand" href="/">
      <span class="brand-mark">BB</span>
      BarberBook
    </a>
    <nav class="top-nav">
      <a href="#features">Funktionen</a>
      <a href="#pricing">Preise</a>
    </nav>
    <a class="btn-cta" href="#contact">Jetzt starten</a>
  </header>

  <!-- HERO -->
  <section class="hero">
    <div class="hero-inner">
      <p class="eyebrow">Online-Buchung für Barbershops</p>
      <h1>Deine Kunden buchen.<br />Du schneidest.</h1>
      <p class="hero-sub">
        BarberBook gibt deinem Barbershop eine professionelle Buchungsseite â€”
        mit automatischen WhatsApp-Bestätigungen, Echtzeit-Verfügbarkeit und
        einem Admin-Panel auf dem Smartphone.
      </p>
      <div class="hero-actions">
        <a class="btn-primary" href="#contact">
          <i data-lucide="rocket"></i>
          Kostenlos testen
        </a>
        <a class="btn-ghost-hero" href="#features">
          <i data-lucide="play-circle"></i>
          Funktionen ansehen
        </a>
      </div>
      <p class="hero-note">Kein technisches Wissen nötig · Setup in 24h · Keine Provision</p>
    </div>
  </section>

  <!-- SOCIAL PROOF STRIP -->
  <div class="proof-strip">
    <div><i data-lucide="check-circle"></i> Keine Provision auf Buchungen</div>
    <div><i data-lucide="smartphone"></i> WhatsApp-Bestätigungen inklusive</div>
    <div><i data-lucide="clock"></i> Setup in 24 Stunden</div>
    <div><i data-lucide="shield"></i> Datenschutz nach DSGVO</div>
  </div>

  <!-- FEATURES -->
  <section id="features" class="section">
    <div class="section-head">
      <p class="eyebrow">Alles inklusive</p>
      <h2>Was BarberBook für dich macht</h2>
      <p>Kein Abo-Dschungel. Kein technisches Wissen. Läuft einfach.</p>
    </div>
    <div class="features-grid">
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="calendar-check"></i></div>
        <h3>Online-Buchungsseite</h3>
        <p>Deine eigene Buchungsseite mit deinen Services, Preisen und Mitarbeitern. Kunden sehen freie Zeiten in Echtzeit.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="message-circle"></i></div>
        <h3>WhatsApp-Bestätigungen</h3>
        <p>Kunden bekommen ihre Buchungsbestätigung und Erinnerungen direkt per WhatsApp. Automatisch, ohne manuellen Aufwand.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="layout-dashboard"></i></div>
        <h3>Admin-Panel auf dem Handy</h3>
        <p>Alle Termine, Mitarbeiterverwaltung und Einstellungen in einer mobilen Ãœbersicht. Kein PC nötig.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="users"></i></div>
        <h3>Mehrere Mitarbeiter</h3>
        <p>Jedem Mitarbeiter wird automatisch der passende Termin zugewiesen. Kunden wählen oder lassen zuweisen.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="bell"></i></div>
        <h3>Automatische Erinnerungen</h3>
        <p>Kunden erhalten am Vortag eine WhatsApp-Erinnerung. Weniger No-Shows, mehr Umsatz.</p>
      </div>
      <div class="feature-card">
        <div class="feature-icon"><i data-lucide="bar-chart-2"></i></div>
        <h3>Buchungsübersicht</h3>
        <p>Tages- und Wochenumsatz, No-Show-Tracking, Terminverlauf â€” alles auf einem Blick.</p>
      </div>
    </div>
  </section>

  <!-- PRICING -->
  <section id="pricing" class="section pricing-section">
    <div class="section-head">
      <p class="eyebrow">Transparente Preise</p>
      <h2>Flat-Rate. Keine Provision. Keine Ãœberraschungen.</h2>
      <p>Im Gegensatz zu Treatwell oder Fresha zahlt ihr keine Provision auf Buchungen.</p>
    </div>
    <div class="pricing-grid">
      <div class="pricing-card">
        <div class="plan-name">Starter</div>
        <div class="plan-price">â‚¬19<span>/Monat</span></div>
        <ul class="plan-features">
          <li><i data-lucide="check"></i> Buchungsseite mit eigenem Design</li>
          <li><i data-lucide="check"></i> Bis zu 2 Mitarbeiter</li>
          <li><i data-lucide="check"></i> WhatsApp-Bestätigungen</li>
          <li><i data-lucide="check"></i> Admin-Panel</li>
          <li><i data-lucide="check"></i> Eigene Domain möglich</li>
        </ul>
        <a class="btn-plan" href="#contact">Jetzt starten</a>
        <p class="plan-note">Erste 3 Monate kostenlos</p>
      </div>

      <div class="pricing-card pricing-card--featured">
        <div class="plan-badge">Beliebt</div>
        <div class="plan-name">Pro</div>
        <div class="plan-price">â‚¬39<span>/Monat</span></div>
        <ul class="plan-features">
          <li><i data-lucide="check"></i> Alles aus Starter</li>
          <li><i data-lucide="check"></i> Unbegrenzt Mitarbeiter</li>
          <li><i data-lucide="check"></i> WhatsApp AI-Posteingang</li>
          <li><i data-lucide="check"></i> Tages-Erinnerungen</li>
          <li><i data-lucide="check"></i> Statistiken & Auswertungen</li>
        </ul>
        <a class="btn-plan btn-plan--featured" href="#contact">Jetzt starten</a>
        <p class="plan-note">Erste 3 Monate kostenlos</p>
      </div>

      <div class="pricing-card">
        <div class="plan-name">Multi</div>
        <div class="plan-price">â‚¬69<span>/Monat</span></div>
        <ul class="plan-features">
          <li><i data-lucide="check"></i> Alles aus Pro</li>
          <li><i data-lucide="check"></i> Mehrere Standorte</li>
          <li><i data-lucide="check"></i> White-Label (deine eigene Marke)</li>
          <li><i data-lucide="check"></i> Prioritäts-Support</li>
          <li><i data-lucide="check"></i> Persönliches Onboarding</li>
        </ul>
        <a class="btn-plan" href="#contact">Jetzt starten</a>
        <p class="plan-note">Erste 3 Monate kostenlos</p>
      </div>
    </div>
    <p class="pricing-note">
      Alle Preise zzgl. MwSt. · Keine Einrichtungsgebühr in der Beta-Phase · Monatlich kündbar
    </p>
  </section>

  <!-- CONTACT / CTA -->
  <section id="contact" class="section contact-section">
    <div class="contact-inner">
      <div class="contact-copy">
        <p class="eyebrow">Kostenlos starten</p>
        <h2>Bereit, deinen Barbershop zu digitalisieren?</h2>
        <p>
          Hinterlasse deine Kontaktdaten. Wir melden uns innerhalb von 24h und
          richten alles für dich ein â€” komplett ohne technisches Wissen deinerseits.
        </p>
        <ul class="contact-bullets">
          <li><i data-lucide="check-circle"></i> Setup in 24 Stunden</li>
          <li><i data-lucide="check-circle"></i> Erste 3 Monate kostenlos</li>
          <li><i data-lucide="check-circle"></i> Persönliche Einrichtung inklusive</li>
        </ul>
      </div>
      <form class="contact-form" id="contactForm" onsubmit="submitContact(event)">
        <label>Name des Salons
          <input id="cfSalon" placeholder="Next Level Barbershop" required />
        </label>
        <label>Dein Name
          <input id="cfName" placeholder="Ali Hassan" required />
        </label>
        <label>WhatsApp-Nummer
          <input id="cfPhone" placeholder="+49 179 ..." required />
        </label>
        <label>Stadt
          <input id="cfCity" placeholder="München" />
        </label>
        <div id="cfSuccess" class="cf-success hidden">
          <i data-lucide="check-circle"></i>
          Danke! Wir melden uns in Kürze per WhatsApp.
        </div>
        <button type="submit" class="btn-primary" id="cfSubmit">
          <i data-lucide="send"></i>
          Jetzt anfragen
        </button>
      </form>
    </div>
  </section>

  <footer class="site-footer">
    <div class="footer-inner">
      <span class="brand-mark" style="width:28px;height:28px;font-size:0.65rem">BB</span>
      <span style="font-size:0.85rem;color:var(--muted)">© 2026 BarberBook</span>
      <nav class="footer-links">
        <a href="/superadmin">Management</a>
        <a href="mailto:info@oustech.com">Kontakt</a>
      </nav>
    </div>
  </footer>

  <script>
    async function submitContact(e) {
      e.preventDefault();
      const btn = document.getElementById(“cfSubmit”);
      btn.disabled = true;
      btn.textContent = “Wird gesendet…”;
      try {
        const res = await fetch(“/api/superadmin/leads”, {
          method: “POST”,
          headers: { “Content-Type”: “application/json” },
          body: JSON.stringify({
            salonName: document.getElementById(“cfSalon”).value.trim(),
            ownerName: document.getElementById(“cfName”).value.trim(),
            phone:     document.getElementById(“cfPhone”).value.trim(),
            city:      document.getElementById(“cfCity”).value.trim(),
          }),
        });
        if (!res.ok) throw new Error(“server”);
      } catch {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide=”send”></i> Jetzt anfragen';
        lucide.createIcons();
        alert(“Fehler beim Senden. Bitte versuche es erneut.”);
        return;
      }
      document.getElementById(“cfSuccess”).classList.remove(“hidden”);
      btn.style.display = “none”;
      lucide.createIcons();
    }
  </script>
</body>
</html>



