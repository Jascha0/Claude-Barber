const router = require("express").Router();
const { pool } = require("../db");

router.get("/", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT * FROM staff WHERE salon_id = ? AND active = 1 ORDER BY id",
    [req.salon.id]
  );
  res.json(rows);
});

module.exports = router;
