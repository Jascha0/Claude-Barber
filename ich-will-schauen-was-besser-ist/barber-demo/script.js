const DAY_NAMES      = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const DAY_NAMES_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

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
    <div class="service-card" onclick="selectServiceFromCard(${s.id})">
      <div class="service-card__name">${s.name}</div>
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
  buildSlotGrid();
  updateSummary();
  document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
}

// ── SELECTS ──────────────────────────────────────────────────────────────────
function buildServiceSelect() {
  const sel = document.getElementById("serviceSelect");
  sel.innerHTML = SERVICES.map(s =>
    `<option value="${s.id}">${s.name} – ${s.price} €</option>`
  ).join("");
  if (SERVICES.length) state.serviceId = SERVICES[0].id;
}

function buildStaffSelect() {
  document.getElementById("staffSelect").innerHTML = STAFF.map(s =>
    `<option value="${s.id}">${s.name}</option>`
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
    const iso    = d.toISOString().slice(0, 10);
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
      grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Heute keine freien Zeiten.</p>`;
      return;
    }
    grid.innerHTML = slots.map(({ time, available }) => `
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
        customerName:  document.getElementById("nameInput").value.trim(),
        customerPhone: document.getElementById("phoneInput").value.trim(),
      }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Diese Zeit wurde gerade gebucht. Bitte wähle eine andere.");
      buildSlotGrid();
      return;
    }
    if (!res.ok) throw new Error();
    showToast(`Termin bestätigt für ${document.getElementById("nameInput").value.trim()} um ${state.slot} Uhr!`);
    e.target.reset();
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  } catch {
    showToast("Fehler beim Buchen. Bitte versuche es erneut.");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="calendar-check" aria-hidden="true"></i> Termin buchen`;
    lucide.createIcons();
  }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}
