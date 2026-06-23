require("dotenv").config();
const mysql  = require("mysql2/promise");
const bcrypt = require("bcryptjs");

async function check() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
  });
  const [[row]] = await pool.execute("SELECT value FROM settings WHERE salon_id=1 AND `key`='admin_password'");
  console.log("Stored:", row.value.substring(0, 30) + "...");
  const match = await bcrypt.compare("Barber2025!", row.value);
  console.log("Barber2025! matches:", match);
  await pool.end();
}
check().catch(console.error);
