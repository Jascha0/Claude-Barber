const DAY_NAMES      = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const DAY_NAMES_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

function esc(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

let SALON    = null;
let HOURS    = {};
let SERVICES = [];
let STAFF    = [];

let state = { serviceId: null, staffId: 0, date: null, slot: null };

// ── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  await loadSalon();
  await loadData();
  buildServiceGrid();
  buildServiceSelect();
  buildStaffSelect();
  buildDateRow();
  updateSummary();

  document.getElementById("bookingForm").addEventListener("submit", handleSubmit);
  document.getElementById("serviceSelect").addEventListener("change", e => {
    state.serviceId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
  document.getElementById("staffSelect").addEventListener("change", e => {
    state.staffId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
});

// ── SALON CONFIG ─────────────────────────────────────────────────────────────
async function loadSalon() {
  try {
    SALON = await fetch("/api/salon").then(r => r.json());
    HOURS = SALON.hours || {};
    applySalonBranding();
  } catch {
    // keep defaults if API unavailable
  }
}

function applySalonBranding() {
  const s = SALON;
  if (!s) return;

  // CSS accent color
  document.documentElement.style.setProperty("--accent", s.primaryColor);
  document.documentElement.style.setProperty("--accent-dim", darken(s.primaryColor, 0.15));

  // Page title + meta
  document.title = `${s.name} | Online buchen`;

  // DOM slots with data-salon attribute
  document.querySelectorAll("[data-salon='name']").forEach(el => el.textContent = s.name);
  document.querySelectorAll("[data-salon='initials']").forEach(el => el.textContent = s.logoInitials);
  document.querySelectorAll("[data-salon='address']").forEach(el => el.textContent = s.address || "");
  document.querySelectorAll("[data-salon='city']").forEach(el => el.textContent = s.city || "");

  // Hero image
  if (s.heroImgUrl) document.getElementById("heroImg").src = s.heroImgUrl;

  // Maps
  if (s.mapsUrl) {
    document.getElementById("mapsLink").href = s.mapsUrl;
    document.getElementById("mapsFrame").src = s.mapsUrl + "&output=embed";
  }

  // Today's hours in the quick strip
  const dow = new Date().getDay();
  const h   = HOURS[dow];
  document.getElementById("todayHours").textContent = h ? `${fmt(h[0])} – ${fmt(h[1])}` : "Heute geschlossen";

  // Full hours list in location section
  const dl = document.getElementById("hoursList");
  if (dl) {
    dl.innerHTML = DAY_NAMES_FULL.map((day, i) => {
      const dh = HOURS[i];
      return `<div><dt>${day}</dt><dd>${dh ? fmt(dh[0]) + " – " + fmt(dh[1]) : "Geschlossen"}</dd></div>`;
    }).join("");
  }
}

function darken(hex, amount) {
  const n = parseInt(hex.replace("#",""), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amount));
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function fmt(h) {
  return `${String(Math.floor(h)).padStart(2,"0")}:${String(Math.round((h%1)*60)).padStart(2,"0")}`;
}

// ── DATA ─────────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [services, staff] = await Promise.all([
      fetch("/api/services").then(r => r.json()),
      fetch("/api/staff").then(r => r.json()),
    ]);
    SERVICES = services;
    STAFF    = [{ id: 0, name: "Egal (erster freier)" }, ...staff];
    state.serviceId = SERVICES[0]?.id ?? null;
  } catch {
    showToast("Verbindung zum Server fehlgeschlagen.");
  }
}

// ── SERVICE GRID ─────────────────────────────────────────────────────────────
function buildServiceGrid() {
  const grid = document.getElementById("serviceGrid");
  if (!grid) return;
  grid.innerHTML = SERVICES.map(s => `
    <div class="service-card" data-id="${s.id}" onclick="selectServiceFromCard(${s.id})">
      <div class="service-card__name">${esc(s.name)}</div>
      <div class="service-card__meta">
        <span class="service-card__price">${s.price} €</span>
        <span class="service-card__duration"><i data-lucide="clock"></i>${s.duration} Min.</span>
      </div>
    </div>
  `).join("");
  lucide.createIcons();
}

function selectServiceFromCard(id) {
  state.serviceId = id;
  document.getElementById("serviceSelect").value = id;
  state.slot = null;
  document.querySelectorAll(".service-card").forEach(c => c.classList.toggle("selected", Number(c.dataset.id) === id));
  buildSlotGrid();
  updateSummary();
  document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
}

// ── SELECTS ──────────────────────────────────────────────────────────────────
function buildServiceSelect() {
  const sel = document.getElementById("serviceSelect");
  sel.innerHTML = SERVICES.map(s =>
    `<option value="${s.id}">${esc(s.name)} – ${s.price} €</option>`
  ).join("");
  if (SERVICES.length) state.serviceId = SERVICES[0].id;
}

function buildStaffSelect() {
  document.getElementById("staffSelect").innerHTML = STAFF.map(s =>
    `<option value="${s.id}">${esc(s.name)}</option>`
  ).join("");
}

// ── DATE ROW ─────────────────────────────────────────────────────────────────
function buildDateRow() {
  const row = document.getElementById("dateRow");
  if (!row) return;
  const today = new Date();
  let html = "";
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow    = d.getDay();
    const closed = HOURS[dow] === null || HOURS[dow] === undefined;
    const iso    = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const label  = i === 0 ? "Heute" : i === 1 ? "Morgen" : DAY_NAMES[dow];
    html += `
      <button type="button" class="date-btn${closed ? " taken" : ""}" data-date="${iso}"
        onclick="selectDate('${iso}', this)" ${closed ? "disabled" : ""}>
        <span>${label}</span>
        <strong>${d.getDate()}</strong>
        <span>${d.toLocaleString("de-DE",{month:"short"})}</span>
      </button>`;
  }
  row.innerHTML = html;
  const first = row.querySelector(".date-btn:not(.taken)");
  if (first) first.click();
}

