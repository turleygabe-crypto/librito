(() => {
  const KEY = "librito-cookie-consent";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = (functional) => {
    const consent = { essential: true, functional, date: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(consent)); } catch {}
    window.libritoConsent = consent;
    document.dispatchEvent(new CustomEvent("librito:consent", { detail: consent }));
    root.remove();
  };

  window.libritoConsent = read();
  const root = document.createElement("div");
  root.className = "cc-root";
  root.innerHTML = `
    <div class="cc-banner" role="dialog" aria-label="Cookie consent">
      <p>Librito uses cookies and similar storage to keep you signed in, remember your library and preferences, and improve your experience. By clicking "Accept All Cookies" you agree to the storage of cookies on your device in accordance with our <a href="#" data-cc="policy">Cookie Policy</a>.</p>
      <div class="cc-actions">
        <button type="button" class="cc-link" data-cc="manage">Manage Preferences</button>
        <button type="button" class="cc-btn" data-cc="accept">Accept All Cookies</button>
        <button type="button" class="cc-close" data-cc="reject" aria-label="Close and use essential cookies only">&times;</button>
      </div>
    </div>
    <div class="cc-modal" hidden>
      <div class="cc-card" role="dialog" aria-modal="true" aria-label="Cookie preferences">
        <h2>Cookie Preferences &amp; Policy</h2>
        <p>Cookies and local storage help Librito work. You can choose which categories to allow.</p>
        <label class="cc-row"><span><strong>Essential</strong><small>Sign-in session and security. Always on; required for the site to work.</small></span><input type="checkbox" checked disabled /></label>
        <label class="cc-row"><span><strong>Functional</strong><small>Remembers your theme, shelves, reading progress and cover cache on this device.</small></span><input type="checkbox" id="cc-functional" checked /></label>
        <p class="cc-small">We do not sell your personal information. You can change your choice any time by clearing site data in your browser. Declining functional storage may mean preferences are not kept between visits.</p>
        <div class="cc-actions">
          <button type="button" class="cc-link" data-cc="reject">Reject Non-Essential</button>
          <button type="button" class="cc-btn" data-cc="save">Save Preferences</button>
        </div>
      </div>
    </div>`;

  const modal = root.querySelector(".cc-modal");
  root.addEventListener("click", (e) => {
    const action = e.target.closest("[data-cc]")?.dataset.cc;
    if (!action) return;
    e.preventDefault();
    if (action === "accept") save(true);
    else if (action === "reject") save(false);
    else if (action === "save") save(root.querySelector("#cc-functional").checked);
    else modal.hidden = false;
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

  if (!window.libritoConsent) document.body.appendChild(root);
})();
