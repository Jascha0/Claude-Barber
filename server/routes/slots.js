const router = require("express").Router();
const db = require("../db");

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

// GET /api/slots?date=YYYY-MM-DD&serviceId=1&staffId=0
router.get("/", (req, res) => {
  const { date, serviceId, staffId } = req.query;

  if (!date || !serviceId) {
    return res.status(400).json({ error: "date and serviceId required" });
  }

  const service = db.prepare("SELECT * FROM services WHERE id = ? AND active = 1").get(Number(serviceId));
  if (!service) return res.status(404).json({ error: "Service not found" });

  const hoursRaw = db.prepare("SELECT value FROM settings WHERE key = 'hours'").get();
  const hours = JSON.parse(hoursRaw.value);

  const dow = new Date(date + "T12:00:00").getDay();
  const dayHours = hours[dow];
  if (!dayHours) return res.json([]);

  const [open, close] = dayHours;
  const step = 0.5; // 30 min steps
  const durationH = service.duration / 60;

  const allSlots = [];
  for (let t = open; t + durationH <= close; t += step) {
    allSlots.push(decimalToTime(t));
  }

  // Get all active staff if staffId=0 (any)
  const allStaff = db.prepare("SELECT id FROM staff WHERE active = 1").all().map(r => r.id);
  const targetStaff = Number(staffId) === 0 ? allStaff : [Number(staffId)];

  // Fetch taken slots (bookings + blocked) for the date
  const takenBookings = db.prepare(
    "SELECT staff_id, time_slot FROM bookings WHERE date = ? AND status != 'cancelled'"
  ).all(date);

  const takenBlocked = db.prepare(
    "SELECT staff_id, time_slot FROM blocked_slots WHERE date = ?"
  ).all(date);

  const takenByStaff = {};
  [...takenBookings, ...takenBlocked].forEach(({ staff_id, time_slot }) => {
    if (!takenByStaff[staff_id]) takenByStaff[staff_id] = new Set();
    takenByStaff[staff_id].add(time_slot);
  });

  const result = allSlots.map(slot => {
    // A slot is available if at least one of the target staff is free
    const available = targetStaff.some(sid => {
      const taken = takenByStaff[sid] || new Set();
      return !taken.has(slot);
    });
    return { time: slot, available };
  });

  res.json(result);
});

module.exports = router;
