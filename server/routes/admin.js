const router  = require("express").Router();
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
    SELECT b.*, s.name as service_name, s.price, s.duration, st.name as staff_name
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
    SELECT b.*, s.name as service_name, s.price, s.duration, st.name as staff_name
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

// POST /api/admin/blocked-slots
router.post("/blocked-slots", auth, async (req, res) => {
  const { staffId, date, timeSlot, reason } = req.body;
  try {
    await pool.execute(
      `INSERT INTO blocked_slots (salon_id, staff_id, date, time_slot, reason) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason)`,
      [req.salon.id, Number(staffId), date, timeSlot, reason || null]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/admin/blocked-slots
router.delete("/blocked-slots", auth, async (req, res) => {
  const { staffId, date, timeSlot } = req.body;
  await pool.execute(
    "DELETE FROM blocked_slots WHERE salon_id = ? AND staff_id = ? AND date = ? AND time_slot = ?",
    [req.salon.id, Number(staffId), date, timeSlot]
  );
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

// GET /api/admin/debug-token-exchange — temporary diagnostic endpoint
router.get("/debug-token-exchange", auth, async (req, res) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return res.json({ error: "META_APP_ID or META_APP_SECRET not set in env" });

  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id=? AND `key`='meta_waba_token'",
    [req.salon.id]
  );
  if (!row?.value) return res.json({ error: "No token in DB" });

  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${row.value}`;
  const metaRes = await fetch(url);
  const data = await metaRes.json();

  if (data.error) return res.json({ metaError: data.error });
  if (data.access_token) return res.json({ success: true, tokenLength: data.access_token.length, expiresIn: data.expires_in });
  return res.json({ unexpected: data });
});

// GET /api/admin/whatsapp-settings
router.get("/whatsapp-settings", auth, async (req, res) => {
  const keys = ["whatsapp_enabled", "meta_phone_number_id", "meta_waba_token", "meta_webhook_verify_token"];
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
  });
});

// PATCH /api/admin/salon — update salon public info
router.patch("/salon", auth, rules.updateSalon, rejectIfInvalid, async (req, res) => {
  const { name, address, phone, city, hero_img_url, maps_url } = req.body;
  await pool.execute(
    `UPDATE salons SET
      name=COALESCE(?,name), address=COALESCE(?,address), phone=COALESCE(?,phone),
      city=COALESCE(?,city), hero_img_url=COALESCE(?,hero_img_url), maps_url=COALESCE(?,maps_url)
     WHERE id=?`,
    [name||null, address||null, phone||null, city||null, hero_img_url||null, maps_url||null, req.salon.id]
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
