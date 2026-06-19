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

  if (name === "today")     loadToday();
  if (name === "bookings")  loadBookings();
  if (name === "services")  loadServices();
  if (name === "staff")     loadStaff();
  if (name === "whatsapp")  loadWhatsApp();
  if (name === "settings")  loadSettings();
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
    <div class="settings-card" id="svc-${s.id}">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.price} € · ${s.duration} Min.</div>
      </div>
      <div class="actions">
        <label class="toggle">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleService(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
        <button class="action-btn danger" onclick="deleteService(${s.id})">Löschen</button>
      </div>
    </div>
  `).join("");
}

function openServiceForm()  { document.getElementById("serviceFormWrap").classList.remove("hidden"); }
function closeServiceForm() { document.getElementById("serviceFormWrap").classList.add("hidden"); }

async function saveService() {
  const name     = document.getElementById("svcName").value.trim();
  const price    = document.getElementById("svcPrice").value;
  const duration = document.getElementById("svcDuration").value;
  if (!name || !price || !duration) { showToast("Bitte alle Felder ausfüllen."); return; }
  await fetch(`${API}/services`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name, price: Number(price), duration: Number(duration) }) });
  closeServiceForm();
  document.getElementById("svcName").value = "";
  document.getElementById("svcPrice").value = "";
  document.getElementById("svcDuration").value = "";
  showToast("Service hinzugefügt.");
  loadServices();
}

async function toggleService(id, active) {
  await fetch(`${API}/services/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ active: active ? 1 : 0 }) });
  showToast(active ? "Service aktiviert." : "Service deaktiviert.");
}

async function deleteService(id) {
  if (!confirm("Service wirklich löschen?")) return;
  await fetch(`${API}/services/${id}`, { method: "DELETE", headers: authHeaders() });
  showToast("Service gelöscht.");
  loadServices();
}

// ── STAFF ──
async function loadStaff() {
  const staff = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("staffList").innerHTML = staff.map(s => `
    <div class="settings-card" id="stf-${s.id}">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">${s.active ? "Aktiv" : "Inaktiv"}</div>
      </div>
      <div class="actions">
        <label class="toggle">
          <input type="checkbox" ${s.active ? "checked" : ""} onchange="toggleStaff(${s.id}, this.checked)" />
          <div class="toggle-track"></div>
        </label>
        <button class="action-btn danger" onclick="deleteStaff(${s.id})">Löschen</button>
      </div>
    </div>
  `).join("");
}

function openStaffForm()  { document.getElementById("staffFormWrap").classList.remove("hidden"); }
function closeStaffForm() { document.getElementById("staffFormWrap").classList.add("hidden"); }

async function saveStaff() {
  const name = document.getElementById("staffName").value.trim();
  if (!name) { showToast("Bitte Name eingeben."); return; }
  await fetch(`${API}/staff`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ name }) });
  closeStaffForm();
  document.getElementById("staffName").value = "";
  showToast("Mitarbeiter hinzugefügt.");
  loadStaff();
}

async function toggleStaff(id, active) {
  await fetch(`${API}/staff/${id}`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ active: active ? 1 : 0 }) });
  showToast(active ? "Mitarbeiter aktiviert." : "Mitarbeiter deaktiviert.");
}

async function deleteStaff(id) {
  if (!confirm("Mitarbeiter wirklich löschen?")) return;
  await fetch(`${API}/staff/${id}`, { method: "DELETE", headers: authHeaders() });
  showToast("Mitarbeiter gelöscht.");
  loadStaff();
}

