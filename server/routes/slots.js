const router = require("express").Router();
const { pool } = require("../db");

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  const [takenBookings] = await pool.execute(
    "SELECT staff_id, time_slot FROM bookings WHERE salon_id = ? AND date = ? AND status != 'cancelled'",
    [salonId, date]
  );
  const [takenBlocked] = await pool.execute(
    "SELECT staff_id, time_slot FROM blocked_slots WHERE salon_id = ? AND date = ?",
    [salonId, date]
  );

  const takenByStaff = {};
  [...takenBookings, ...takenBlocked].forEach(({ staff_id, time_slot }) => {
    if (!takenByStaff[staff_id]) takenByStaff[staff_id] = new Set();
    takenByStaff[staff_id].add(time_slot);
  });

  res.json(allSlots.map(slot => ({
    time: slot,
    available: targetStaff.some(sid => !(takenByStaff[sid] || new Set()).has(slot)),
  })));
});

module.exports = router;
