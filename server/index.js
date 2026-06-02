require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// Serve the customer-facing frontend
app.use(express.static(path.join(__dirname, "..", "ich-will-schauen-was-besser-ist", "barber-demo")));

// Serve the admin dashboard
app.use("/admin", express.static(path.join(__dirname, "..", "admin")));

// API routes
app.use("/api/services", require("./routes/services"));
app.use("/api/staff",    require("./routes/staff"));
app.use("/api/slots",    require("./routes/slots"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/admin",    require("./routes/admin"));

// Global error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Start reminder scheduler
require("./reminders");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Next Level Salon server running → http://localhost:${PORT}`);
  console.log(`Admin panel → http://localhost:${PORT}/admin`);
});
