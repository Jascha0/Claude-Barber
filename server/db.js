const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

async function initDb() {
  const conn = await pool.getConnection();
  try {
    // Migration: add WhatsApp columns to existing tables if missing
    // MySQL on Railway does not support ADD COLUMN IF NOT EXISTS — use separate try/catch
    for (const tbl of ["salons", "staff"]) {
      await conn.execute(`ALTER TABLE ${tbl} ADD COLUMN whatsapp_phone VARCHAR(30)`).catch(e => {
        if (e.code !== "ER_DUP_FIELDNAME") throw e; // ignore "column already exists"
      });
    }

    // salons is the root table — must come first
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS salons (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        name           VARCHAR(100) NOT NULL,
        slug           VARCHAR(100) UNIQUE NOT NULL,
        domain         VARCHAR(255),
        address        VARCHAR(255),
        phone          VARCHAR(30),
        city           VARCHAR(100),
        primary_color  VARCHAR(7)   NOT NULL DEFAULT '#c9a84c',
        logo_initials  VARCHAR(4)   NOT NULL DEFAULT 'NL',
        hero_img_url   VARCHAR(500),
        maps_url       VARCHAR(500),
        active         TINYINT      NOT NULL DEFAULT 1,
        created_at     DATETIME     NOT NULL DEFAULT NOW()
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        name      VARCHAR(100) NOT NULL,
        price     INT NOT NULL,
        duration  INT NOT NULL,
        active    TINYINT NOT NULL DEFAULT 1,
        CONSTRAINT fk_svc_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS staff (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        salon_id       INT NOT NULL,
        name           VARCHAR(100) NOT NULL,
        active         TINYINT NOT NULL DEFAULT 1,
        whatsapp_phone VARCHAR(30),
        CONSTRAINT fk_stf_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        \`key\`   VARCHAR(100) NOT NULL,
        value     TEXT NOT NULL,
        UNIQUE KEY uq_setting (salon_id, \`key\`),
        CONSTRAINT fk_set_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        salon_id       INT NOT NULL,
        service_id     INT NOT NULL,
        staff_id       INT NOT NULL,
        date           DATE NOT NULL,
        time_slot      VARCHAR(5) NOT NULL,
        customer_name  VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        created_at     DATETIME NOT NULL DEFAULT NOW(),
        UNIQUE KEY uq_staff_slot (salon_id, staff_id, date, time_slot),
        CONSTRAINT fk_bk_salon   FOREIGN KEY (salon_id)   REFERENCES salons(id),
        CONSTRAINT fk_bk_service FOREIGN KEY (service_id) REFERENCES services(id),
        CONSTRAINT fk_bk_staff   FOREIGN KEY (staff_id)   REFERENCES staff(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        salon_id  INT NOT NULL,
        staff_id  INT NOT NULL,
        date      DATE NOT NULL,
        time_slot VARCHAR(5) NOT NULL,
        reason    VARCHAR(255),
        UNIQUE KEY uq_block (salon_id, staff_id, date, time_slot),
        CONSTRAINT fk_bl_salon FOREIGN KEY (salon_id) REFERENCES salons(id),
        CONSTRAINT fk_bl_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
      )
    `);

    // ── Seed demo salon if empty ──────────────────────────────────────────────
    const [[{ n: salonCount }]] = await conn.execute("SELECT COUNT(*) as n FROM salons");
    if (salonCount > 0) return; // already seeded

    const [salonResult] = await conn.execute(
      `INSERT INTO salons (name, slug, address, phone, city, primary_color, logo_initials, hero_img_url, maps_url)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        "Next Level Salon",
        "next-level-salon",
        "Barer Straße 68, 80799 München",
        "+4989123456",
        "München",
        "#c9a84c",
        "NL",
        "https://cdn1.treatwell.net/images/view/v2.i15345598.w1080.h720.x16FB2A17/",
        "https://www.google.com/maps?q=Barer%20Stra%C3%9Fe%2068%20M%C3%BCnchen",
      ]
    );
    const sid = salonResult.insertId;

    const insService = `INSERT INTO services (salon_id, name, price, duration) VALUES (?,?,?,?)`;
    for (const [n, p, d] of [
      ["Herrenhaarschnitt", 25, 30],
      ["Herrenhaarschnitt + Bart", 35, 45],
      ["Bartpflege & Styling", 18, 20],
      ["Bartrasur (klassisch)", 22, 25],
      ["Damenhaarschnitt", 30, 40],
      ["Kinder (bis 12 J.)", 15, 20],
      ["Haarpflege & Maske", 20, 20],
      ["Komplett-Paket", 50, 70],
    ]) await conn.execute(insService, [sid, n, p, d]);

    for (const name of ["Ali", "Mehmet", "Karim"]) {
      await conn.execute("INSERT INTO staff (salon_id, name) VALUES (?,?)", [sid, name]);
    }

    const hours = JSON.stringify({
      0: null, 1: [9.5, 19], 2: [9.5, 19], 3: [9, 19],
      4: [9, 19], 5: [9.5, 19], 6: [9, 17],
    });
    await conn.execute(
      "INSERT INTO settings (salon_id, `key`, value) VALUES (?,?,?),(?,?,?),(?,?,?),(?,?,?)",
      [sid, "hours", hours, sid, "admin_password", "barber123", sid, "twilio_enabled", "false", sid, "salon_phone", "+4989123456"]
    );
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDb };
