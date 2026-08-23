const router = require("express").Router();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { normalizePhone } = require("../phone");

// TEMPORARY — manual end-to-end test trigger for the reminder cron, superadmin-gated.
// Remove after the WhatsApp go-live test is confirmed working.
router.post("/debug/send-reminders", superAuth, async (req, res) => {
  const { sendDueReminders } = require("../reminders");
  const count = await sendDueReminders();
  res.json({ sent: count });
});

// Constant-time comparison of the configured super-admin password.
function passwordMatches(input) {
  const expected = process.env.SUPER_ADMIN_PASSWORD;
  if (!expected || !input) return false;
  const a = Buffer.from(String(input));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Auth via server-side session token (not the password itself).
async function superAuth(req, res, next) {
  const token = req.headers["x-super-token"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  const [[session]] = await pool.execute(
    "SELECT id FROM super_sessions WHERE token = ? AND expires_at > NOW()",
    [token]
  );
  if (!session) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// POST /api/superadmin/login  — exchange the password for a random session token
router.post("/login", async (req, res) => {
  if (!passwordMatches(req.body?.password)) {
    return res.status(401).json({ error: "Wrong password" });
  }
  const token = crypto.randomBytes(32).toString("hex");
  const expiresStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  await pool.execute("DELETE FROM super_sessions WHERE expires_at < NOW()");
  await pool.execute("INSERT INTO super_sessions (token, expires_at) VALUES (?,?)", [token, expiresStr]);
  res.json({ token });
});

// POST /api/superadmin/logout  — invalidate the current session token
router.post("/logout", async (req, res) => {
  const token = req.headers["x-super-token"];
  if (token) await pool.execute("DELETE FROM super_sessions WHERE token = ?", [token]).catch(() => {});
  res.json({ ok: true });
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

    // Seed starter services + staff so the salon is immediately bookable.
    // The owner edits, renames, or deletes these in the admin panel.
    // Optional: the request may pass its own `services` / `staff` to override.
    const services = Array.isArray(req.body.services) && req.body.services.length
      ? req.body.services
      : [
          { name: "Herrenhaarschnitt",   price: 25, duration: 30 },
          { name: "Haarschnitt & Bart",  price: 35, duration: 45 },
          { name: "Bartpflege",          price: 18, duration: 20 },
          { name: "Kinderhaarschnitt",   price: 15, duration: 20 },
        ];
    for (const s of services) {
      await conn.execute(
        "INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)",
        [salonId, String(s.name).trim(), Number(s.price), Number(s.duration)]
      );
    }

    const staff = Array.isArray(req.body.staff) && req.body.staff.length
      ? req.body.staff
      : ["Mitarbeiter 1"];
    for (const memberName of staff) {
      await conn.execute(
        "INSERT INTO staff (salon_id, name) VALUES (?,?)",
        [salonId, String(memberName).trim()]
      );
    }

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

// POST /api/superadmin/salons/:id/reset-password — reset a salon's admin password (locked-out recovery)
router.post("/salons/:id/reset-password", superAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "newPassword must be at least 6 characters" });
  }

  const [[salon]] = await pool.execute("SELECT id FROM salons WHERE id = ?", [id]);
  if (!salon) return res.status(404).json({ error: "Salon not found" });

  const hash = await bcrypt.hash(newPassword, 12);
  await pool.execute(
    "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [id, "admin_password", hash]
  );
  // Old password's sessions are now meaningless — drop them.
  await pool.execute("DELETE FROM sessions WHERE salon_id = ?", [id]);

  res.json({ ok: true });
});

// POST /api/leads — public, no auth required (from landing page contact form)
router.post("/leads", async (req, res) => {
  const { salonName, ownerName, phone, city } = req.body;
  if (!salonName || !ownerName || !phone) {
    return res.status(400).json({ error: "salonName, ownerName and phone are required" });
  }
  await pool.execute(
    "INSERT INTO leads (salon_name, owner_name, phone, city) VALUES (?,?,?,?)",
    [salonName.trim(), ownerName.trim(), normalizePhone(phone) || phone.trim(), (city || "").trim() || null]
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

// ── GDPR data subject requests (Art. 15 access / Art. 17 erasure) ─────────────
// Phone numbers are stored unnormalized, so match on the last 9 digits like the
// WhatsApp cancel handler does. Not self-service by design — an operator runs it
// to fulfil a request within the statutory one-month window.

// GET /api/superadmin/customer-data?phone=...  — export everything held on a person
router.get("/customer-data", superAuth, async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (phone.replace(/\D/g, "").length < 6) return res.status(400).json({ error: "Valid phone required" });

  const [bookings] = await pool.execute(`
    SELECT b.id, b.salon_id, sal.name AS salon_name,
           DATE_FORMAT(b.date,'%Y-%m-%d') AS date, b.time_slot, b.status,
           b.customer_name, b.customer_phone, b.created_at,
           s.name AS service_name
    FROM bookings b
    JOIN salons   sal ON b.salon_id   = sal.id
    LEFT JOIN services s ON b.service_id = s.id
    WHERE b.customer_phone = ?
    ORDER BY b.date DESC
  `, [phone]);

  const [messages] = await pool.execute(`
    SELECT id, salon_id, from_phone, message_text, intent, created_at
    FROM whatsapp_messages
    WHERE from_phone = ?
    ORDER BY created_at DESC
  `, [phone]);

  const [leads] = await pool.execute(`
    SELECT id, salon_name, owner_name, phone, city, created_at
    FROM leads
    WHERE phone = ?
  `, [phone]);

  res.json({
    query: { phone: req.query.phone, matchedOn: phone },
    generatedAt: new Date().toISOString(),
    bookings, messages, leads,
  });
});

// DELETE /api/superadmin/customer-data?phone=...  — erase / anonymize a person's data
router.delete("/customer-data", superAuth, async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (phone.replace(/\D/g, "").length < 6) return res.status(400).json({ error: "Valid phone required" });

  // Bookings: anonymize (keep the row so slot history / stats stay correct)
  const [b] = await pool.execute(`
    UPDATE bookings
       SET customer_name = '[gelöscht]', customer_phone = '', cancellation_token = NULL
     WHERE customer_phone = ?
  `, [phone]);

  // Messages and leads: delete outright
  const [m] = await pool.execute(
    "DELETE FROM whatsapp_messages WHERE from_phone = ?",
    [phone]
  );
  const [l] = await pool.execute(
    "DELETE FROM leads WHERE phone = ?",
    [phone]
  );

  res.json({
    ok: true,
    anonymizedBookings: b.affectedRows,
    deletedMessages: m.affectedRows,
    deletedLeads: l.affectedRows,
  });
});

module.exports = router;
