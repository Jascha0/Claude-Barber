const router = require("express").Router();
const { pool } = require("../db");
const { sendConfirmation } = require("../sms");

router.post("/", async (req, res) => {
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

  try {
    const [result] = await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone) VALUES (?,?,?,?,?,?,?)",
      [salonId, service.id, assignedStaff, date, timeSlot, customerName.trim(), customerPhone.trim()]
    );
    const [[booking]]  = await pool.execute("SELECT * FROM bookings WHERE id = ?", [result.insertId]);
    const [[staffRow]] = await pool.execute("SELECT name FROM staff WHERE id = ?", [assignedStaff]);

    sendConfirmation({ booking, service, staff: staffRow, salonId }).catch(() => {});
    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slot no longer available" });
    throw e;
  }
});

module.exports = router;
