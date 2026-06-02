const API = "";  // same origin — server serves this file

const DAY_NAMES      = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const DAY_NAMES_FULL = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

const HOURS = {
  0: null,
  1: [9.5, 19], 2: [9.5, 19], 3: [9, 19],
  4: [9, 19],   5: [9.5, 19], 6: [9, 17],
};

let SERVICES = [];
let STAFF    = [];

let state = {
  serviceId: null,
  staffId: 0,
  date: null,
  slot: null,
};

// ── INIT ──
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  await loadData();
  buildServiceGrid();
  buildServiceSelect();
  buildStaffSelect();
  buildDateRow();
  updateTodayHours();
  updateSummary();

  document.getElementById("bookingForm").addEventListener("submit", handleSubmit);
  document.getElementById("serviceSelect").addEventListener("change", (e) => {
    state.serviceId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
  document.getElementById("staffSelect").addEventListener("change", (e) => {
    state.staffId = Number(e.target.value);
    state.slot = null;
    buildSlotGrid();
    updateSummary();
  });
});

async function loadData() {
  try {
    const [services, staff] = await Promise.all([
      fetch(`${API}/api/services`).then(r => r.json()),
      fetch(`${API}/api/staff`).then(r => r.json()),
    ]);
    SERVICES = services;
    STAFF    = [{ id: 0, name: "Egal (erster freier)" }, ...staff];
    state.serviceId = SERVICES[0]?.id ?? null;
  } catch {
    showToast("Verbindung zum Server fehlgeschlagen.");
  }
}

// ── TODAY HOURS ──
function updateTodayHours() {
  const el = document.getElementById("todayCount");
  if (!el) return;
  const dow = new Date().getDay();
  const h = HOURS[dow];
  el.textContent = h ? `${fmt(h[0])} - ${fmt(h[1])}` : "Heute geschlossen";
}

function fmt(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
}

// ── SERVICE GRID ──
function buildServiceGrid() {
  const grid = document.getElementById("serviceGrid");
  if (!grid) return;
  grid.innerHTML = SERVICES.map(s => `
    <div class="service-card" onclick="selectServiceFromCard(${s.id})">
      <div class="service-card__name">${s.name}</div>
      <div class="service-card__meta">
        <span class="service-card__price">${s.price} €</span>
        <span class="service-card__duration">
          <i data-lucide="clock"></i>${s.duration} Min.
        </span>
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

// ── SELECTS ──
function buildServiceSelect() {
  const sel = document.getElementById("serviceSelect");
  sel.innerHTML = SERVICES.map(s =>
    `<option value="${s.id}">${s.name} – ${s.price} €</option>`
  ).join("");
  if (SERVICES.length) state.serviceId = SERVICES[0].id;
}

function buildStaffSelect() {
  const sel = document.getElementById("staffSelect");
  sel.innerHTML = STAFF.map(s =>
    `<option value="${s.id}">${s.name}</option>`
  ).join("");
}

// ── DATE ROW ──
function buildDateRow() {
  const row = document.getElementById("dateRow");
  if (!row) return;
  const today = new Date();
  let html = "";
  for (let i = 0; i < 10; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = d.getDay();
    const closed = HOURS[dow] === null;
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? "Heute" : i === 1 ? "Morgen" : DAY_NAMES[dow];
    html += `
      <button type="button" class="date-btn${closed ? " taken" : ""}" data-date="${iso}"
        onclick="selectDate('${iso}', this)" ${closed ? "disabled" : ""}>
        <span>${label}</span>
        <strong>${d.getDate()}</strong>
        <span>${d.toLocaleString("de-DE",{month:"short"})}</span>
      </button>`;
  }
  row.innerHTML = html;
  const firstOpen = row.querySelector(".date-btn:not(.taken)");
  if (firstOpen) firstOpen.click();
}

function selectDate(iso, btn) {
  state.date = iso;
  state.slot = null;
  document.querySelectorAll(".date-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  buildSlotGrid();
  updateSummary();
}

// ── SLOT GRID ──
async function buildSlotGrid() {
  const grid = document.getElementById("slotGrid");
  if (!grid || !state.date || !state.serviceId) return;

  grid.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Lade Zeiten…</p>`;

  try {
    const slots = await fetch(
      `${API}/api/slots?date=${state.date}&serviceId=${state.serviceId}&staffId=${state.staffId}`
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

// ── SUMMARY ──
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
  const d = new Date(state.date + "T12:00:00");
  const staff = STAFF.find(s => s.id === state.staffId);
  el.textContent =
    `${service.name} · ${state.slot} Uhr · ${DAY_NAMES_FULL[d.getDay()]}, ` +
    `${d.getDate()}. ${d.toLocaleString("de-DE",{month:"long"})} · ${staff?.name ?? ""} · ${service.price} €`;
}

// ── SUBMIT ──
async function handleSubmit(e) {
  e.preventDefault();
  const name  = document.getElementById("nameInput").value.trim();
  const phone = document.getElementById("phoneInput").value.trim();

  if (!state.date || !state.slot) {
    showToast("Bitte wähle ein Datum und eine Uhrzeit.");
    return;
  }

  const btn = e.target.querySelector(".submit-btn");
  btn.disabled = true;
  btn.textContent = "Wird gebucht…";

  try {
    const res = await fetch(`${API}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId:     state.serviceId,
        staffId:       state.staffId,
        date:          state.date,
        timeSlot:      state.slot,
        customerName:  name,
        customerPhone: phone,
      }),
    });

    if (res.status === 409) {
      showToast("Diese Zeit wurde gerade gebucht. Bitte wähle eine andere.");
      buildSlotGrid();
      return;
    }
    if (!res.ok) throw new Error();

    showToast(`Termin bestätigt für ${name} um ${state.slot} Uhr! Wir freuen uns auf deinen Besuch.`);
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

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 4500);
}
