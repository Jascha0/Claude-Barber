const router = require("express").Router();
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
