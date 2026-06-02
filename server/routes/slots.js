const router = require("express").Router();
const { pool } = require("../db");

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// GET /api/slots?date=YYYY-MM-DD&serviceId=1&staffId=0
router.get("/", async (req, res) => {
  const { date, serviceId, staffId } = req.query;

  if (!date || !serviceId) return res.status(400).json({ error: "date and serviceId required" });

  const [[service]] = await pool.execute(
    "SELECT * FROM services WHERE id = ? AND active = 1",
    [Number(serviceId)]
  );
  if (!service) return res.status(404).json({ error: "Service not found" });

  const [[hoursRow]] = await pool.execute("SELECT value FROM settings WHERE `key` = 'hours'");
  const hours = JSON.parse(hoursRow.value);

  const dow = new Date(date + "T12:00:00").getDay();
  const dayHours = hours[dow];
  if (!dayHours) return res.json([]);

  const [open, close] = dayHours;
  const step = 0.5;
  const durationH = service.duration / 60;

  const allSlots = [];
  for (let t = open; t + durationH <= close; t += step) {
    allSlots.push(decimalToTime(t));
  }

  const [allStaffRows] = await pool.execute("SELECT id FROM staff WHERE active = 1");
  const allStaff = allStaffRows.map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  const [takenBookings] = await pool.execute(
    "SELECT staff_id, time_slot FROM bookings WHERE date = ? AND status != 'cancelled'",
    [date]
  );
  const [takenBlocked] = await pool.execute(
    "SELECT staff_id, time_slot FROM blocked_slots WHERE date = ?",
    [date]
  );

  const takenByStaff = {};
  [...takenBookings, ...takenBlocked].forEach(({ staff_id, time_slot }) => {
    if (!takenByStaff[staff_id]) takenByStaff[staff_id] = new Set();
    takenByStaff[staff_id].add(time_slot);
  });

  const result = allSlots.map(slot => {
    const available = targetStaff.some(sid => {
      const taken = takenByStaff[sid] || new Set();
      return !taken.has(slot);
    });
    return { time: slot, available };
  });

  res.json(result);
});

module.exports = router;
