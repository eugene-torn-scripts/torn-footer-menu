# Shared Torn footer-menu integration

If you want your userscript's "open panel" button to live in Torn's footer
without fighting with my scripts (Supply Pack Analyzer, Torn Activity Tracker,
Bounty Hunter, Faction Armory Tracker, Bazaar Deal Hunter, Stock Vault), use
the shared registry below.

The registry is a tiny JS module that you paste verbatim into your script.
Every script that pastes it sees the **same** registry on `window`, so:

- 1 script installed → its icon is placed directly in the footer (legacy UX).
- 2+ scripts installed → a single neutral 3-dots button is placed in the
  footer; clicking it pops a row of the registered icons above the footer.
- Outside-click / Escape / scroll / resize closes the row.
- Re-renders itself when Torn's SPA swaps the footer DOM during navigation.

It is **idempotent** — every script calls `mount()` on init; only the first
one actually wires up DOM observers, the rest just register and re-render.

---

## 1. The contract

On panel init, your script must:

```js
const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;

W.registerEugeneScript({
    id:         "your-short-id",   // unique, stable string — see naming below
    name:       "Your Script Name",
    color:      "#3a7bd5",         // gradient top (required)
    colorDark:  "#1f4f8a",         // gradient bottom (optional, default #222)
    hoverColor: "#4a8be5",         // hover gradient top (optional, defaults to color)
    iconSVG:    `<svg ...>...</svg>`,  // 24x24 SVG, see icon notes below
    onClick:    () => openYourPanel(),
});

W.mountEugeneFooterMenu();
```

That's it. Nothing else needs to change in your script's panel code — the
registry handles placement, click-outside, Torn SPA re-renders, etc.

### Why `unsafeWindow`?

Userscripts with different `@grant` settings run in different sandboxes:

- `@grant none` → script runs in the page's main world; `window` IS the page window.
- `@grant GM_*` → script runs in Tampermonkey's sandbox; its `window` is
  isolated from the page.

If a sandboxed script uses plain `window`, it sees a **different** object than
a `@grant none` script and the two registries never meet. `unsafeWindow` gives
sandboxed scripts a handle to the page's real window so the registry is shared.
In `@grant none` scripts, `typeof unsafeWindow` is `"undefined"`, so the
fallback to `window` resolves to the same object.

If your script uses `@grant GM_*`, you must also declare `@grant unsafeWindow`
in the userscript header.

### Naming your `id`

Pick something short, lowercase, and unlikely to collide. Two scripts
registering with the same `id` will overwrite each other. Reserved IDs
(don't use these — they're mine):

```
spa     supply-pack-analyzer
tat     torn-activity-tracker
bh      bounty-hunter
bdh     bazaar-deal-hunter
fat     faction-armory-tracker
sv      stock-vault
```

Pick something specific to your script (`flight-radar`, `loot-tracker`, etc.)
rather than a generic word.

### Icon notes

- 24x24 viewBox. The registry adds Torn's footer-icon class to your `<svg>`
  automatically if you don't include one — so size/shape stays consistent
  with native footer buttons.
- Solid fills work best. The native footer icons use a top-light /
  bottom-dark gradient; matching that look is optional but feels native:

  ```html
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <defs><linearGradient id="your_icon_grad" x1="0.5" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stop-color="#ddd"/><stop offset="1" stop-color="#999"/>
      </linearGradient></defs>
      <g fill="url(#your_icon_grad)"><path d="..."/></g>
  </svg>
  ```

  Use a **unique** `<linearGradient id="...">` per script (e.g.
  `your_icon_grad`) — multiple scripts using the same gradient id will
  collide in the SVG defs namespace.

- The button background is built from your `color` / `colorDark` /
  `hoverColor`. The icon foreground is whatever your SVG paints. Keep them
  visually distinct from existing scripts (don't pick another orange — SPA
  is `#c49000`).

---

## 2. The module — paste verbatim

