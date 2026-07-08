const router = require("express").Router();
const crypto = require("crypto");
const { pool } = require("../db");
const { sendBookingConfirmationToCustomer, sendBookingAlertToStaff } = require("../messaging");
const { rules, rejectIfInvalid } = require("../middleware/validate");
const { normalizePhone } = require("../phone");

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(s1, d1, s2, d2) {
  return s1 < s2 + d2 && s2 < s1 + d1;
}

router.post("/", rules.booking, rejectIfInvalid, async (req, res) => {
  const { serviceId, staffId, date, timeSlot, customerName, customerPhone } = req.body;
  const salonId = req.salon.id;

  if (!serviceId || !date || !timeSlot || !customerName || !customerPhone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Validate date is not in the past
  const todayStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  if (date < todayStr) {
    return res.status(400).json({ error: "Cannot book in the past" });
  }

  // Validate time slot format (HH:MM)
  if (!/^\d{2}:\d{2}$/.test(timeSlot)) {
    return res.status(400).json({ error: "Invalid time slot format" });
  }

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1",
    [Number(serviceId), salonId]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  // Validate slot is within opening hours
  const [[hoursRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'hours'",
    [salonId]
  );
  if (hoursRow?.value) {
    let hours;
    try { hours = JSON.parse(hoursRow.value); } catch { /* ignore parse error */ }
    if (hours) {
      const dow = new Date(date + "T12:00:00").getDay();
      const dayHours = hours[dow];
      if (!Array.isArray(dayHours)) {
        return res.status(400).json({ error: "Salon is closed on this day" });
      }
      const [open, close] = dayHours;
      const slotMin = timeToMin(timeSlot);
      if (slotMin < Math.round(open * 60) || slotMin + service.duration > Math.round(close * 60)) {
        return res.status(400).json({ error: "Slot is outside opening hours" });
      }
    }
  }

  const [allStaffRows] = await pool.execute(
    "SELECT id FROM staff WHERE salon_id = ? AND active = 1",
    [salonId]
  );
  const allStaff = allStaffRows.map(r => r.id);

  // Validate requested staffId belongs to this salon
  const requestedStaffId = Number(staffId);
  if (requestedStaffId !== 0 && !allStaff.includes(requestedStaffId)) {
    return res.status(400).json({ error: "Staff not found" });
  }
  const targetStaff = requestedStaffId === 0 ? allStaff : [requestedStaffId];

  // Duration-aware conflict check
  const [takenBookings] = await pool.execute(`
    SELECT b.staff_id, b.time_slot, s.duration
    FROM bookings b
    JOIN services s ON b.service_id = s.id
    WHERE b.salon_id = ? AND b.date = ? AND b.status != 'cancelled'
  `, [salonId, date]);
  const [takenBlocked] = await pool.execute(
    "SELECT staff_id, time_slot FROM blocked_slots WHERE salon_id = ? AND date = ?",
    [salonId, date]
  );

  const occupiedByStaff = {};
  for (const b of takenBookings) {
    if (!occupiedByStaff[b.staff_id]) occupiedByStaff[b.staff_id] = [];
    occupiedByStaff[b.staff_id].push({ start: timeToMin(b.time_slot), duration: b.duration });
  }
  for (const b of takenBlocked) {
    if (!occupiedByStaff[b.staff_id]) occupiedByStaff[b.staff_id] = [];
    occupiedByStaff[b.staff_id].push({ start: timeToMin(b.time_slot), duration: 30 });
  }

  const slotStart = timeToMin(timeSlot);
  const assignedStaff = targetStaff.find(id => {
    const occ = occupiedByStaff[id] || [];
    return !occ.some(({ start, duration }) => overlaps(slotStart, service.duration, start, duration));
  });
  if (!assignedStaff) return res.status(409).json({ error: "Slot no longer available" });

  // Canonical E.164 form — used for the limit check and stored, so the limit
  // can't be bypassed by re-typing the number in a different format.
  const phone = normalizePhone(customerPhone) || customerPhone.trim();

  // Per-customer booking limit
  const [[limitRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'max_bookings_per_customer'",
    [salonId]
  );
  const limit = limitRow ? Number(limitRow.value) : 3;
  const [[{ n: activeCount }]] = await pool.execute(
    "SELECT COUNT(*) as n FROM bookings WHERE salon_id = ? AND customer_phone = ? AND status = 'confirmed' AND date >= CURDATE()",
    [salonId, phone]
  );
  if (activeCount >= limit) {
    return res.status(409).json({ error: `Maximale Anzahl von ${limit} aktiven Buchungen pro Kunde erreicht.` });
  }

  try {
    const cancelToken = crypto.randomUUID();
    const [result] = await pool.execute(
      "INSERT INTO bookings (salon_id, service_id, staff_id, date, time_slot, customer_name, customer_phone, cancellation_token) VALUES (?,?,?,?,?,?,?,?)",
      [salonId, service.id, assignedStaff, date, timeSlot, customerName.trim(), phone, cancelToken]
    );
    const [[booking]]  = await pool.execute("SELECT *, DATE_FORMAT(date,'%Y-%m-%d') as date FROM bookings WHERE id = ?", [result.insertId]);
    const [[staffRow]] = await pool.execute("SELECT * FROM staff WHERE id = ?", [assignedStaff]);
    const [[salon]]    = await pool.execute("SELECT * FROM salons WHERE id = ?", [salonId]);

    sendBookingConfirmationToCustomer({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});
    sendBookingAlertToStaff({ booking, service, staff: staffRow, salon, salonId }).catch(() => {});

    res.status(201).json({ booking, service, staff: staffRow });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Slot no longer available" });
    throw e;
  }
});

module.exports = router;
