const API = "/api/superadmin";
let TOKEN = localStorage.getItem("super_token") || "";

function esc(v) {
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
  if (TOKEN) showDashboard();

  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("passwordInput").value }),
    });
    if (res.ok) {
      const { token } = await res.json();
      TOKEN = token;
      localStorage.setItem("super_token", token);
      showDashboard();
    } else {
      document.getElementById("loginError").classList.remove("hidden");
    }
  });

  // Sync color picker ↔ hex input
  document.getElementById("fColor").addEventListener("input", e => {
    document.getElementById("fColorHex").value = e.target.value;
  });
  document.getElementById("fColorHex").addEventListener("input", e => {
    const v = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) document.getElementById("fColor").value = v;
  });

  // Auto-generate slug from name
  document.getElementById("fName").addEventListener("input", e => {
    if (!document.getElementById("editId").value) {
      document.getElementById("fSlug").value = e.target.value
        .toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }
    if (!document.getElementById("fInitials").value) {
      const words = e.target.value.trim().split(/\s+/);
      document.getElementById("fInitials").value = words.slice(0, 2).map(w => w[0]).join("").toUpperCase();
    }
  });

  document.getElementById("salonForm").addEventListener("submit", handleSave);
});

function authHeaders() {
  return { "Content-Type": "application/json", "x-super-token": TOKEN };
}

function showDashboard() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("dashboard").classList.remove("hidden");
  loadSalons();
  loadLeads();
}

function switchTab(tab) {
  document.getElementById("tabSalonsView").classList.toggle("hidden", tab !== "salons");
  document.getElementById("tabLeadsView").classList.toggle("hidden", tab !== "leads");
  document.getElementById("tabSalons").style.color = tab === "salons" ? "var(--text)" : "";
  document.getElementById("tabLeads").style.color  = tab === "leads"  ? "var(--text)" : "";
}

function logout() {
  TOKEN = "";
  localStorage.removeItem("super_token");
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
}

async function loadSalons() {
  const res = await fetch(`${API}/salons`, { headers: authHeaders() });
  if (!res.ok) { TOKEN = ""; logout(); return; }
  const salons = await res.json();
  renderSalons(salons);
}

function renderSalons(salons) {
  const el = document.getElementById("salonList");
  if (!salons.length) {
    el.innerHTML = `<p style="color:var(--muted);text-align:center;padding:3rem">No salons yet. Create your first one.</p>`;
    return;
  }
  el.innerHTML = salons.map(s => `
    <div class="salon-card ${s.active ? "" : "inactive"}" id="salon-${s.id}">
      <div class="salon-initials" style="background:${esc(s.primary_color)}">${esc(s.logo_initials)}</div>
      <div class="salon-info">
        <div class="name">${esc(s.name)}</div>
        <div class="slug">${esc(s.slug)}</div>
        <div class="meta">
          ${esc(s.city) || ""}${s.address ? " · " + esc(s.address) : ""}
          · ${s.booking_count} booking${s.booking_count !== 1 ? "s" : ""}
          ${s.domain ? " · <em>" + esc(s.domain) + "</em>" : ""}
        </div>
      </div>
      <div class="salon-actions">
        <button class="btn-ghost" onclick='editSalon(${JSON.stringify(s)})'>Edit</button>
        ${s.active
          ? `<button class="btn-danger" onclick="toggleActive(${s.id}, false)">Deactivate</button>`
          : `<button class="btn-success" onclick="toggleActive(${s.id}, true)">Activate</button>`
        }
      </div>
    </div>
  `).join("");
}

function openModal() {
  document.getElementById("editId").value = "";
  document.getElementById("modalTitle").textContent = "New Salon";
  document.getElementById("salonForm").reset();
  document.getElementById("fColor").value = "#c9a84c";
  document.getElementById("fColorHex").value = "#c9a84c";
  document.getElementById("formError").classList.add("hidden");
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
}

