-- Next Level Salon — MySQL schema
-- Run once against your Strato MySQL database to create all tables.

CREATE TABLE IF NOT EXISTS services (
  id       INT PRIMARY KEY AUTO_INCREMENT,
  name     VARCHAR(100) NOT NULL,
  price    INT NOT NULL,
  duration INT NOT NULL,
  active   TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff (
  id     INT PRIMARY KEY AUTO_INCREMENT,
  name   VARCHAR(100) NOT NULL,
  active TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  `key`  VARCHAR(100) PRIMARY KEY,
  value  TEXT NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  staff_id  INT NOT NULL,
  date      DATE NOT NULL,
  time_slot VARCHAR(5) NOT NULL,
  reason    VARCHAR(255),
  UNIQUE KEY uq_block (staff_id, date, time_slot),
  CONSTRAINT fk_bs_staff FOREIGN KEY (staff_id) REFERENCES staff(id)
);
