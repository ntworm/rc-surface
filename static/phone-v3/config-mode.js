// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/ableton-rc-surface
//
// RC Surface per-control configuration mode (CFG).
//
// Exposes `window.RcConfigMode` with the orchestration layer that sits between
// the header toggle, the capture-phase pointerdown interception on
// .page[data-page="performance"] / .page[data-page="mixer"], and the desktop
// contextmenu handler. The actual menu render is delegated to per-control-type
// builders registered via `register(matcher, builder)`.
//
// State machine:
//   off --toggle()--> on         (button on, body.config-mode)
//   on  --toggle()/off()--> off  (button off, body.config-mode removed)
//   off --open(name)--> on + openFor=name   (rare; programmatic only)
//   on  --open(name)--> openFor=name         (already open menu closes first)
//   on  --close()--> off (only when openFor is set, else stays on)
//
// CFG is exclusive with MAP (window.mobileMappingState.open): turning one on
// turns the other off. STAGE mode also turns CFG off (operators do not need a
// context menu in full-screen performance).
(function (root) {
  "use strict";

  const BUTTON_ID = "btn-cfg-mode";
  const MENU_ID = "control-config-menu";
  const CFG_PAGES_SELECTOR = ".page[data-page=\"performance\"], .page[data-page=\"mixer\"]";
  const DATA_NAME_SELECTOR = "[data-name]";

  function createRcConfigMode(options) {
    const opts = options || {};
    const documentRef = opts.document || (typeof document !== "undefined" ? document : null);
    const windowRef = opts.window || (typeof window !== "undefined" ? window : null);
    const controlConfig = opts.controlConfig || (windowRef && windowRef.RcControlConfig);

    const state = {
      on: false,
      openFor: null,
      builders: new Map(),
      pointerDownAnchor: null,
      contextMenuOpen: false,
    };

    function button() {
      return documentRef && documentRef.getElementById(BUTTON_ID);
    }

    function menu() {
      return documentRef && documentRef.getElementById(MENU_ID);
    }

    function isCfgPageTarget(target) {
      if (!target || !target.closest) return false;
      const named = target.closest(DATA_NAME_SELECTOR);
      if (!named) return false;
      const page = named.closest(CFG_PAGES_SELECTOR);
      return Boolean(page);
    }

    function controlName(target) {
      if (!target || !target.closest) return null;
      const named = target.closest(DATA_NAME_SELECTOR);
      return named ? named.getAttribute("data-name") : null;
    }

    function rectFor(target) {
      if (!target || !target.getBoundingClientRect) return null;
      const r = target.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    }

    function setButtonPressed(pressed) {
      const btn = button();
      if (!btn) return;
      btn.classList.toggle("on", pressed);
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    }

    function renderMenuFor(name, anchorRect) {
      const el = menu();
      if (!el) return;
      el.innerHTML = "";
      const header = documentRef.createElement("div");
      header.className = "cfg-menu-header";
      const title = documentRef.createElement("span");
      title.className = "cfg-menu-title";
      title.setAttribute("data-cfg-menu-title", "");
      title.textContent = name || "";
      header.appendChild(title);
      const closeBtn = documentRef.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "cfg-menu-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", () => close());
      header.appendChild(closeBtn);
      el.appendChild(header);

      const body = documentRef.createElement("div");
      body.className = "cfg-menu-body";
      el.appendChild(body);

      const builder = findBuilder(name);
      let items = [];
      if (builder) {
        try {
          items = builder(name) || [];
        } catch (_) {
          items = [];
        }
      }
      if (!Array.isArray(items)) items = [];
      renderItems(body, items);
      positionMenu(el, anchorRect);
      el.classList.remove("hidden");
      el.setAttribute("data-cfg-open-for", name || "");
    }

    function findBuilder(name) {
      if (!name) return null;
      for (const [matcher, builder] of state.builders) {
        if (typeof matcher === "string" && matcher === name) return builder;
        if (matcher instanceof RegExp && matcher.test(name)) return builder;
      }
      return null;
    }

    function renderItems(container, items) {
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        if (item.segment) renderSegment(container, item.segment);
        else if (item.grid) renderGrid(container, item.grid);
        else if (item.slider) renderSlider(container, item.slider);
        else if (item.action) renderAction(container, item.action);
        else if (item.info) renderInfo(container, item.info);
      }
    }

    function renderSegment(container, item) {
      const wrap = documentRef.createElement("div");
      wrap.className = "cfg-segment";
      if (item.label) {
        const lbl = documentRef.createElement("div");
        lbl.className = "cfg-item-label";
        lbl.textContent = item.label;
        wrap.appendChild(lbl);
      }
      const group = documentRef.createElement("div");
      group.className = "cfg-segment-group";
      const options = Array.isArray(item.options) ? item.options : [];
      const current = item.get ? item.get() : null;
      for (const opt of options) {
        const btn = documentRef.createElement("button");
        btn.type = "button";
        btn.className = "cfg-segment-btn";
        btn.textContent = opt.label || String(opt.value);
        btn.setAttribute("data-value", String(opt.value));
        if (current !== null && current === opt.value) btn.classList.add("on");
        btn.addEventListener("click", () => {
          if (typeof item.set === "function") {
            item.set(opt.value);
            close();
          }
        });
        group.appendChild(btn);
      }
      wrap.appendChild(group);
      container.appendChild(wrap);
    }

    function renderGrid(container, item) {
      const wrap = documentRef.createElement("div");
      wrap.className = "cfg-grid";
      if (item.label) {
        const lbl = documentRef.createElement("div");
        lbl.className = "cfg-item-label";
        lbl.textContent = item.label;
        wrap.appendChild(lbl);
      }
      const group = documentRef.createElement("div");
      group.className = "cfg-grid-group";
      const options = Array.isArray(item.options) ? item.options : [];
      const current = item.get ? item.get() : null;
      for (const opt of options) {
        const btn = documentRef.createElement("button");
        btn.type = "button";
        btn.className = "cfg-grid-btn";
        btn.textContent = opt.label || String(opt.value);
        btn.setAttribute("data-value", String(opt.value));
        if (current !== null && current === opt.value) btn.classList.add("on");
        btn.addEventListener("click", () => {
          if (typeof item.set === "function") {
            item.set(opt.value);
            close();
          }
        });
        group.appendChild(btn);
      }
      wrap.appendChild(group);
      container.appendChild(wrap);
    }

    function renderSlider(container, item) {
      const wrap = documentRef.createElement("div");
      wrap.className = "cfg-slider";
      const lbl = documentRef.createElement("div");
      lbl.className = "cfg-item-label";
      lbl.textContent = item.label || "";
      wrap.appendChild(lbl);
      const row = documentRef.createElement("div");
      row.className = "cfg-slider-row";
      const input = documentRef.createElement("input");
      input.type = "range";
      input.className = "morph-slider";
      if (typeof item.min === "number") input.min = String(item.min);
      if (typeof item.max === "number") input.max = String(item.max);
      if (typeof item.step === "number") input.step = String(item.step);
      function paintProgress(el) {
        const mn = Number(el.min) || 0;
        const mx = Number(el.max) || 1;
        const vl = Number(el.value) || 0;
        const pct = (mx - mn) === 0 ? 0 : ((vl - mn) / (mx - mn)) * 100;
        if (typeof el.style.setProperty === 'function') {
          el.style.setProperty('--range-progress', `${Number.isFinite(pct) ? pct : 0}%`);
        }
      }
      const current = item.get ? item.get() : undefined;
      if (current !== undefined && current !== null) input.value = String(current);
      paintProgress(input);
      const valueLabel = documentRef.createElement("span");
      valueLabel.className = "cfg-slider-value";
      const format = item.format || ((v) => String(v));
      valueLabel.textContent = current !== undefined && current !== null ? format(current) : "";
      input.addEventListener("input", () => {
        paintProgress(input);
        const v = Number(input.value);
        if (Number.isFinite(v) && typeof item.set === "function") item.set(v);
        valueLabel.textContent = format(v);
      });
      row.appendChild(input);
      row.appendChild(valueLabel);
      wrap.appendChild(row);
      container.appendChild(wrap);
    }

    function renderAction(container, item) {
      const btn = documentRef.createElement("button");
      btn.type = "button";
      btn.className = "cfg-action";
      btn.textContent = item.label || "";
      if (item.danger) btn.classList.add("danger");
      btn.addEventListener("click", () => {
        if (typeof item.run === "function") {
          try { item.run(); } catch (_) { /* swallow */ }
        }
        if (item.closes !== false) close();
      });
      container.appendChild(btn);
    }

    function renderInfo(container, item) {
      const div = documentRef.createElement("div");
      div.className = "cfg-info";
      div.textContent = item.text || "";
      container.appendChild(div);
    }

    function positionMenu(el, anchorRect) {
      if (!anchorRect || typeof anchorRect !== "object") {
        el.style.left = "50%";
        el.style.top = "50%";
        el.style.transform = "translate(-50%, -50%)";
        return;
      }
      const vw = documentRef.documentElement && documentRef.documentElement.clientWidth
        || (windowRef && windowRef.innerWidth) || 1024;
      const vh = documentRef.documentElement && documentRef.documentElement.clientHeight
        || (windowRef && windowRef.innerHeight) || 768;
      const margin = 8;
      const w = Math.min(320, vw - margin * 2);
      const h = Math.min(el.offsetHeight || 320, vh - margin * 2);
      el.style.width = w + "px";
      let left = anchorRect.left;
      let top = anchorRect.bottom + 6;
      if (left + w + margin > vw) left = Math.max(margin, vw - w - margin);
      if (top + h + margin > vh) {
        const above = anchorRect.top - h - 6;
        if (above > margin) top = above;
        else top = Math.max(margin, vh - h - margin);
      }
      el.style.left = Math.max(margin, left) + "px";
      el.style.top = Math.max(margin, top) + "px";
      el.style.transform = "none";
    }

    function clearMenu() {
      const el = menu();
      if (!el) return;
      el.classList.add("hidden");
      el.removeAttribute("data-cfg-open-for");
      el.innerHTML = "";
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.transform = "";
    }

    function open(name, anchorRect) {
      if (!state.on) on();
      state.openFor = name;
      renderMenuFor(name, anchorRect || rectFor(closestDataName(name)));
    }

    function close() {
      const transient = state.contextMenuOpen === true;
      state.contextMenuOpen = false;
      state.openFor = null;
      clearMenu();
      // A right-click popover is transient: closing it must not leave the
      // pointer frozen in CFG mode. A toggle-opened popover keeps CFG on.
      if (transient) off();
    }

    function closestDataName(name) {
      if (!name || !documentRef) return null;
      return documentRef.querySelector(`[data-name="${cssEscape(name)}"]`);
    }

    function cssEscape(s) {
      if (windowRef && windowRef.CSS && typeof windowRef.CSS.escape === "function") {
        return windowRef.CSS.escape(s);
      }
      return String(s).replace(/(["\\])/g, "\\$1");
    }

    function on() {
      if (state.on) return;
      // MAP is exclusive: if MAP is open, close it first.
      const mapState = windowRef && windowRef.mobileMappingState;
      if (mapState && mapState.open && typeof windowRef.closeMobileMappingMode === "function") {
        windowRef.closeMobileMappingMode();
      }
      state.on = true;
      if (documentRef && documentRef.body) documentRef.body.classList.add("config-mode");
      setButtonPressed(true);
    }

    function off() {
      if (!state.on && !state.openFor) return;
      state.on = false;
      state.openFor = null;
      if (documentRef && documentRef.body) documentRef.body.classList.remove("config-mode");
      setButtonPressed(false);
      clearMenu();
    }

    function toggle() {
      if (state.on) off();
      else on();
    }

    function register(matcher, builder) {
      state.builders.set(matcher, builder);
    }

    function unregister(matcher) {
      state.builders.delete(matcher);
    }

    function onPointerDownCapture(ev) {
      if (!state.on) return;
      if (!isCfgPageTarget(ev.target)) return;
      // Already inside the menu: let it through so close button works.
      if (ev.target.closest && ev.target.closest(`#${MENU_ID}`)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      state.pointerDownAnchor = rectFor(ev.target);
    }

    function onPointerUpCapture(ev) {
      if (!state.on) return;
      if (!state.pointerDownAnchor) return;
      const startName = controlName(documentRef.querySelector && documentRef.querySelector(`[data-name="${cssEscape(controlNameFromTarget(ev.target) || "")}"]`));
      const name = startName || controlName(ev.target);
      const anchor = state.pointerDownAnchor;
      state.pointerDownAnchor = null;
      if (!name) return;
      // Allow listeners on the same element (e.g. dblclick) to NOT fire.
      if (typeof ev.stopPropagation === "function") ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      ev.preventDefault();
      open(name, anchor);
    }

    function controlNameFromTarget(target) {
      const named = target && target.closest && target.closest(DATA_NAME_SELECTOR);
      return named ? named.getAttribute("data-name") : null;
    }

    function onContextMenu(ev) {
      const named = ev.target && ev.target.closest && ev.target.closest(DATA_NAME_SELECTOR);
      if (!named) return;
      const page = named.closest(CFG_PAGES_SELECTOR);
      if (!page) return;
      ev.preventDefault();
      if (typeof ev.stopPropagation === "function") ev.stopPropagation();
      state.contextMenuOpen = true;
      open(named.getAttribute("data-name"), rectFor(named));
    }

    function onOutsidePointerDown(ev) {
      if (!state.on || !state.openFor) return;
      if (!menu()) return;
      if (ev.target.closest && ev.target.closest(`#${MENU_ID}`)) return;
      close();
    }

    function onKeyDown(ev) {
      if (ev.key === "Escape" && state.openFor) close();
    }

    function onPageChange(ev) {
      const page = ev && ev.detail && ev.detail.page;
      if (page && page !== "performance" && page !== "mixer") off();
    }

    function attach() {
      if (!documentRef) return;
      const btn = button();
      if (btn && !btn.dataset.cfgBound) {
        btn.addEventListener("click", () => toggle());
        btn.dataset.cfgBound = "1";
      }
      documentRef.addEventListener("pointerdown", onPointerDownCapture, { capture: true });
      documentRef.addEventListener("pointerup", onPointerUpCapture, { capture: true });
      documentRef.addEventListener("click", onPointerUpCapture, { capture: true });
      documentRef.addEventListener("contextmenu", onContextMenu);
      documentRef.addEventListener("pointerdown", onOutsidePointerDown, { capture: true });
      documentRef.addEventListener("keydown", onKeyDown);
      if (windowRef && typeof windowRef.addEventListener === "function") {
        windowRef.addEventListener("ableton-rc:page-change", onPageChange);
      }
    }

    function detach() {
      if (!documentRef) return;
      documentRef.removeEventListener("pointerdown", onPointerDownCapture, { capture: true });
      documentRef.removeEventListener("pointerup", onPointerUpCapture, { capture: true });
      documentRef.removeEventListener("click", onPointerUpCapture, { capture: true });
      documentRef.removeEventListener("contextmenu", onContextMenu);
      documentRef.removeEventListener("pointerdown", onOutsidePointerDown, { capture: true });
      documentRef.removeEventListener("keydown", onKeyDown);
      if (windowRef && typeof windowRef.removeEventListener === "function") {
        windowRef.removeEventListener("ableton-rc:page-change", onPageChange);
      }
    }

    function api() {
      return {
        state,
        on,
        off,
        toggle,
        open,
        close,
        register,
        unregister,
        renderMenuFor,
        clearMenu,
        attach,
        detach,
        // For tests
        _internals: {
          onPointerDownCapture,
          onPointerUpCapture,
          onContextMenu,
          onPageChange,
          isCfgPageTarget,
          controlName,
        },
      };
    }

    return api();
  }

  if (typeof module === "object" && module && module.exports) {
    module.exports = { create: createRcConfigMode };
  } else {
    const globalRef = typeof globalThis !== "undefined" ? globalThis
      : (typeof self !== "undefined" ? self
        : (typeof window !== "undefined" ? window : this));
    if (globalRef) {
      globalRef.RcConfigMode = { create: createRcConfigMode };
    }
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this)));