// ── SETTINGS ──
const DAY_LABELS = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function decToTime(d) {
  if (d == null) return "";
  const h = Math.floor(d), m = Math.round((d % 1) * 60);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToDec(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h + m / 60;
}

async function loadSettings() {
  const [salon, hours] = await Promise.all([
    fetch(`${API}/salon`, { headers: authHeaders() }).then(r => r.json()),
    fetch(`${API}/hours`, { headers: authHeaders() }).then(r => r.json()),
  ]);

  document.getElementById("cfgName").value     = salon.name     || "";
  document.getElementById("cfgCity").value     = salon.city     || "";
  document.getElementById("cfgAddress").value  = salon.address  || "";
  document.getElementById("cfgPhone").value    = salon.phone    || "";
  document.getElementById("cfgHeroImg").value  = salon.hero_img_url || "";
  document.getElementById("cfgMapsUrl").value  = salon.maps_url || "";

  document.getElementById("hoursList").innerHTML = DAY_LABELS.map((label, i) => {
    const h = hours[i];
    const open = h ? decToTime(h[0]) : "";
    const close = h ? decToTime(h[1]) : "";
    return `
      <div class="cfg-hour-row">
        <label class="cfg-day">
          <input type="checkbox" ${h ? "checked" : ""} onchange="toggleDay(${i}, this)" id="dayCheck${i}" />
          ${label}
        </label>
        <div class="cfg-times" id="dayTimes${i}" ${!h ? 'style="opacity:0.3;pointer-events:none"' : ""}>
          <input type="time" id="open${i}"  value="${open}"  />
          <span>–</span>
          <input type="time" id="close${i}" value="${close}" />
        </div>
      </div>`;
  }).join("");
}

function toggleDay(i, cb) {
  const times = document.getElementById(`dayTimes${i}`);
  if (cb.checked) {
    times.style.opacity = "1";
    times.style.pointerEvents = "auto";
    document.getElementById(`open${i}`).value  = "09:00";
    document.getElementById(`close${i}`).value = "19:00";
  } else {
    times.style.opacity = "0.3";
    times.style.pointerEvents = "none";
  }
}

async function saveSalonInfo() {
  await fetch(`${API}/salon`, {
    method: "PATCH", headers: authHeaders(),
    body: JSON.stringify({
      name:         document.getElementById("cfgName").value.trim()    || null,
      city:         document.getElementById("cfgCity").value.trim()    || null,
      address:      document.getElementById("cfgAddress").value.trim() || null,
      phone:        document.getElementById("cfgPhone").value.trim()   || null,
      hero_img_url: document.getElementById("cfgHeroImg").value.trim() || null,
      maps_url:     document.getElementById("cfgMapsUrl").value.trim() || null,
    }),
  });
  showToast("Salon-Infos gespeichert.");
}

async function saveHours() {
  const hours = {};
  for (let i = 0; i < 7; i++) {
    const checked = document.getElementById(`dayCheck${i}`).checked;
    if (!checked) { hours[i] = null; continue; }
    const open  = timeToDec(document.getElementById(`open${i}`).value);
    const close = timeToDec(document.getElementById(`close${i}`).value);
    hours[i] = open != null && close != null ? [open, close] : null;
  }
  await fetch(`${API}/hours`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(hours) });
  showToast("Öffnungszeiten gespeichert.");
}

async function savePassword() {
  const pw  = document.getElementById("cfgNewPw").value;
  const pw2 = document.getElementById("cfgConfirmPw").value;
  if (pw !== pw2)        { showToast("Passwörter stimmen nicht überein."); return; }
  if (pw.length < 6)     { showToast("Min. 6 Zeichen erforderlich."); return; }
  const res = await fetch(`${API}/password`, { method: "PATCH", headers: authHeaders(), body: JSON.stringify({ newPassword: pw }) });
  if (res.ok) {
    showToast("Passwort geändert. Bitte neu einloggen.");
    setTimeout(logout, 2000);
  }
}

// ── WHATSAPP ──
async function loadWhatsApp() {
  // Load salon WhatsApp settings
  const settings = await fetch(`${API}/whatsapp-settings`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("waEnabled").checked        = settings.whatsapp_enabled === "true";
  document.getElementById("waPhoneNumberId").value    = settings.meta_phone_number_id || "";
  document.getElementById("waToken").value            = settings.meta_waba_token || "";
  document.getElementById("waWebhookUrl").value       = `${location.origin}/api/webhook/whatsapp`;
  document.getElementById("waVerifyToken").value      = settings.meta_webhook_verify_token || "(set META_WEBHOOK_VERIFY_TOKEN in Railway env vars)";

  // Load staff with WhatsApp numbers
  const staff = await fetch(`${API}/staff`, { headers: authHeaders() }).then(r => r.json());
  document.getElementById("staffWaList").innerHTML = staff.map(s => `
    <div class="settings-card">
      <div class="info">
        <div class="name">${s.name}</div>
        <div class="meta">Persönliche WhatsApp-Nummer</div>
      </div>
      <div class="wa-staff-input">
        <input
          placeholder="+49 ..."
          value="${s.whatsapp_phone || ""}"
          onblur="saveStaffWhatsApp(${s.id}, this.value)"
        />
      </div>
    </div>
  `).join("");
}

async function saveWaSetting(key, value) {
  await fetch(`${API}/whatsapp-settings`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ key, value }),
  });
  showToast("Gespeichert.");
}

async function saveStaffWhatsApp(staffId, phone) {
  await fetch(`${API}/staff/${staffId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ whatsapp_phone: phone.trim() || null }),
  });
  showToast("WhatsApp-Nummer gespeichert.");
}

function copyWebhookUrl() {
  navigator.clipboard.writeText(document.getElementById("waWebhookUrl").value);
  showToast("URL kopiert!");
}

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}
