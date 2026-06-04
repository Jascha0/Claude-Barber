const router = require("express").Router();
const { pool } = require("../db");

async function auth(req, res, next) {
  const token   = req.headers["x-admin-token"];
  const salonId = req.salon.id;
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'admin_password'",
    [salonId]
  );
  if (!token || token !== row?.value) return res.status(401).json({ error: "Unauthorized" });
  next();
}

// POST /api/admin/login
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'admin_password'",
    [req.salon.id]
  );
  if (password === row?.value) res.json({ token: row.value });
  else res.status(401).json({ error: "Wrong password" });
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
  const today = new Date().toISOString().slice(0, 10);
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
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const ws = weekStart.toISOString().slice(0, 10);

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
  const { name, active } = req.body;
  const id = Number(req.params.id);
  await pool.execute(
    "UPDATE staff SET name=COALESCE(?,name), active=COALESCE(?,active) WHERE id=? AND salon_id=?",
    [name ?? null, active ?? null, id, req.salon.id]
  );
  const [[updated]] = await pool.execute("SELECT * FROM staff WHERE id=?", [id]);
  res.json(updated);
});

module.exports = router;
