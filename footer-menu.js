// ════════════════════════════════════════════════════════════
//  Shared Torn footer-menu registry
//  ----------------------------------------------------------
//  Paste this IIFE near the top of your userscript's main IIFE,
//  then call:
//
//      const W = (typeof unsafeWindow !== "undefined") ? unsafeWindow : window;
//      W.registerEugeneScript({ id, name, color, iconSVG, onClick, ... });
//      W.mountEugeneFooterMenu();
//
//  See README.md for the full contract, reserved IDs, and gotchas.
//  ----------------------------------------------------------
//  License: MIT (do whatever, attribution appreciated)
// ════════════════════════════════════════════════════════════

(function setupEugFooterMenu() {
    // Use the page's real window so scripts in different @grant sandboxes
    // share the same registry. @grant none scripts and @grant GM_* scripts
    // otherwise see isolated `window` objects and can't find each other.
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
        // Torn's SPA swaps the footer DOM on navigation, taking buttons with
        // it. Keep observing indefinitely and re-render whenever the ref
        // button is back but our buttons are gone. Throttled via rAF.
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
