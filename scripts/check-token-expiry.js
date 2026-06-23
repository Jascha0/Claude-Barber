require("dotenv").config();
const mysql = require("mysql2/promise");
(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
  });
  const [rows] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id=1 AND `key`='meta_waba_token_expires'"
  );
  console.log("Token expires:", rows[0]?.value || "not set");
  await pool.end();
})().catch(console.error);