function selectDate(iso, btn) {
  state.date = iso;
  state.slot = null;
  document.querySelectorAll(".date-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  buildSlotGrid();
  updateSummary();
}

// ── SLOT GRID ─────────────────────────────────────────────────────────────────
async function buildSlotGrid() {
  const grid = document.getElementById("slotGrid");
  if (!grid || !state.date || !state.serviceId) return;
  grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Lade Zeiten…</p>`;
  try {
    const slots = await fetch(
      `/api/slots?date=${state.date}&serviceId=${state.serviceId}&staffId=${state.staffId}`
    ).then(r => r.json());
    if (!slots.length) {
      grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Keine Zeiten verfügbar.</p>`;
      return;
    }
    const freeCount = slots.filter(s => s.available).length;
    const label = freeCount === 0
      ? `<p class="slots-label" style="color:var(--danger,#e05555)">Keine freien Zeiten</p>`
      : `<p class="slots-label">${freeCount} freie Zeit${freeCount !== 1 ? "en" : ""}</p>`;
    grid.innerHTML = label + slots.map(({ time, available }) => `
      <button type="button" class="slot-btn${!available ? " taken" : ""}"
        ${!available ? "disabled" : ""} onclick="selectSlot('${time}',this)">${time}</button>
    `).join("");
  } catch {
    grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Fehler beim Laden der Zeiten.</p>`;
  }
}

function selectSlot(slot, btn) {
  state.slot = slot;
  document.querySelectorAll(".slot-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  updateSummary();
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
function updateSummary() {
  const el = document.getElementById("bookingSummary");
  if (!el) return;
  const service = SERVICES.find(s => s.id === state.serviceId);
  if (!state.date || !state.slot || !service) {
    el.textContent = service
      ? `${service.name} – ${service.price} € · ${service.duration} Min. — Bitte Datum und Uhrzeit wählen.`
      : "Wähle Service und freien Termin.";
    return;
  }
  const d     = new Date(state.date + "T12:00:00");
  const staff = STAFF.find(s => s.id === state.staffId);
  el.textContent =
    `${service.name} · ${state.slot} Uhr · ${DAY_NAMES_FULL[d.getDay()]}, ` +
    `${d.getDate()}. ${d.toLocaleString("de-DE",{month:"long"})} · ${staff?.name ?? ""} · ${service.price} €`;
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  if (!state.date || !state.slot) { showToast("Bitte wähle ein Datum und eine Uhrzeit."); return; }

  const customerName  = document.getElementById("nameInput").value.trim();
  const customerPhone = document.getElementById("phoneInput").value.trim();

  // Basic phone validation — must start with + and have 7-15 digits
  if (!/^\+?[0-9\s\-()]{7,20}$/.test(customerPhone)) {
    showToast("Bitte gib eine gültige Telefonnummer ein (z.B. +49 179 1234567).");
    return;
  }

  const btn = e.target.querySelector(".submit-btn");
  btn.disabled = true;
  btn.textContent = "Wird gebucht…";

  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId:     state.serviceId,
        staffId:       state.staffId,
        date:          state.date,
        timeSlot:      state.slot,
        customerName,
        customerPhone,
      }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      state.slot = null;
      updateSummary();
      showToast(data.error || "Diese Zeit wurde gerade gebucht. Bitte wähle eine andere.");
      buildSlotGrid();
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="calendar-check" aria-hidden="true"></i> Termin buchen`;
      lucide.createIcons();
      return;
    }
    if (!res.ok) throw new Error();
    const data = await res.json();
    showSuccess({ data, customerName, customerPhone });
    e.target.reset();
    state.slot = null;
  } catch {
    showToast("Fehler beim Buchen. Bitte versuche es erneut.");
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="calendar-check" aria-hidden="true"></i> Termin buchen`;
    lucide.createIcons();
  }
}

function showSuccess({ data, customerName, customerPhone }) {
  const d       = new Date(state.date + "T12:00:00");
  const service = SERVICES.find(s => s.id === state.serviceId);
  const staff   = STAFF.find(s => s.id === (data.staff?.id ?? state.staffId));
  const dateStr = `${DAY_NAMES_FULL[d.getDay()]}, ${d.getDate()}. ${d.toLocaleString("de-DE",{month:"long"})}`;

  const panel = document.getElementById("bookingPanel");
  const success = document.getElementById("bookingSuccess");

  document.getElementById("successName").textContent   = customerName;
  document.getElementById("successService").textContent = service?.name ?? "";
  document.getElementById("successDate").textContent    = dateStr;
  document.getElementById("successTime").textContent    = state.slot + " Uhr";
  document.getElementById("successStaff").textContent   = staff?.id === 0 ? "Erster freier Mitarbeiter" : (staff?.name ?? data.staff?.name ?? "");
  document.getElementById("successPrice").textContent   = (service?.price ?? data.service?.price ?? "") + " €";
  document.getElementById("successPhone").textContent   = customerPhone;

  panel.style.display   = "none";
  success.style.display = "flex";
  lucide.createIcons();
  success.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetBooking() {
  document.getElementById("bookingSuccess").style.display = "none";
  document.getElementById("bookingPanel").style.display   = "flex";
  state.slot = null;
  updateSummary();
  buildSlotGrid();
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}
