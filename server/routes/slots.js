const router = require("express").Router();
const { pool } = require("../db");

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function overlaps(s1, d1, s2, d2) {
  return s1 < s2 + d2 && s2 < s1 + d1;
}

router.get("/", async (req, res) => {
  const { date, serviceId, staffId } = req.query;
  const salonId = req.salon.id;

  if (!date || !serviceId) return res.status(400).json({ error: "date and serviceId required" });

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND salon_id = ? AND active = 1",
    [Number(serviceId), salonId]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [[hoursRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'hours'",
    [salonId]
  );
  if (!hoursRow?.value) return res.json([]);
  let hours;
  try { hours = JSON.parse(hoursRow.value); } catch { return res.json([]); }

  const dow = new Date(date + "T12:00:00").getDay();
  const dayHours = hours[dow];
  if (!Array.isArray(dayHours) || dayHours.length < 2) return res.json([]);

  const [open, close] = dayHours;
  const durationH = service.duration / 60;
  const allSlots = [];
  for (let t = open; t + durationH <= close; t += 0.5) {
    allSlots.push(decimalToTime(t));
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

  // Duration-aware conflict detection: fetch bookings WITH their service durations
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

  // Build per-staff list of (start, duration) intervals
  const occupiedByStaff = {};
  for (const b of takenBookings) {
    if (!occupiedByStaff[b.staff_id]) occupiedByStaff[b.staff_id] = [];
    occupiedByStaff[b.staff_id].push({ start: timeToMin(b.time_slot), duration: b.duration });
  }
  for (const b of takenBlocked) {
    if (!occupiedByStaff[b.staff_id]) occupiedByStaff[b.staff_id] = [];
    // Blocked slots are treated as 30-minute blocks
    occupiedByStaff[b.staff_id].push({ start: timeToMin(b.time_slot), duration: 30 });
  }

  const serviceDuration = service.duration;

  res.json(allSlots.map(slot => {
    const slotStart = timeToMin(slot);
    const available = targetStaff.some(sid => {
      const occ = occupiedByStaff[sid] || [];
      return !occ.some(({ start, duration }) => overlaps(slotStart, serviceDuration, start, duration));
    });
    return { time: slot, available };
  }));
});

module.exports = router;
