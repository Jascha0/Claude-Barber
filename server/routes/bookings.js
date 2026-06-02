const router = require("express").Router();
const db = require("../db");
const { sendConfirmation } = require("../sms");

// POST /api/bookings
router.post("/", (req, res) => {
  const { serviceId, staffId, date, timeSlot, customerName, customerPhone } = req.body;

  if (!serviceId || !date || !timeSlot || !customerName || !customerPhone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const service = db.prepare("SELECT * FROM services WHERE id = ? AND active = 1").get(Number(serviceId));
  if (!service) return res.status(404).json({ error: "Service not found" });

  const allStaff = db.prepare("SELECT id FROM staff WHERE active = 1").all().map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  // Find first available staff member for this slot
  const takenStaff = db.prepare(
    "SELECT staff_id FROM bookings WHERE date = ? AND time_slot = ? AND status != 'cancelled'"
  ).all(date, timeSlot).map(r => r.staff_id);

  const blockedStaff = db.prepare(
    "SELECT staff_id FROM blocked_slots WHERE date = ? AND time_slot = ?"
  ).all(date, timeSlot).map(r => r.staff_id);

  const busyStaff = new Set([...takenStaff, ...blockedStaff]);
  const assignedStaff = targetStaff.find(id => !busyStaff.has(id));

  if (!assignedStaff) {
    return res.status(409).json({ error: "Slot no longer available" });
  }

  try {
    const result = db.prepare(
      `INSERT INTO bookings (service_id, staff_id, date, time_slot, customer_name, customer_phone)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(service.id, assignedStaff, date, timeSlot, customerName.trim(), customerPhone.trim());

    const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(result.lastInsertRowid);
    const staffRow = db.prepare("SELECT name FROM staff WHERE id = ?").get(assignedStaff);

    sendConfirmation({ booking, service, staff: staffRow }).catch(() => {});

    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Slot no longer available" });
    }
    throw e;
  }
});

module.exports = router;
