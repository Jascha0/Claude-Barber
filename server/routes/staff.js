const router = require("express").Router();
const db = require("../db");

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM staff WHERE active = 1 ORDER BY id").all();
  res.json(rows);
});

module.exports = router;
