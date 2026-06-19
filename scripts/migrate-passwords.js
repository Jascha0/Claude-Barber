require("dotenv").config();
const mysql   = require("mysql2/promise");
const bcrypt  = require("bcryptjs");

const NEW_SALON_PASSWORD = "Barber2025!";

async function run() {
  const pool = await mysql.createPool({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });

  const [rows] = await pool.execute(
    "SELECT salon_id, value FROM settings WHERE `key` = 'admin_password'"
  );

  for (const row of rows) {
    const hash = await bcrypt.hash(NEW_SALON_PASSWORD, 12);
    await pool.execute(
      "UPDATE settings SET value = ? WHERE salon_id = ? AND `key` = 'admin_password'",
      [hash, row.salon_id]
    );
    console.log(`Salon ${row.salon_id}: password reset and hashed`);
  }

  console.log("\nDone. New admin password for all salons:", NEW_SALON_PASSWORD);
  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
