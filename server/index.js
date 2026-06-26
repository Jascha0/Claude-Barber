require("dotenv").config();
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const rateLimit  = require("express-rate-limit");
const path       = require("path");
const { initDb } = require("./db");
const tenant     = require("./middleware/tenant");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "https:"],
      frameSrc:    ["https://www.google.com"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use((_, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));

// Raw body needed for WhatsApp webhook signature verification — must come before express.json()
app.use("/api/webhook", express.raw({ type: "application/json" }));
app.use(express.json());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many booking requests. Try again later." },
});

const leadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

app.use("/api/admin/login",     loginLimiter);
app.use("/api/bookings",        bookingLimiter);
app.use("/api/superadmin/leads", leadsLimiter);

// ── Static files (tenant-agnostic templates) ──────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "ich-will-schauen-was-besser-ist", "barber-demo")));
app.use("/admin",      express.static(path.join(__dirname, "..", "admin")));
app.use("/superadmin", express.static(path.join(__dirname, "..", "superadmin")));
app.use("/landing",    express.static(path.join(__dirname, "..", "landing")));
app.use("/vendor/lucide", express.static(path.join(__dirname, "..", "node_modules", "lucide", "dist", "umd")));

// Cancellation page — token is in the URL path, served as SPA
app.get("/cancel/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "cancel", "index.html"));
});

// ── Root-domain (barberbook.de with no subdomain → landing page) ─────────────
app.get("/", (req, res, next) => {
  const parts = req.hostname.split(".");
  // Root domain has ≤2 parts (e.g. barberbook.de); subdomains have ≥3
  if (parts.length <= 2 && req.hostname !== "localhost") {
    return res.sendFile(path.join(__dirname, "..", "landing", "index.html"));
  }
  next();
});

// ── Super admin API (no tenant context needed) ────────────────────────────────
app.use("/api/superadmin", require("./routes/superadmin"));

// ── Self-cancellation API (no tenant context — keyed by cancellation_token) ──
app.use("/api/cancel", require("./routes/cancel"));

// ── Meta WhatsApp webhook (no tenant context — identified by phone number ID) ─
app.use("/api/webhook", require("./routes/webhook"));

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
