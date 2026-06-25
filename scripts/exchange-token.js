/**
 * One-time script: exchanges the current WhatsApp token for a 60-day token.
 * Run with: node scripts/exchange-token.js <YOUR_APP_SECRET>
 * The App Secret is found in: Meta Developer Console → Messagekey → App Settings → Basic → App Secret
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

const appSecret = process.argv[2];
const appId = process.env.META_APP_ID || "2107621246769564";

if (!appSecret) {
  console.error("Usage: node scripts/exchange-token.js <APP_SECRET>");
  console.error("Find it: Meta Developer Console → Messagekey → App Settings → Basic → App Secret (click Show)");
  process.exit(1);
}

(async () => {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME,
  });

  const [[row]] = await pool.execute(
    "SELECT value FROM settings WHERE salon_id=1 AND `key`='meta_waba_token'"
  );

  if (!row?.value) { console.error("No token found in DB"); process.exit(1); }

  console.log("Current token found in DB, attempting exchange...");

  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${row.value}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    console.error("Meta API error:", JSON.stringify(data.error, null, 2));
    process.exit(1);
  }

  if (!data.access_token) {
    console.error("Unexpected response:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  const expires = new Date();
  expires.setDate(expires.getDate() + 60);
  const expiresStr = expires.toISOString().slice(0, 10);

  await pool.execute(
    "INSERT INTO settings (salon_id,`key`,value) VALUES (1,'meta_waba_token',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [data.access_token]
  );
  await pool.execute(
    "INSERT INTO settings (salon_id,`key`,value) VALUES (1,'meta_waba_token_expires',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [expiresStr]
  );

  console.log(`✅ Token exchanged successfully!`);
  console.log(`   New token length: ${data.access_token.length} chars`);
  console.log(`   Expires: ${expiresStr}`);
  console.log(`   From now on the server renews it automatically every 60 days.`);

  await pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
