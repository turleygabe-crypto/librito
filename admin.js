import { createSupabaseClient } from "/lib/supabase-client.js";
import { escapeCsvCell } from "/lib/csv.js";

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
  ["marketplace", "Marketplace reports"],
  ["books", "Books"],
  ["shelves", "Shelves"],
  ["engagement", "Engagement"],
];
const SUBTITLES = {
  overview: "Your little corner of the reading world.",
  users: "Everyone who has joined Librito.",
  marketplace: "Review reports about listings, sellers, and messages.",
  books: "What readers are adding to their libraries.",
  shelves: "How readers organize their books.",
  engagement: "Likes, reading progress, and weekly rhythm.",
};
const COLORS = ["#8b5e3c", "#d8b898", "#b88a64", "#5e4332", "#e7cbb7", "#a67c52"];

const view = { page: "overview", days: 30, stats: null, users: null, reports: null, search: "", userId: null };

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
    if (error) loginForm(`Sign-in failed: ${error.message}`);
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
    <div class="tablewrap"><table><thead><tr><th>USER</th><th>JOINED</th><th>LAST ACTIVE</th><th>BOOKS</th><th>SHELVES</th><th>LIKES</th><th>ROLE</th><th>PLAN</th><th>COMPLIMENTARY ACCESS</th><th>TEST ACCOUNT</th></tr></thead><tbody>
    ${rows.map((u) => {
      const currentPlan = { lite_reader: "Free", free: "Free", book_lover: "Book Lover", bookshop_pro: "Bookshop Pro" }[u.tier] || "Free";
      const complimentary = u.complimentary_bookshop_pro ? "bookshop_pro"
        : u.complimentary_book_lover ? "book_lover" : "free";
      return `<tr><td>${esc(u.email || u.id)}</td><td>${fmtDate(u.created_at)}</td><td>${fmtDate(u.last_sign_in_at)}</td><td>${u.books}</td><td>${u.shelves}</td><td>${u.likes}</td><td><select class="role-select" data-user="${esc(u.id)}" aria-label="Role for ${esc(u.email || u.id)}" ${u.id === view.userId ? 'disabled title="Ask another admin to change your role"' : ""}><option value="reader" ${!u.is_admin ? "selected" : ""}>Reader</option><option value="admin" ${u.is_admin ? "selected" : ""}>Admin</option></select></td><td>${esc(currentPlan)}</td><td><select class="tier-select" data-user="${esc(u.id)}" aria-label="Complimentary access for ${esc(u.email || u.id)}"><option value="free" ${complimentary === "free" ? "selected" : ""}>None</option><option value="book_lover" ${complimentary === "book_lover" ? "selected" : ""}>Book Lover</option><option value="bookshop_pro" ${complimentary === "bookshop_pro" ? "selected" : ""}>Bookshop Pro</option></select></td><td>${u.is_test_account ? `<button class="btn ghost test-login" data-user="${esc(u.id)}">Sign in</button>` : ""}</td></tr>`;
    }).join("")}
    </tbody></table></div></div>`;
}

function accountDialog(content) {
  const dialog = document.createElement("dialog");
  dialog.className = "account-dialog";
  dialog.setAttribute("aria-labelledby", "account-dialog-title");
  dialog.innerHTML = `${content}<p class="err" role="alert"></p><button type="button" class="btn ghost dialog-close">Close</button>`;
  const busy = () => Boolean(dialog.querySelector('[type="submit"]')?.disabled);
  dialog.querySelector(".dialog-close").addEventListener("click", () => { if (!busy()) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy()) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

function testAccountLogin(user) {
  const dialog = accountDialog(`<h2 id="account-dialog-title">Sign in to test account</h2>
    <p class="s">This replaces your admin session in this browser and opens Librito as this account. To return, sign out and sign in with your admin credentials.</p>
    <form><label>Email<input name="email" type="email" value="${esc(user.email)}" readonly autocomplete="username"></label>
    <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
    <button type="submit" class="btn">Sign in and open Librito</button></form>`);
  const form = dialog.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    dialog.querySelector(".err").textContent = "";
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email, password: form.elements.password.value,
      });
      if (error) throw error;
      if (data?.session?.user?.id !== user.id) throw new Error("Test account sign-in could not be confirmed.");
      form.reset();
      window.location.assign("/");
    } catch (error) {
      console.error(error);
      dialog.querySelector(".err").textContent = `Could not sign in: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });
}

