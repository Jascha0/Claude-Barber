const router = require("express").Router();
const { pool } = require("../db");

// GET /api/salon  — public salon info used by the customer frontend
router.get("/", async (req, res) => {
  const { id } = req.salon;

  const [[hoursRow]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id = ? AND `key` = 'hours'",
    [id]
  );
  const hours = hoursRow ? JSON.parse(hoursRow.value) : {};

  const s = req.salon;
  res.json({
    name:         s.name,
    slug:         s.slug,
    address:      s.address,
    phone:        s.phone,
    city:         s.city,
    primaryColor: s.primary_color,
    logoInitials: s.logo_initials,
    heroImgUrl:   s.hero_img_url,
    mapsUrl:      s.maps_url,
    hours,
  });
});

module.exports = router;
