const router = require("express").Router();
const db = require("../db");

// Simple password middleware
function auth(req, res, next) {
  const token = req.headers["x-admin-token"];
  const password = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get()?.value;
  if (!token || token !== password) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// POST /api/admin/login
router.post("/login", (req, res) => {
  const { password } = req.body;
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get()?.value;
  if (password === stored) {
    res.json({ token: stored });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});

// GET /api/admin/bookings?date=YYYY-MM-DD&status=confirmed
router.get("/bookings", auth, (req, res) => {
  const { date, status } = req.query;
  let sql = `
    SELECT b.*, s.name as service_name, s.price, s.duration,
           st.name as staff_name
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    JOIN staff st ON b.staff_id = st.id
    WHERE 1=1
  `;
  const params = [];
  if (date)   { sql += " AND b.date = ?";   params.push(date); }
  if (status) { sql += " AND b.status = ?"; params.push(status); }
  sql += " ORDER BY b.date, b.time_slot";
  res.json(db.prepare(sql).all(...params));
});

// GET /api/admin/bookings/today
router.get("/bookings/today", auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT b.*, s.name as service_name, s.price, s.duration, st.name as staff_name
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    JOIN staff st ON b.staff_id = st.id
    WHERE b.date = ? AND b.status != 'cancelled'
    ORDER BY b.time_slot
  `).all(today);
  res.json(rows);
});

// PATCH /api/admin/bookings/:id
router.patch("/bookings/:id", auth, (req, res) => {
  const { status } = req.body;
  const allowed = ["confirmed", "done", "no-show", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  const updated = db.prepare("SELECT * FROM bookings WHERE id = ?").get(Number(req.params.id));
  res.json(updated);
});

// DELETE /api/admin/bookings/:id
router.delete("/bookings/:id", auth, (req, res) => {
  db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

// POST /api/admin/blocked-slots
router.post("/blocked-slots", auth, (req, res) => {
  const { staffId, date, timeSlot, reason } = req.body;
  try {
    db.prepare(
      "INSERT OR REPLACE INTO blocked_slots (staff_id, date, time_slot, reason) VALUES (?, ?, ?, ?)"
    ).run(Number(staffId), date, timeSlot, reason || null);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /api/admin/blocked-slots
router.delete("/blocked-slots", auth, (req, res) => {
  const { staffId, date, timeSlot } = req.body;
  db.prepare(
    "DELETE FROM blocked_slots WHERE staff_id = ? AND date = ? AND time_slot = ?"
  ).run(Number(staffId), date, timeSlot);
  res.json({ ok: true });
});

// GET /api/admin/stats
router.get("/stats", auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const todayCount    = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE date = ? AND status != 'cancelled'").get(today).n;
  const todayRevenue  = db.prepare("SELECT COALESCE(SUM(s.price),0) as t FROM bookings b JOIN services s ON b.service_id=s.id WHERE b.date = ? AND b.status='done'").get(today).t;
  const weekCount     = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE date >= ? AND status != 'cancelled'").get(weekStartStr).n;
  const weekRevenue   = db.prepare("SELECT COALESCE(SUM(s.price),0) as t FROM bookings b JOIN services s ON b.service_id=s.id WHERE b.date >= ? AND b.status='done'").get(weekStartStr).t;
  const totalBookings = db.prepare("SELECT COUNT(*) as n FROM bookings WHERE status != 'cancelled'").get().n;

  res.json({ todayCount, todayRevenue, weekCount, weekRevenue, totalBookings });
});

// GET /api/admin/services  (manage services)
router.get("/services", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM services ORDER BY id").all());
});

router.patch("/services/:id", auth, (req, res) => {
  const { name, price, duration, active } = req.body;
  db.prepare("UPDATE services SET name=COALESCE(?,name), price=COALESCE(?,price), duration=COALESCE(?,duration), active=COALESCE(?,active) WHERE id=?")
    .run(name ?? null, price ?? null, duration ?? null, active ?? null, Number(req.params.id));
  res.json(db.prepare("SELECT * FROM services WHERE id=?").get(Number(req.params.id)));
});

// GET /api/admin/staff
router.get("/staff", auth, (req, res) => {
  res.json(db.prepare("SELECT * FROM staff ORDER BY id").all());
});

router.patch("/staff/:id", auth, (req, res) => {
  const { name, active } = req.body;
  db.prepare("UPDATE staff SET name=COALESCE(?,name), active=COALESCE(?,active) WHERE id=?")
    .run(name ?? null, active ?? null, Number(req.params.id));
  res.json(db.prepare("SELECT * FROM staff WHERE id=?").get(Number(req.params.id)));
});

module.exports = router;