function createTestAccount() {
  const dialog = accountDialog(`<h2 id="account-dialog-title">Create test account</h2>
    <p class="s">A real Reader account with a unique support+test-…@librito.casa alias. No new mailbox or email confirmation is needed. Save the email and password for later sign-ins. Password-reset delivery depends on your mailbox supporting plus-addressing.</p>
    <form><label>Account name<input name="name" required maxlength="24" pattern="[a-z0-9]([a-z0-9-]{0,22}[a-z0-9])?" placeholder="reader-one" autocomplete="off"></label>
    <label>Plan<select name="plan"><option value="free">Free</option><option value="book_lover">Book Lover</option><option value="bookshop_pro">Bookshop Pro</option></select></label>
    <label>Password<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label>
    <p class="s">Use 12-128 characters and follow your Supabase project's password policy.</p>
    <p class="s">Paid-plan features are granted as complimentary access, without creating a subscription or charging a card. Test accounts remain Readers; marketplace preview still requires an Admin role.</p>
    <button type="submit" class="btn">Create account</button></form>
    <div class="test-account-result" hidden></div>`);
  const form = dialog.querySelector("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    dialog.querySelector(".err").textContent = "";
    const account = { name: form.elements.name.value, password: form.elements.password.value, plan: form.elements.plan.value };
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!session) throw new Error("Sign in again to create test accounts.");
      const response = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(account),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Test account creation failed.");
      if (!result.user?.id || !result.user.email || result.user.is_test_account !== true || result.user.tier !== account.plan) {
        throw new Error("Account creation could not be confirmed. Refresh Users before retrying.");
      }
      form.reset();
      form.hidden = true;
      const output = dialog.querySelector(".test-account-result");
      output.hidden = false;
      output.innerHTML = `<p role="status">${esc({ free: "Free", book_lover: "Book Lover", bookshop_pro: "Bookshop Pro" }[result.user.tier])} test account created. Save this email and the password you chose:</p>
        <label>Email<input value="${esc(result.user.email)}" readonly></label>
        <p class="s">You can change its role and complimentary access in Users.</p>
        <button type="button" class="btn">Sign in to this account</button>`;
      output.querySelector("button").addEventListener("click", () => {
        dialog.close();
        testAccountLogin(result.user);
      });
      view.users = null;
      view.stats = null;
      await show();
    } catch (error) {
      console.error(error);
      dialog.querySelector(".err").textContent = `Could not create test account: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });
}

function marketplaceReportsPage() {
  const rows = view.reports || [];
  return `<div class="card"><div class="tablewrap"><table><thead><tr><th>REPORTED</th><th>TYPE</th><th>REASON</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
    ${rows.map((report) => `<tr><td>${fmtDate(report.created_at)}</td><td>${report.listing_id ? "Listing" : report.seller_id ? "Seller" : "Message"}</td><td>${esc(report.reason)}</td><td>${esc(report.status)}</td><td>${report.status === "open" || report.status === "reviewing" ? `<button class="btn marketplace-report-action" data-id="${esc(report.id)}" data-decision="actioned">Action report</button> <button class="btn ghost marketplace-report-action" data-id="${esc(report.id)}" data-decision="dismissed">Dismiss</button>` : "Reviewed"}</td></tr>`).join("") || "<tr><td colspan='5'>No marketplace reports.</td></tr>"}
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
  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\n");
}

