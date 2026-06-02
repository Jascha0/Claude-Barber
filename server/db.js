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
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id       INT PRIMARY KEY AUTO_INCREMENT,
        name     VARCHAR(100) NOT NULL,
        price    INT NOT NULL,
        duration INT NOT NULL,
        active   TINYINT NOT NULL DEFAULT 1
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS staff (
        id     INT PRIMARY KEY AUTO_INCREMENT,
        name   VARCHAR(100) NOT NULL,
        active TINYINT NOT NULL DEFAULT 1
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\`  VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id             INT PRIMARY KEY AUTO_INCREMENT,
        service_id     INT NOT NULL,
        staff_id       INT NOT NULL,
        date           DATE NOT NULL,
        time_slot      VARCHAR(5) NOT NULL,
        customer_name  VARCHAR(100) NOT NULL,
        customer_phone VARCHAR(30) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'confirmed',
        created_at     DATETIME NOT NULL DEFAULT NOW(),
        UNIQUE KEY uq_staff_slot (staff_id, date, time_slot),
        CONSTRAINT fk_b_service FOREIGN KEY (service_id) REFERENCES services(id),
        CONSTRAINT fk_b_staff   FOREIGN KEY (staff_id)   REFERENCES staff(id)
      )
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS blocked_slots (
        id        INT PRIMARY KEY AUTO_INCREMENT,
        staff_id  INT NOT NULL,
        date      DATE NOT NULL,
        time_slot VARCHAR(5) NOT NULL,
        reason    VARCHAR(255),
        UNIQUE KEY uq_block (staff_id, date, time_slot),
        CONSTRAINT fk_bs_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
      )
    `);

    // Seed only if tables are empty
    const [[{ n: svcCount }]]      = await conn.execute("SELECT COUNT(*) as n FROM services");
    const [[{ n: staffCount }]]    = await conn.execute("SELECT COUNT(*) as n FROM staff");
    const [[{ n: settingsCount }]] = await conn.execute("SELECT COUNT(*) as n FROM settings");

    if (svcCount === 0) {
      await conn.execute(`
        INSERT INTO services (name, price, duration) VALUES
        ('Herrenhaarschnitt', 25, 30),
        ('Herrenhaarschnitt + Bart', 35, 45),
        ('Bartpflege & Styling', 18, 20),
        ('Bartrasur (klassisch)', 22, 25),
        ('Damenhaarschnitt', 30, 40),
        ('Kinder (bis 12 J.)', 15, 20),
        ('Haarpflege & Maske', 20, 20),
        ('Komplett-Paket', 50, 70)
      `);
    }

    if (staffCount === 0) {
      await conn.execute("INSERT INTO staff (name) VALUES ('Ali'), ('Mehmet'), ('Karim')");
    }

    if (settingsCount === 0) {
      const hours = JSON.stringify({
        0: null, 1: [9.5, 19], 2: [9.5, 19], 3: [9, 19],
        4: [9, 19], 5: [9.5, 19], 6: [9, 17],
      });
      await conn.execute(
        "INSERT INTO settings (`key`, value) VALUES (?,?),(?,?),(?,?),(?,?)",
        ["hours", hours, "admin_password", "barber123", "twilio_enabled", "false", "salon_phone", "+4989123456"]
      );
    }
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDb };
