const { pool } = require("../db");

module.exports = async function tenantMiddleware(req, res, next) {
  try {
    let salon = null;

    // 1. Dev override: SALON_SLUG env var makes every request hit the same salon
    if (process.env.SALON_SLUG) {
      const [[row]] = await pool.execute(
        "SELECT * FROM salons WHERE slug = ? AND active = 1",
        [process.env.SALON_SLUG]
      );
      salon = row || null;
    }

    if (!salon) {
      const host = req.hostname; // e.g. nextelevel.barberbook.de or localhost

      // 2. Match exact custom domain (clients who bring their own domain)
      const [[byDomain]] = await pool.execute(
        "SELECT * FROM salons WHERE domain = ? AND active = 1",
        [host]
      );
      salon = byDomain || null;

      // 3. Match subdomain slug (nextelevel.barberbook.de → slug "nextelevel")
      if (!salon) {
        const parts = host.split(".");
        if (parts.length >= 2) {
          const slug = parts[0];
          const [[bySlug]] = await pool.execute(
            "SELECT * FROM salons WHERE slug = ? AND active = 1",
            [slug]
          );
          salon = bySlug || null;
        }
      }
    }

    if (!salon) {
      return res.status(404).json({ error: "Salon not found" });
    }

    req.salon = salon;
    next();
  } catch (err) {
    next(err);
  }
};
