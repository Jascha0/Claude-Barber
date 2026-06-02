const router = require("express").Router();
const { pool } = require("../db");
const { sendConfirmation } = require("../sms");

// POST /api/bookings
router.post("/", async (req, res) => {
  const { serviceId, staffId, date, timeSlot, customerName, customerPhone } = req.body;

  if (!serviceId || !date || !timeSlot || !customerName || !customerPhone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND active = 1",
    [Number(serviceId)]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [allStaffRows] = await pool.execute("SELECT id FROM staff WHERE active = 1");
  const allStaff = allStaffRows.map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  const [takenBookingRows] = await pool.execute(
    "SELECT staff_id FROM bookings WHERE date = ? AND time_slot = ? AND status != 'cancelled'",
    [date, timeSlot]
  );
  const [blockedRows] = await pool.execute(
    "SELECT staff_id FROM blocked_slots WHERE date = ? AND time_slot = ?",
    [date, timeSlot]
  );

  const busyStaff = new Set([
    ...takenBookingRows.map(r => r.staff_id),
    ...blockedRows.map(r => r.staff_id),
  ]);
  const assignedStaff = targetStaff.find(id => !busyStaff.has(id));

  if (!assignedStaff) return res.status(409).json({ error: "Slot no longer available" });

  try {
    const [result] = await pool.execute(
      "INSERT INTO bookings (service_id, staff_id, date, time_slot, customer_name, customer_phone) VALUES (?,?,?,?,?,?)",
      [service.id, assignedStaff, date, timeSlot, customerName.trim(), customerPhone.trim()]
    );
    const [[booking]]  = await pool.execute("SELECT * FROM bookings WHERE id = ?", [result.insertId]);
    const [[staffRow]] = await pool.execute("SELECT name FROM staff WHERE id = ?", [assignedStaff]);

    sendConfirmation({ booking, service, staff: staffRow }).catch(() => {});
    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slot no longer available" });
    throw e;
  }
});

module.exports = router;
