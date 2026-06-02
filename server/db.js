const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "salon.db");

const fs = require("fs");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    price    INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    active   INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS staff (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT    NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id     INTEGER NOT NULL REFERENCES services(id),
    staff_id       INTEGER NOT NULL REFERENCES staff(id),
    date           TEXT    NOT NULL,
    time_slot      TEXT    NOT NULL,
    customer_name  TEXT    NOT NULL,
    customer_phone TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'confirmed',
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (staff_id, date, time_slot)
  );

  CREATE TABLE IF NOT EXISTS blocked_slots (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    date     TEXT    NOT NULL,
    time_slot TEXT   NOT NULL,
    reason   TEXT,
    UNIQUE (staff_id, date, time_slot)
  );
`);

// Seed only if tables are empty
const seed = db.transaction(() => {
  if (db.prepare("SELECT COUNT(*) as n FROM services").get().n === 0) {
    const ins = db.prepare("INSERT INTO services (name, price, duration) VALUES (?, ?, ?)");
    [
      ["Herrenhaarschnitt",         25, 30],
      ["Herrenhaarschnitt + Bart",  35, 45],
      ["Bartpflege & Styling",      18, 20],
      ["Bartrasur (klassisch)",     22, 25],
      ["Damenhaarschnitt",          30, 40],
      ["Kinder (bis 12 J.)",        15, 20],
      ["Haarpflege & Maske",        20, 20],
      ["Komplett-Paket",            50, 70],
    ].forEach(r => ins.run(...r));
  }

  if (db.prepare("SELECT COUNT(*) as n FROM staff").get().n === 0) {
    const ins = db.prepare("INSERT INTO staff (name) VALUES (?)");
    ["Ali", "Mehmet", "Karim"].forEach(n => ins.run(n));
  }

  if (db.prepare("SELECT COUNT(*) as n FROM settings").get().n === 0) {
    const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    // hours: [open, close] in decimal hours, null = closed
    ins.run("hours", JSON.stringify({
      0: null,
      1: [9.5, 19],
      2: [9.5, 19],
      3: [9,   19],
      4: [9,   19],
      5: [9.5, 19],
      6: [9,   17],
    }));
    ins.run("admin_password", "barber123");
    ins.run("twilio_enabled", "false");
    ins.run("salon_phone", "+4989123456");
  }
});

seed();

module.exports = db;
