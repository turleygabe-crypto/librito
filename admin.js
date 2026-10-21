import { createSupabaseClient } from "/lib/supabase-client.js";

const root = document.getElementById("root");
const supabase = createSupabaseClient();

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notFound = () => { root.innerHTML = "<div class='center'><h1>Not found</h1></div>"; };
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : "—");
const ago = (v) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(v)) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

const PAGES = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["books", "Books"],
  ["shelves", "Shelves"],
  ["engagement", "Engagement"],
];
const SUBTITLES = {
  overview: "Your little corner of the reading world.",
  users: "Everyone who has joined Librito.",
  books: "What readers are adding to their libraries.",
  shelves: "How readers organize their books.",
  engagement: "Likes, reading progress, and weekly rhythm.",
};
const COLORS = ["#8b5e3c", "#d8b898", "#b88a64", "#5e4332", "#e7cbb7", "#a67c52"];

const view = { page: "overview", days: 30, stats: null, users: null, search: "" };

function loginForm(message = "") {
  root.innerHTML = `<div class="center"><h1>Librito Admin</h1><form id="f">
    <input id="e" type="email" placeholder="Email" required autocomplete="username">
    <input id="p" type="password" placeholder="Password" required autocomplete="current-password">
    <button class="btn">Sign in</button></form><p class="err">${esc(message)}</p></div>`;
  document.getElementById("f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById("e").value,
      password: document.getElementById("p").value,
    });
    if (error) loginForm("Sign-in failed.");
    else init();
  });
}

const kpi = (title, value, sub) => `<div class="card kpi"><b>${esc(value)}</b><span class="t">${esc(title)}</span><br><span class="s">${esc(sub)}</span></div>`;

function bars(series, labelFor) {
  if (!series.length) return "<p class='s'>No data in this range.</p>";
  const max = Math.max(1, ...series.map((s) => s.count));
  return `<div class="bars">${series.map((s) => `<i title="${esc(labelFor(s))}: ${esc(s.count)}" style="height:${(s.count / max) * 100}%"></i>`).join("")}</div>
    <div class="axis"><span>${esc(labelFor(series[0]))}</span><span>${esc(labelFor(series[series.length - 1]))}</span></div>`;
}

function hbars(items) {
  if (!items.length) return "<p class='s'>Nothing yet.</p>";
  const max = Math.max(1, ...items.map((i) => i.count));
  return `<ul class="list">${items.map((i) => `<li style="display:block"><div style="display:flex;justify-content:space-between"><span>${esc(i.name)}</span><b>${esc(i.count)}</b></div><div class="hbar"><span style="width:${(i.count / max) * 100}%"></span></div></li>`).join("")}</ul>`;
}