function exportCsv() {
  let rows;
  let name = `librito-${view.page}.csv`;
  if (view.page === "users") {
    rows = [["email", "joined", "last_active", "books", "shelves", "likes", "admin", "test_account"],
      ...(view.users || []).map((u) => [u.email, u.created_at, u.last_sign_in_at, u.books, u.shelves, u.likes, u.is_admin, u.is_test_account])];
  } else if (view.page === "marketplace") {
    rows = [["created_at", "status", "reason", "listing_id", "seller_id", "message_id"],
      ...(view.reports || []).map((r) => [r.created_at, r.status, r.reason, r.listing_id, r.seller_id, r.message_id])];
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
      <div class="tools">${["users", "marketplace"].includes(view.page) ? "" : `<select id="range">${[7, 30, 90, 365].map((n) => `<option value="${n}" ${n === view.days ? "selected" : ""}>Last ${n} days</option>`).join("")}</select>`}
      ${view.page === "users" ? '<button id="create-test-account" class="btn">Create test account</button>' : ""}
      <button id="export" class="btn ghost">Export CSV</button></div></div>${content}</main></div>`;

  root.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => { view.page = b.dataset.page; show(); }));
  document.getElementById("out").addEventListener("click", async () => { await supabase.auth.signOut(); init(); });
  document.getElementById("export").addEventListener("click", exportCsv);
  document.getElementById("create-test-account")?.addEventListener("click", createTestAccount);
  root.querySelectorAll(".test-login").forEach((button) => button.addEventListener("click", () => {
    const user = (view.users || []).find((u) => u.id === button.dataset.user);
    if (user?.is_test_account) testAccountLogin(user);
  }));
  root.querySelectorAll(".role-select").forEach((select) => select.addEventListener("change", async () => {
    const user = (view.users || []).find((u) => u.id === select.dataset.user);
    const previous = user?.is_admin ? "admin" : "reader";
    const newRole = select.value;
    if (!confirm(`Change ${user?.email || select.dataset.user} to ${newRole === "admin" ? "Admin (full dashboard access)" : "Reader"}?`)) {
      select.value = previous;
      return;
    }
    select.disabled = true;
    try {
      const { data, error } = await supabase.rpc("admin_set_role", { target_user: select.dataset.user, new_role: newRole });
      if (error) throw error;
      if (data !== newRole) throw new Error("Role change could not be confirmed. Refresh Users.");
      if (user) user.is_admin = data === "admin";
    } catch (error) {
      select.value = previous;
      console.error(error);
      alert(`Could not change role: ${error.message}`);
    } finally {
      select.disabled = false;
    }
  }));
  const range = document.getElementById("range");
  if (range) range.addEventListener("change", () => { view.days = Number(range.value); view.stats = null; show(); });
  root.querySelectorAll(".tier-select").forEach((select) => select.addEventListener("change", async () => {
    const user = (view.users || []).find((u) => u.id === select.dataset.user);
    const previous = user?.complimentary_bookshop_pro ? "bookshop_pro"
      : user?.complimentary_book_lover ? "book_lover" : "free";
    select.disabled = true;
    const { data, error } = await supabase.rpc("admin_set_tier", { target_user: select.dataset.user, new_tier: select.value });
    select.disabled = false;
    if (error) {
      select.value = previous;
      alert(`Could not change plan: ${error.message}`);
      return;
    }
    if (user) {
      user.tier = data;
      user.complimentary_book_lover = select.value === "book_lover";
      user.complimentary_bookshop_pro = select.value === "bookshop_pro";
    }
    show();
  }));
  root.querySelectorAll(".marketplace-report-action").forEach((action) => action.addEventListener("click", async () => {
    action.disabled = true;
    const { error } = await supabase.rpc("marketplace_admin_review_report", {
      target_report: action.dataset.id,
      decision: action.dataset.decision,
    });
    if (error) {
      action.disabled = false;
      alert(`Could not review this report: ${error.message}`);
      return;
    }
    view.reports = null;
    show();
  }));
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
  if (view.page === "marketplace") {
    const { data, error } = await supabase.from("marketplace_reports").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(`Could not load marketplace reports: ${error.message}`);
    view.reports = data || [];
    return shell(marketplaceReportsPage());
  }
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
  view.userId = null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return loginForm();
  view.userId = session.user.id;
  const { data: ok, error } = await supabase.rpc("is_admin");
  if (error) throw new Error(`Could not verify admin access: ${error.message}`);
  if (ok !== true) return notFound();
  show();
}

init().catch((error) => {
  console.error(error);
  root.innerHTML = `<div class="center"><h1>Something went wrong</h1><p class="err">${esc(error.message)}</p></div>`;
});
