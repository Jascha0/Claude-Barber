/**
 * Test helpers — salon-agnostic.
 *
 * Every request targets the real running server (TEST_HOST:TEST_PORT, default
 * 127.0.0.1:3000) but sends a custom `Host` header so the tenant middleware
 * resolves the salon by its subdomain slug. This lets one server instance
 * serve many salons in the same test run.
 *
 * Nothing here hardcodes service IDs, prices, durations or opening hours —
 * those are read back from each salon's own API so the suite keeps working
 * when you add more shops.
 */

const http = require("http");

const TEST_HOST = process.env.TEST_HOST || "127.0.0.1";
const TEST_PORT = Number(process.env.TEST_PORT) || 3000;

/**
 * Low-level request. `host` sets the Host header (the salon subdomain);
 * the TCP target is always the local test server.
 */
function request(path, { method = "GET", body = null, host = null, token = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(data);
    }
    if (host)  headers["Host"] = host;
    if (token) headers["x-admin-token"] = token;

    const req = http.request(
      { hostname: TEST_HOST, port: TEST_PORT, path, method, headers },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }
          resolve({ status: res.statusCode, body: json, raw });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Convenience wrappers ──────────────────────────────────────────────────────
const getSalon    = (host)            => request("/api/salon",    { host });
const getServices = (host)            => request("/api/services", { host });
const getStaff    = (host)            => request("/api/staff",    { host });
const getSlots    = (host, q)         =>
  request(`/api/slots?date=${q.date}&serviceId=${q.serviceId}&staffId=${q.staffId ?? 0}`, { host });
const postBooking = (host, payload)   => request("/api/bookings", { method: "POST", body: payload, host });
const getCancel   = (token)           => request(`/api/cancel/${token}`);
const postCancel  = (token)           => request(`/api/cancel/${token}`, { method: "POST" });

// ── Date + time helpers (derive everything from the salon's own hours) ────────

function decimalToTime(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Next calendar date (YYYY-MM-DD) that falls on `dow` (0=Sun..6=Sat), at least `minAhead` days out. */
function nextDateForDow(dow, minAhead = 3) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + minAhead);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return ymd(d);
}

/** First day-of-week the salon is open, according to its hours object. null if never. */
function firstOpenDow(hours) {
  for (let dow = 0; dow <= 6; dow++) {
    if (Array.isArray(hours?.[dow]) && hours[dow].length >= 2) return dow;
  }
  return null;
}

/** First day-of-week the salon is closed. null if open every day. */
function firstClosedDow(hours) {
  for (let dow = 0; dow <= 6; dow++) {
    if (!Array.isArray(hours?.[dow])) return dow;
  }
  return null;
}

/** A phone number unique to this test run — avoids the per-customer booking limit. */
function uniquePhone() {
  return `+49170${String(Date.now()).slice(-7)}`;
}

module.exports = {
  request,
  getSalon, getServices, getStaff, getSlots, postBooking, getCancel, postCancel,
  decimalToTime, ymd, nextDateForDow, firstOpenDow, firstClosedDow, uniquePhone,
  TEST_HOST, TEST_PORT,
};