function editSalon(s) {
  document.getElementById("editId").value = s.id;
  document.getElementById("modalTitle").textContent = "Edit Salon";
  document.getElementById("fName").value    = s.name || "";
  document.getElementById("fSlug").value    = s.slug || "";
  document.getElementById("fCity").value    = s.city || "";
  document.getElementById("fAddress").value = s.address || "";
  document.getElementById("fPhone").value   = s.phone || "";
  document.getElementById("fDomain").value  = s.domain || "";
  document.getElementById("fColor").value   = s.primary_color || "#c9a84c";
  document.getElementById("fColorHex").value = s.primary_color || "#c9a84c";
  document.getElementById("fInitials").value = s.logo_initials || "";
  document.getElementById("fHeroImg").value  = s.hero_img_url || "";
  document.getElementById("fMapsUrl").value  = s.maps_url || "";
  document.getElementById("fAdminPw").value  = "";
  document.getElementById("formError").classList.add("hidden");
  document.getElementById("modal").classList.remove("hidden");
}

async function handleSave(e) {
  e.preventDefault();
  const id = document.getElementById("editId").value;
  const body = {
    name:         document.getElementById("fName").value.trim(),
    slug:         document.getElementById("fSlug").value.trim(),
    city:         document.getElementById("fCity").value.trim() || null,
    address:      document.getElementById("fAddress").value.trim() || null,
    phone:        document.getElementById("fPhone").value.trim() || null,
    domain:       document.getElementById("fDomain").value.trim() || null,
    primaryColor: document.getElementById("fColorHex").value.trim() || document.getElementById("fColor").value,
    logoInitials: document.getElementById("fInitials").value.trim() || null,
    heroImgUrl:   document.getElementById("fHeroImg").value.trim() || null,
    mapsUrl:      document.getElementById("fMapsUrl").value.trim() || null,
    adminPassword: document.getElementById("fAdminPw").value.trim() || null,
  };

  const url    = id ? `${API}/salons/${id}` : `${API}/salons`;
  const method = id ? "PATCH" : "POST";

  const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(body) });
  if (res.status === 409) {
    const errEl = document.getElementById("formError");
    errEl.textContent = "Slug already taken — choose another.";
    errEl.classList.remove("hidden");
    return;
  }
  if (!res.ok) { showToast("Error saving salon."); return; }

  closeModal();
  showToast(id ? "Salon updated." : "Salon created.");
  loadSalons();
}

async function toggleActive(id, active) {
  await fetch(`${API}/salons/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  showToast(active ? "Salon activated." : "Salon deactivated.");
  loadSalons();
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

// ── LEADS ──
async function loadLeads() {
  const res = await fetch(`${API}/leads`, { headers: authHeaders() });
  if (!res.ok) return;
  const leads = await res.json();
  const badge = document.getElementById("leadsCount");
  const uncontacted = leads.filter(l => !l.contacted).length;
  if (uncontacted > 0) {
    badge.textContent = uncontacted;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
  const el = document.getElementById("leadsList");
  if (!leads.length) {
    el.innerHTML = `<p style="color:var(--muted);text-align:center;padding:3rem">No leads yet. Share the landing page to get inquiries.</p>`;
    return;
  }
  el.innerHTML = leads.map(l => `
    <div class="salon-card ${l.contacted ? "inactive" : ""}">
      <div class="salon-initials" style="background:${l.contacted ? "#444" : "var(--accent)"}; color:${l.contacted ? "#888" : "#000"}">
        ${esc(l.owner_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase())}
      </div>
      <div class="salon-info">
        <div class="name">${esc(l.salon_name)}</div>
        <div class="slug">${esc(l.owner_name)}</div>
        <div class="meta">${esc(l.phone)}${l.city ? " · " + esc(l.city) : ""} · ${new Date(l.created_at).toLocaleDateString("de-DE")}</div>
      </div>
      <div class="salon-actions">
        <a class="btn-primary" href="https://wa.me/${l.phone.replace(/\D/g,'')}" target="_blank" rel="noopener">WhatsApp</a>
        ${!l.contacted
          ? `<button class="btn-ghost" onclick="markContacted(${l.id})">Kontaktiert</button>`
          : `<span style="color:var(--muted);font-size:0.8rem">✓ Kontaktiert</span>`}
      </div>
    </div>
  `).join("");
}

async function markContacted(id) {
  await fetch(`${API}/leads/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ contacted: true }),
  });
  loadLeads();
}

// Close modal on backdrop click
document.addEventListener("click", e => {
  if (e.target.id === "modal") closeModal();
});
