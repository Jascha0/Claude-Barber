const router = require("express").Router();
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

// ── GDPR data subject requests (Art. 15 access / Art. 17 erasure) ─────────────
// Phone numbers are stored unnormalized, so match on the last 9 digits like the
// WhatsApp cancel handler does. Not self-service by design — an operator runs it
// to fulfil a request within the statutory one-month window.

function last9(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-9);
}

// GET /api/superadmin/customer-data?phone=...  — export everything held on a person
router.get("/customer-data", superAuth, async (req, res) => {
  const digits9 = last9(req.query.phone);
  if (digits9.length < 6) return res.status(400).json({ error: "Valid phone required" });

  const [bookings] = await pool.execute(`
    SELECT b.id, b.salon_id, sal.name AS salon_name,
           DATE_FORMAT(b.date,'%Y-%m-%d') AS date, b.time_slot, b.status,
           b.customer_name, b.customer_phone, b.created_at,
           s.name AS service_name
    FROM bookings b
    JOIN salons   sal ON b.salon_id   = sal.id
    LEFT JOIN services s ON b.service_id = s.id
    WHERE REGEXP_REPLACE(b.customer_phone, '[^0-9]', '') LIKE CONCAT('%', ?)
      AND b.customer_phone != ''
    ORDER BY b.date DESC
  `, [digits9]);

  const [messages] = await pool.execute(`
    SELECT id, salon_id, from_phone, message_text, intent, created_at
    FROM whatsapp_messages
    WHERE REGEXP_REPLACE(from_phone, '[^0-9]', '') LIKE CONCAT('%', ?)
    ORDER BY created_at DESC
  `, [digits9]);

  const [leads] = await pool.execute(`
    SELECT id, salon_name, owner_name, phone, city, created_at
    FROM leads
    WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE CONCAT('%', ?)
  `, [digits9]);

  res.json({
    query: { phone: req.query.phone, matchedOnLast9: digits9 },
    generatedAt: new Date().toISOString(),
    bookings, messages, leads,
  });
});

// DELETE /api/superadmin/customer-data?phone=...  — erase / anonymize a person's data
router.delete("/customer-data", superAuth, async (req, res) => {
  const digits9 = last9(req.query.phone);
  if (digits9.length < 6) return res.status(400).json({ error: "Valid phone required" });

  // Bookings: anonymize (keep the row so slot history / stats stay correct)
  const [b] = await pool.execute(`
    UPDATE bookings
       SET customer_name = '[gelöscht]', customer_phone = '', cancellation_token = NULL
     WHERE REGEXP_REPLACE(customer_phone, '[^0-9]', '') LIKE CONCAT('%', ?)
       AND customer_phone != ''
  `, [digits9]);

  // Messages and leads: delete outright
  const [m] = await pool.execute(
    "DELETE FROM whatsapp_messages WHERE REGEXP_REPLACE(from_phone, '[^0-9]', '') LIKE CONCAT('%', ?)",
    [digits9]
  );
  const [l] = await pool.execute(
    "DELETE FROM leads WHERE REGEXP_REPLACE(phone, '[^0-9]', '') LIKE CONCAT('%', ?)",
    [digits9]
  );

  res.json({
    ok: true,
    anonymizedBookings: b.affectedRows,
    deletedMessages: m.affectedRows,
    deletedLeads: l.affectedRows,
  });
});

module.exports = router;
