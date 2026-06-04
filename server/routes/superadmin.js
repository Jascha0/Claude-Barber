const router = require("express").Router();
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
    await conn.execute(
      "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?)",
      [
        salonId, "hours",           hours,
        salonId, "admin_password",  adminPassword || "barber123",
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

module.exports = router;
