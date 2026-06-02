const API = "/api/admin";
let TOKEN = localStorage.getItem("admin_token") || "";

// ── BOOT ──
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  if (TOKEN) showDashboard();

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("passwordInput").value;
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      const { token } = await res.json();
      TOKEN = token;
      localStorage.setItem("admin_token", token);
      showDashboard();
    } else {
      document.getElementById("loginError").classList.remove("hidden");
    }
  });
});

function authHeaders() {
  return { "Content-Type": "application/json", "x-admin-token": TOKEN };
}

function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  lucide.createIcons();
  switchView("today");
  setTodayDate();
}

function logout() {
  TOKEN = "";
  localStorage.removeItem("admin_token");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

// ── VIEWS ──
function switchView(name, btn) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.remove("hidden");
  if (btn) btn.classList.add("active");
  else {
    const el = document.querySelector(`[data-view="${name}"]`);
    if (el) el.classList.add("active");
  }

  if (name === "today")    loadToday();
  if (name === "bookings") loadBookings();
  if (name === "services") loadServices();
  if (name === "staff")    loadStaff();
}

function setTodayDate() {
  const el = document.getElementById("todayDate");
  if (el) el.textContent = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── TODAY ──
async function loadToday() {
  const [bookings, stats] = await Promise.all([
    fetch(`${API}/bookings/today`, { headers: authHeaders() }).then(r => r.json()),
    fetch(`${API}/stats`, { headers: authHeaders() }).then(r => r.json()),
  ]);
  renderStats(stats);
  renderBookings("todayList", bookings);
}

function renderStats(s) {
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card">
      <div class="label">Heute Termine</div>
      <div class="value">${s.todayCount}</div>
    </div>
    <div class="stat-card">
      <div class="label">Heute Umsatz</div>
      <div class="value">${s.todayRevenue} €</div>
      <div class="sub">abgeschlossene Termine</div>
    </div>
    <div class="stat-card">
      <div class="label">Diese Woche</div>
      <div class="value">${s.weekCount}</div>
      <div class="sub">${s.weekRevenue} € Umsatz</div>
    </div>
    <div class="stat-card">
      <div class="label">Gesamt</div>
      <div class="value">${s.totalBookings}</div>
      <div class="sub">Buchungen</div>
    </div>
  `;
}

// ── ALL BOOKINGS ──
async function loadBookings() {
  const date   = document.getElementById("filterDate")?.value || "";
  const status = document.getElementById("filterStatus")?.value || "";
  const params = new URLSearchParams();
  if (date)   params.set("date", date);
  if (status) params.set("status", status);
  const bookings = await fetch(`${API}/bookings?${params}`, { headers: authHeaders() }).then(r => r.json());
  renderBookings("bookingsList", bookings);
}

// ── RENDER BOOKING CARDS ──
function renderBookings(containerId, bookings) {
  const el = document.getElementById(containerId);
  if (!bookings.length) {
    el.innerHTML = `<div class="empty-msg">Keine Termine gefunden.</div>`;
    return;
  }
  el.innerHTML = bookings.map(b => `
    <div class="booking-card" id="booking-${b.id}">
      <div class="time">${b.time_slot}</div>
      <div class="info">
        <div class="customer">${b.customer_name}</div>
        <div class="details">
          ${b.service_name} · ${b.duration} Min. · ${b.price} € · ${b.staff_name}
          ${containerId !== "todayList" ? `· ${b.date}` : ""}
        </div>
        <div class="details">${b.customer_phone} · <span class="badge badge-${b.status}">${statusLabel(b.status)}</span></div>
      </div>
      <div class="actions">
        ${b.status === "confirmed" ? `
          <button class="action-btn" onclick="updateStatus(${b.id}, 'done')">Erledigt</button>
          <button class="action-btn" onclick="updateStatus(${b.id}, 'no-show')">No-Show</button>
        ` : ""}
        ${b.status !== "cancelled" ? `
          <button class="action-btn danger" onclick="updateStatus(${b.id}, 'cancelled')">Stornieren</button>
        ` : ""}
      </div>
    </div>
  `).join("");
}

function statusLabel(s) {
  return { confirmed: "Bestätigt", done: "Erledigt", "no-show": "No-Show", cancelled: "Storniert" }[s] || s;
}

async function updateStatus(id, status) {
  const res = await fetch(`${API}/bookings/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  if (res.ok) {
    showToast("Status aktualisiert.");
    // Refresh whichever view is active
    const active = document.querySelector(".view:not(.hidden)")?.id?.replace("view-","");
    if (active === "today")    loadToday();
    if (active === "bookings") loadBookings();
  }
}

// ── SERVICES ──
async function loadServices() {
  const services = await fetch(`${API}/services`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("servicesList").innerHTML = services.map(s => `
    <div class="settings-card">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.price} € · ${s.duration} Min.</div>
      </div>
      <div class="actions">
        <label class="toggle" title="${s.active ? "Aktiv" : "Inaktiv"}">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleService(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
      </div>
    </div>
  `).join("");
}

async function toggleService(id, active) {
  await fetch(`${API}/services/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active: active ? 1 : 0 }),
  });
  showToast(active ? "Service aktiviert." : "Service deaktiviert.");
}

// ── STAFF ──
async function loadStaff() {
  const staff = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("staffList").innerHTML = staff.map(s => `
    <div class="settings-card">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.active ? "Aktiv" : "Inaktiv"}</div>
      </div>
      <div class="actions">
        <label class="toggle">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleStaff(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
      </div>
    </div>
  `).join("");
}

async function toggleStaff(id, active) {
  await fetch(`${API}/staff/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active: active ? 1 : 0 }),
  });
  showToast(active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
}

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}