function donut(map) {
  const entries = Object.entries(map);
  const total = entries.reduce((a, [, c]) => a + c, 0);
  if (!total) return "<p class='s'>No books yet.</p>";
  let acc = 0;
  const stops = entries.map(([, c], i) => {
    const from = (acc / total) * 100;
    acc += c;
    return `${COLORS[i % COLORS.length]} ${from}% ${(acc / total) * 100}%`;
  });
  return `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops.join(",")})"><div>${total}<br>books</div></div>
    <ul class="legend">${entries.map(([k, c], i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(k)} · ${esc(c)} (${Math.round((c / total) * 100)}%)</li>`).join("")}</ul></div>`;
}

const activityList = (items = []) => items.length
  ? `<ul class="list">${items.map((a) => `<li><span>${esc(a.label)}<span class="sub">${esc(a.who || "unknown")}</span></span><span class="sub">${esc(ago(a.at))}</span></li>`).join("")}</ul>`
  : "<p class='s'>No activity yet.</p>";

const dayLabel = (s) => fmtDate(s.day);

function overview(d) {
  const { users, books, shelves } = d;
  return `
    <div class="grid kpis">
      ${kpi("Total readers", users.total, `${users.new} new in ${d.range_days}d`)}
      ${kpi("Books tracked", books.total, `${books.new} added in ${d.range_days}d`)}
      ${kpi("Active readers", users.active_7d, `Last 7 days · ${users.active_24h} in 24h`)}
      ${kpi("Shelves", shelves.total, `${shelves.new} created in ${d.range_days}d`)}
      ${kpi("Likes received", d.likes, `${d.likes_new} in ${d.range_days}d`)}
    </div>
    <div class="grid two">
      <div class="card"><h3>Reader growth</h3>${bars(d.signups_by_day, dayLabel)}</div>
      <div class="card"><h3>Books added</h3>${bars(d.books_by_day, dayLabel)}</div>
    </div>
    <div class="grid"><div class="card"><h3>Recent activity</h3>${activityList(d.activity)}</div></div>`;
}

function usersPage() {
  const q = view.search.toLowerCase();
  const rows = (view.users || []).filter((u) => !q || (u.email || "").toLowerCase().includes(q));
  return `<div class="card"><div class="tools" style="margin-bottom:10px"><input id="search" type="search" placeholder="Search by email…" value="${esc(view.search)}"><span class="s">${rows.length} users</span></div>
    <div class="tablewrap"><table><thead><tr><th>USER</th><th>JOINED</th><th>LAST ACTIVE</th><th>BOOKS</th><th>SHELVES</th><th>LIKES</th><th>ROLE</th></tr></thead><tbody>
    ${rows.map((u) => `<tr><td>${esc(u.email || u.id)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td>${u.books}</td><td>${u.shelves}</td><td>${u.likes}</td><td>${u.is_admin ? "<span class='pill warn'>Admin</span>" : "<span class='pill'>Reader</span>"}</td></tr>`).join("")}
    </tbody></table></div></div>`;
}

function booksPage(d) {
  const b = d.books;
  return `<div class="grid kpis">${kpi("Total books", b.total, "In the catalog")}${kpi(`Added (${d.range_days}d)`, b.new, "New this period")}${kpi("Avg per reader", b.avg_per_user, "Books per reader with books")}</div>
    <div class="grid two"><div class="card"><h3>Top genres</h3>${hbars(b.top_genres)}</div><div class="card"><h3>Top authors</h3>${hbars(b.top_authors)}</div></div>
    <div class="grid"><div class="card"><h3>Recently added</h3><ul class="list">${b.recent.map((r) => `<li><span>${esc(r.title)}<span class="sub">${esc(r.author || "Unknown author")}</span></span><span class="sub">${esc(ago(r.created_at))}</span></li>`).join("") || "<li>No books yet.</li>"}</ul></div></div>`;
}

function shelvesPage(d) {
  const s = d.shelves;
  return `<div class="grid kpis">${kpi("Total shelves", s.total, "Created by readers")}${kpi(`New (${d.range_days}d)`, s.new, "New this period")}${kpi("Avg per reader", s.avg_per_user, "Shelves per reader with shelves")}</div>
    <div class="grid"><div class="card"><h3>Popular shelves</h3>${hbars(s.popular)}</div></div>`;
}

function engagementPage(d) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDow = names.map((n, i) => ({ day: n, count: (d.books_by_weekday.find((x) => x.dow === i) || { count: 0 }).count }));
  const max = Math.max(1, ...byDow.map((x) => x.count));
  return `<div class="grid kpis">${kpi("Likes", d.likes, `${d.likes_new} in ${d.range_days}d`)}${kpi("Active 24h", d.users.active_24h, "Signed in")}${kpi("Active 7d", d.users.active_7d, "Signed in")}${kpi("Active 30d", d.users.active_30d, "Signed in")}</div>
    <div class="grid two"><div class="card"><h3>Reading status</h3>${donut(d.books.by_status)}</div>
    <div class="card"><h3>Books added by weekday</h3><div class="bars">${byDow.map((x) => `<i title="${x.day}: ${x.count}" style="height:${(x.count / max) * 100}%"></i>`).join("")}</div><div class="axis">${names.map((n) => `<span>${n}</span>`).join("")}</div></div></div>`;
}

function csv(rows) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(",")).join("\n");
}

function exportCsv() {
  let rows;
  let name = `librito-${view.page}.csv`;
  if (view.page === "users") {
    rows = [["email", "joined", "last_active", "books", "shelves", "likes", "admin"],
      ...(view.users || []).map((u) => [u.email, u.created_at, u.last_sign_in_at, u.books, u.shelves, u.likes, u.is_admin])];
  } else {
    const d = view.stats;
    rows = [["day", "signups", "books_added"]];
    const days = new Map();
    d.signups_by_day.forEach((s) => days.set(s.day, { s: s.count, b: 0 }));
    d.books_by_day.forEach((s) => days.set(s.day, { s: (days.get(s.day) || { s: 0 }).s, b: s.count }));
    [...days.keys()].sort().forEach((k) => rows.push([k, days.get(k).s, days.get(k).b]));
    name = `librito-daily-${view.days}d.csv`;
  }
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function shell(content) {
  const title = PAGES.find(([k]) => k === view.page)[1];
  root.innerHTML = `<div class="shell">
    <aside class="side"><div class="brand"><div class="mark">L</div><div><b>Librito</b><small>ADMIN STUDIO</small></div></div>
      <div class="label">WORKSPACE</div>
      ${PAGES.map(([k, l]) => `<button data-page="${k}" class="${k === view.page ? "active" : ""}">${l}</button>`).join("")}
      <div class="spacer"></div><a href="/">← Back to Librito</a><button id="out">Sign out</button></aside>
    <main><div class="top"><div><h1>${title}</h1><p>${SUBTITLES[view.page]}</p></div>
      <div class="tools">${view.page === "users" ? "" : `<select id="range">${[7, 30, 90, 365].map((n) => `<option value="${n}" ${n === view.days ? "selected" : ""}>Last ${n} days</option>`).join("")}</select>`}
      <button id="export" class="btn ghost">Export CSV</button></div></div>${content}</main></div>`;

  root.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { view.page = b.dataset.page; show(); }));
  document.getElementById("out").addEventListener("click", async () => { await supabase.auth.signOut(); init(); });
  document.getElementById("export").addEventListener("click", exportCsv);
  const range = document.getElementById("range");
  if (range) range.addEventListener("change", () => { view.days = Number(range.value); view.stats = null; show(); });
  const search = document.getElementById("search");
  if (search) search.addEventListener("input", () => {
    view.search = search.value;
    const pos = search.selectionStart;
    shell(usersPage());
    const again = document.getElementById("search");
    again.focus();
    again.setSelectionRange(pos, pos);
  });
}

async function show() {
  try {
    await showPage();
  } catch (error) {
    console.error(error);
    root.innerHTML = `<div class="center"><h1>Something went wrong</h1><p class="err">${esc(error.message)}</p><p class="s">If this mentions a missing field, run the latest admin migration in Supabase.</p><a href="/">Back to Librito</a></div>`;
  }
}

async function showPage() {
  if (view.page === "users") {
    if (!view.users) {
      const { data, error } = await supabase.rpc("admin_users");
      if (error) throw new Error(`Could not load users: ${error.message}`);
      view.users = data;
    }
    return shell(usersPage());
  }
  if (!view.stats) {
    const { data, error } = await supabase.rpc("admin_stats", { days: view.days });
    if (error) throw new Error(`Could not load stats: ${error.message}`);
    view.stats = data;
  }
  const pages = { overview, books: booksPage, shelves: shelvesPage, engagement: engagementPage };
  shell(pages[view.page](view.stats));
}

async function init() {
  view.stats = null;
  view.users = null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return loginForm();
  const { data: ok } = await supabase.rpc("is_admin");
  if (ok !== true) return notFound();
  show();
}

init().catch((error) => {
  console.error(error);
  root.innerHTML = `<div class="center"><h1>Something went wrong</h1><p class="err">${esc(error.message)}</p></div>`;
});