Drop this IIFE near the top of your main IIFE, **above** any code that calls
`registerEugeneScript`. The `__eugFooterMenuLoaded` flag means it's safe for
every script to include this — only one wins the setup race per page load.

```js
(function setupEugFooterMenu() {
    const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
    if (W.__eugFooterMenuLoaded) return;
    W.__eugFooterMenuLoaded = true;
    W.__eugeneScripts = W.__eugeneScripts || [];

    const ROW_ID = "eug-footer-row";

    function injectCSS() {
        if (document.getElementById("eug-footer-style")) return;
        const style = document.createElement("style");
        style.id = "eug-footer-style";
        style.textContent = `
[data-eug="menu"]{background:linear-gradient(to bottom,#444,#2a2a2a)!important}
[data-eug="menu"]:hover{background:linear-gradient(to bottom,#555,#333)!important}
#${ROW_ID}{display:none;position:fixed;padding:4px;
  background:rgba(20,20,20,0.96);border:1px solid #444;border-radius:6px;
  gap:4px;z-index:2147483647;white-space:nowrap;pointer-events:auto}
#${ROW_ID}.eug-open{display:flex;flex-direction:row}
`;
        document.head.appendChild(style);
    }

    function injectEntryCSS(entry) {
        if (!entry.color) return;
        const id = `eug-color-${entry.id}`;
        const existing = document.getElementById(id);
        const dark = entry.colorDark || "#222";
        const hover = entry.hoverColor || entry.color;
        const css = `
[data-eug-id="${entry.id}"]{background:linear-gradient(to bottom, ${entry.color}, ${dark})!important}
[data-eug-id="${entry.id}"]:hover{background:linear-gradient(to bottom, ${hover}, ${entry.color})!important}
`;
        if (existing) { existing.textContent = css; return; }
        const el = document.createElement("style");
        el.id = id;
        el.textContent = css;
        document.head.appendChild(el);
    }

    function findRefBtn() {
        return document.getElementById("notes_panel_button")
            || document.getElementById("people_panel_button");
    }

    function getRow() { return document.getElementById(ROW_ID); }
    function closeRow() { const r = getRow(); if (r) r.classList.remove("eug-open"); }

    function openRow(menuBtn) {
        const row = getRow();
        if (!row) return;
        const rect = menuBtn.getBoundingClientRect();
        row.classList.add("eug-open");
        const rowRect = row.getBoundingClientRect();
        const gap = 6;
        const centerX = rect.left + rect.width / 2;
        let left = centerX - rowRect.width / 2;
        const maxLeft = window.innerWidth - rowRect.width - 4;
        left = Math.max(4, Math.min(left, maxLeft));
        row.style.left = left + "px";
        row.style.bottom = (window.innerHeight - rect.top + gap) + "px";
    }

    function makeScriptBtn(entry, refBtn, role) {
        const iconClasses = refBtn.querySelector("svg")?.className?.baseVal || "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = refBtn.className;
        btn.title = entry.name;
        btn.setAttribute("data-eug", role);
        btn.setAttribute("data-eug-id", entry.id);
        const svg = (entry.iconSVG || "").replace(/<svg\b([^>]*)>/, (match, attrs) =>
            /\sclass\s*=/.test(attrs) ? match : `<svg${attrs} class="${iconClasses}">`);
        btn.innerHTML = svg;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeRow();
            try { entry.onClick(); } catch { /* noop */ }
        });
        injectEntryCSS(entry);
        return btn;
    }

    function makeMenuBtn(refBtn) {
        const iconClasses = refBtn.querySelector("svg")?.className?.baseVal || "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = refBtn.className;
        btn.title = "My userscripts";
        btn.setAttribute("data-eug", "menu");
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="${iconClasses}">
            <defs><linearGradient id="eug_menu_grad" x1="0.5" x2="0.5" y2="1" gradientUnits="objectBoundingBox">
                <stop offset="0" stop-color="#ddd"/><stop offset="1" stop-color="#999"/>
            </linearGradient></defs>
            <g fill="url(#eug_menu_grad)">
                <circle cx="5" cy="12" r="2"/>
                <circle cx="12" cy="12" r="2"/>
                <circle cx="19" cy="12" r="2"/>
            </g>
        </svg>`;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const row = getRow();
            if (row && row.classList.contains("eug-open")) closeRow();
            else openRow(btn);
        });
        return btn;
    }

    function render() {
        const refBtn = findRefBtn();
        if (!refBtn) return false;
        injectCSS();

        const parent = refBtn.parentNode;
        parent.querySelectorAll('[data-eug]').forEach((el) => el.remove());
        const oldRow = getRow();
        if (oldRow) oldRow.remove();

        const scripts = W.__eugeneScripts || [];
        if (scripts.length === 0) return true;

        if (scripts.length === 1) {
            parent.insertBefore(makeScriptBtn(scripts[0], refBtn, "solo"), refBtn);
        } else {
            const menuBtn = makeMenuBtn(refBtn);
            parent.insertBefore(menuBtn, refBtn);
            const row = document.createElement("div");
            row.id = ROW_ID;
            row.setAttribute("data-eug-row", "");
            for (const s of scripts) row.appendChild(makeScriptBtn(s, refBtn, "item"));
            document.body.appendChild(row);
        }
        return true;
    }

    function mount() {
        render();
        let pending = false;
        const obs = new MutationObserver(() => {
            if (pending) return;
            pending = true;
            requestAnimationFrame(() => {
                pending = false;
                const refBtn = findRefBtn();
                if (refBtn && !refBtn.parentNode.querySelector('[data-eug]')) render();
            });
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    W.addEventListener("eugene-scripts-updated", render);
    document.addEventListener("click", (e) => {
        const row = getRow();
        if (!row || !row.classList.contains("eug-open")) return;
        const menuBtn = document.querySelector('[data-eug="menu"]');
        if (menuBtn && menuBtn.contains(e.target)) return;
        if (row.contains(e.target)) return;
        closeRow();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRow(); });
    W.addEventListener("scroll", closeRow, { passive: true });
    W.addEventListener("resize", closeRow);

    W.registerEugeneScript = function (entry) {
        const list = W.__eugeneScripts;
        const i = list.findIndex((s) => s.id === entry.id);
        if (i >= 0) list[i] = entry;
        else list.push(entry);
        W.dispatchEvent(new CustomEvent("eugene-scripts-updated"));
    };
    W.mountEugeneFooterMenu = mount;
})();
```

---

## 3. Things that will conflict if you do them differently

- **Don't pick a duplicate `id`.** Your registration will overwrite the
  collider's entry on the live page (whichever script ran last wins).
- **Don't create your own footer button outside the registry.** It will
  appear next to the shared menu and the user gets two buttons. If you
  previously shipped a standalone button, drop it on the same release that
  adds the registry call so old/new co-existence isn't a problem.
- **Don't use plain `window`** in a `@grant GM_*` script — see the
  unsafeWindow section. You'll get an isolated registry that can't see mine
  and vice versa.
- **Don't reuse my SVG `<linearGradient id="...">` values** (`spa_icon_grad`,
  `tat_icon_grad`, `bh_icon_grad`, `bdh_icon_grad`, `fat_icon_grad`,
  `sv_icon_grad`, `eug_menu_grad`). Pick something namespaced to your
  script so the SVG defs don't collide.
- **Don't call `mountEugeneFooterMenu()` before registering your script** —
  it's safe to call it after, since the render function reads from the
  registry on every event.

---

## 4. Quick test

1. Install your script alone → footer should show your icon directly
   (single-script mode).
2. Install one of mine alongside it → footer should show a single 3-dots
   button; clicking it should pop a row containing both icons.
3. Click your icon in the popped row → your panel opens, row closes.
4. Navigate Torn's SPA (e.g. items → city) → footer button should re-appear
   on the new page automatically.

If any of those fail, the most likely cause is the `unsafeWindow` issue or a
duplicate `id`. Hit me up if it still misbehaves.
