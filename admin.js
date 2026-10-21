import { createSupabaseClient } from "/lib/supabase-client.js";

const root = document.getElementById("root");
const supabase = createSupabaseClient();

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notFound = () => { root.innerHTML = "<h1>Not found</h1>"; };

function loginForm(message = "") {
  root.innerHTML = `<h1>Sign in</h1><form id="f"><input id="e" type="email" placeholder="Email" required autocomplete="username"><br>
    <input id="p" type="password" placeholder="Password" required autocomplete="current-password"><br><button>Sign in</button></form><p>${esc(message)}</p>`;
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

const kpi = (label, value) => `<div class="kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
const bars = (series) => {
  const max = Math.max(1, ...series.map((s) => s.count));
  return `<div class="bars">${series.map((s) => `<i title="${esc(s.day)}: ${esc(s.count)}" style="height:${(s.count / max) * 100}%"></i>`).join("")}</div>`;
};
const rows = (pairs) => `<table>${pairs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>`;

async function render(days) {
  const { data, error } = await supabase.rpc("admin_stats", { days });
  if (error) return notFound();
  const { users, books, shelves } = data;
  root.innerHTML = `
    <header class="admin-head"><h1>Librito Admin</h1>
      <div><select id="range">${[7, 30, 90, 365].map((n) => `<option value="${n}" ${n === days ? "selected" : ""}>Last ${n} days</option>`).join("")}</select>
      <a href="/">Back to Librito</a> <button id="out">Sign out</button></div></header>
    <div class="grid">
      ${kpi("Total users", users.total)}${kpi(`New users (${days}d)`, users.new)}
      ${kpi("Active 24h", users.active_24h)}${kpi("Active 7d", users.active_7d)}${kpi("Active 30d", users.active_30d)}
      ${kpi("Total books", books.total)}${kpi(`Books added (${days}d)`, books.new)}${kpi("Avg books/user", books.avg_per_user)}
      ${kpi("Total shelves", shelves.total)}${kpi(`New shelves (${days}d)`, shelves.new)}${kpi("Likes", data.likes)}
    </div>
    <div class="panel"><h3>Signups per day</h3>${bars(data.signups_by_day)}</div>
    <div class="panel"><h3>Books added per day</h3>${bars(data.books_by_day)}</div>
    <div class="grid">
      <div class="panel"><h3>Reading status</h3>${rows(Object.entries(books.by_status))}</div>
      <div class="panel"><h3>Top genres</h3>${rows(books.top_genres.map((g) => [g.name, g.count]))}</div>
    </div>`;
  document.getElementById("range").addEventListener("change", (e) => render(Number(e.target.value)));
  document.getElementById("out").addEventListener("click", async () => { await supabase.auth.signOut(); init(); });
}

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return loginForm();
  const { data: ok } = await supabase.rpc("is_admin");
  if (ok !== true) return notFound();
  render(30);
}

init();
