require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");
const { initDb } = require("./db");
const tenant = require("./middleware/tenant");

const app = express();
app.use(cors());
app.use(express.json());

// ── Static files (tenant-agnostic templates) ──────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "ich-will-schauen-was-besser-ist", "barber-demo")));
app.use("/admin",      express.static(path.join(__dirname, "..", "admin")));
app.use("/superadmin", express.static(path.join(__dirname, "..", "superadmin")));

// ── Super admin API (no tenant context needed) ────────────────────────────────
app.use("/api/superadmin", require("./routes/superadmin"));

// ── Tenant-scoped API routes ──────────────────────────────────────────────────
app.use("/api/salon",    tenant, require("./routes/salon"));
app.use("/api/services", tenant, require("./routes/services"));
app.use("/api/staff",    tenant, require("./routes/staff"));
app.use("/api/slots",    tenant, require("./routes/slots"));
app.use("/api/bookings", tenant, require("./routes/bookings"));
app.use("/api/admin",    tenant, require("./routes/admin"));

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    require("./reminders");
    app.listen(PORT, () => {
      console.log(`Server running → http://localhost:${PORT}`);
      console.log(`Super admin  → http://localhost:${PORT}/superadmin`);
    });
  })
  .catch(err => {
    console.error("Database initialization failed:", err.message);
    process.exit(1);
  });
