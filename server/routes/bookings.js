const router = require("express").Router();
const { pool } = require("../db");
const { sendBookingConfirmationToCustomer, sendBookingAlertToStaff } = require("../messaging");
const { rules, rejectIfInvalid } = require("../middleware/validate");

router.post("/", rules.booking, rejectIfInvalid, async (req, res) => {
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

  // Per-customer booking limit
  const [[limitRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'max_bookings_per_customer'",
    [salonId]
  );
  const limit = limitRow ? Number(limitRow.value) : 3;
  const [[{ n: activeCount }]] = await pool.execute(
    "SELECT COUNT(*) as n FROM bookings WHERE salon_id = ? AND customer_phone = ? AND status = 'confirmed' AND date >= CURDATE()",
    [salonId, customerPhone.trim()]
  );
  if (activeCount >= limit) {
    return res.status(409).json({ error: `Maximale Anzahl von ${limit} aktiven Buchungen pro Kunde erreicht.` });
  }

  try {
    const [result] = await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone) VALUES (?,?,?,?,?,?,?)",
      [salonId, service.id, assignedStaff, date, timeSlot, customerName.trim(), customerPhone.trim()]
    );
    const [[booking]]  = await pool.execute("SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM bookings WHERE id = ?", [result.insertId]);
    const [[staffRow]] = await pool.execute("SELECT * FROM staff WHERE id = ?", [assignedStaff]);
    const [[salon]]    = await pool.execute("SELECT * FROM salons WHERE id = ?", [salonId]);

    // Fire-and-forget: customer confirmation + staff alert via WhatsApp
    sendBookingConfirmationToCustomer({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});
    sendBookingAlertToStaff({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});

    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slot no longer available" });
    throw e;
  }
});

module.exports = router;
