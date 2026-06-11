// ==UserScript==
// @name         Bluesky Quick Actions
// @description  Site-wide quick actions for bsky.app. Repost: a single left-click reposts instantly (click again to undo); hovering the button opens the normal Repost / Quote menu. Shift-click always opens the native menu.
// @author       quentinwolf
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @namespace    quentinwolf_bluesky_quick_actions
// @version      1.0.2
// @license      GPL-3.0-or-later
// @homepageURL  https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky
// @supportURL   https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky/issues
// @match        *://bsky.app/*
// @downloadURL  https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky/raw/refs/heads/main/BlueSky_Quick_Actions.user.js
// @updateURL    https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky/raw/refs/heads/main/BlueSky_Quick_Actions.user.js
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    /* ======================================================================
     * Config / settings
     *
     *   Persisted via GM values and toggled from the userscript manager's
     *   menu (Tampermonkey: click the extension icon while on bsky.app).
     *   No on-page UI - the page is untouched except for the behaviours.
     * ==================================================================== */
    // Set true to hard-enable console logging in-file (overrides the menu toggle).
    const DEBUG_FORCE = true;

    const INSTANT_KEY = 'bqa-instant-repost'; // boolean: left-click reposts immediately
    const HOVER_KEY = 'bqa-hover-menu';       // boolean: hovering the button opens the menu
    const DEBUG_KEY = 'bqa-debug';            // boolean: console logging

    const HOVER_DELAY_MS = 300;  // hover-intent: how long the pointer must rest on the button
    const LEAVE_GRACE_MS = 500;  // pointer may be off the button+menu this long before it closes
    const HOVER_PAD_PX = 16;     // slack around the button/menu rects (covers the gap between them)
    const MENU_WAIT_MS = 700;    // how long to wait for the (hidden) menu to mount
    const VERIFY_MS = 150;       // beat between close checks in the fallback paths

    const settings = {
        instantRepost: GM_getValue(INSTANT_KEY, true),
        hoverMenu: GM_getValue(HOVER_KEY, true),
        debug: GM_getValue(DEBUG_KEY, false),
    };

    function logDebug(...args) {
        if (DEBUG_FORCE || settings.debug) console.log('[Quick Actions]', ...args);
    }

    // Userscript-manager menu: one toggle per setting, labels show current state.
    let menuIds = [];
    function refreshMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        if (typeof GM_unregisterMenuCommand === 'function') {
            menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (_) { /* ignore */ } });
        }
        menuIds = [];
        const add = (on, label, fn) => {
            try { menuIds.push(GM_registerMenuCommand((on ? '✅ ' : '⬜ ') + label, fn)); } catch (_) { /* ignore */ }
        };
        add(settings.instantRepost, 'Instant repost on left-click', () => toggleSetting('instantRepost', INSTANT_KEY));
        add(settings.hoverMenu, 'Hover opens the repost menu', () => toggleSetting('hoverMenu', HOVER_KEY));
        add(settings.debug, 'Debug logging', () => toggleSetting('debug', DEBUG_KEY));
    }
    function toggleSetting(prop, key) {
        settings[prop] = !settings[prop];
        GM_setValue(key, settings[prop]);
        refreshMenu();
    }

    /* ======================================================================
     * ACTION: quick repost.
     *
     *   Bluesky's repost button opens a Radix dropdown (Repost / Quote post),
     *   so a plain repost costs two clicks. This collapses it to one WITHOUT
     *   talking to the API: a left-click lets the dropdown open as normal but
     *   keeps it invisible, then auto-clicks its Repost item. Bluesky's own
     *   code does the write, so the icon recolours, the count bumps, and the
     *   client's state stays authoritative - and because the same menu item
     *   becomes "Undo repost" once reposted, a second click toggles it off,
     *   exactly like the like button.
     *
     *   Hovering the button (mouse only, with an intent delay) opens the menu
     *   visibly so Quote post stays one deliberate click away.
     *
     *   THE MODAL TRAP: while the dropdown is open, Radix puts the page behind
     *   it on pointer-events:none, which makes both hit-testing and boundary
     *   events lie. So whenever a repost menu is open, pointer COORDINATES are
     *   authoritative, never event targets:
     *     - presses: if the press lands inside the open menu's trigger rect it
     *       is a press on that button - whatever e.target claims - and means
     *       "toggle the repost now". Presses on the menu itself stay native
     *       (that's how Quote is chosen); presses elsewhere dismiss as normal.
     *     - hover lifetime: the menu stays while the pointer is inside a padded
     *       union of button rect + menu rect, and closes LEAVE_GRACE_MS after
     *       it leaves. (v1.0.0 trusted enter/leave events here - the phantom
     *       "left the button" fired by the modal flip caused an open/close
     *       flicker loop.)
     *
     *   Escape hatches, by design:
     *     - Shift/Ctrl/Alt/Meta-click, middle/right-click -> native behaviour.
     *     - Keyboard (Enter/Space) -> native menu (accessibility).
     *     - Touch / pen -> native menu (no hover there; Quote must stay reachable).
     *     - Menu never mounts or the item is missing (markup change, logged
     *       out, ...) -> unhide and fall back to the native menu.
     * ==================================================================== */
    const REPOST_BTN = '[data-testid="repostBtn"]';
    const REPOST_ITEM = '[data-testid="repostDropdownRepostBtn"]'; // "Repost" / "Undo repost"
    const MENU_CONTENT = '[data-radix-menu-content]';

    // Page realm where available: events built from the page's own constructors
    // behave identically to real ones for React's delegated listeners.
    const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;

    let suppress = false;                    // our own synthetic events are in flight - ignore them
    let pending = null;                      // the in-progress repost op (only ever one)
    let hoverBtn = null, hoverTimer = null;  // hover-intent: candidate button + its delay timer
    let hoverOpenedFor = null;               // trigger whose menu we opened by hover
    let leaveTimer = null;                   // grace timer before a hover-opened menu closes
    let guardBtn = null, guardUntil = 0;     // swallow the stray click that trails a swallowed press

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Poll (rAF-aligned) until fn() returns truthy or the window elapses.
    function waitFor(fn, ms) {
        return new Promise(resolve => {
            const t0 = Date.now();
            const tick = () => {
                const v = fn();
                if (v) return resolve(v);
                if (Date.now() - t0 > ms) return resolve(null);
                requestAnimationFrame(tick);
            };
            tick();
        });
    }

    function rectHas(r, x, y, pad) {
        return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }

    // Compact element description for the debug log.
    function describe(el) {
        if (!el) return '(null)';
        if (el === document.documentElement) return '<html>';
        if (el === document.body) return '<body>';
        let s = '<' + String(el.tagName || el.nodeName || '?').toLowerCase();
        const tid = el.getAttribute && el.getAttribute('data-testid');
        if (tid) s += ' testid="' + tid + '"';
        else if (el.id) s += ' id="' + el.id + '"';
        return s + '>';
    }

    // Any OPEN repost dropdown (Radix portals menus to the end of <body>).
    function anyOpenRepostMenu() {
        for (const m of document.querySelectorAll(MENU_CONTENT)) {
            if (m.getAttribute('data-state') !== 'open') continue; // skip exit-animating menus
            if (m.querySelector(REPOST_ITEM)) return m;
        }
        return null;
    }

    // The OPEN repost dropdown belonging to `btn`, paired via aria-labelledby =
    // trigger id when ids exist (fall back to "the one open repost menu").
    function openMenuFor(btn) {
        const m = anyOpenRepostMenu();
        if (!m) return null;
        const owner = m.getAttribute('aria-labelledby');
        if (owner && btn && btn.id && owner !== btn.id) return null;
        return m;
    }

    // The trigger button a menu belongs to: aria-labelledby points at its id, and
    // Radix marks the open trigger aria-expanded="true" (the fallback pairing).
    function triggerOf(menu) {
        const owner = menu.getAttribute('aria-labelledby');
        const byId = owner ? document.getElementById(owner) : null;
        if (byId) return byId;
        return document.querySelector(REPOST_BTN + '[aria-expanded="true"]');
    }

    // Full pointer+mouse press sequence: React's delegated listeners (and Radix,
    // which opens its dropdown on pointerdown and selects items on pointerup/click)
    // don't reliably respond to a bare .click(). Each dispatch is try/caught
    // individually so a manager that blocks one event class doesn't kill the rest.
    function fireClick(elx) {
        suppress = true;
        try {
            const base = { bubbles: true, cancelable: true, composed: true, view: W, button: 0, detail: 1 };
            const pointer = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
            const P = W.PointerEvent || window.PointerEvent;
            const M = W.MouseEvent || window.MouseEvent;
            try { if (P) elx.dispatchEvent(new P('pointerdown', { ...pointer, buttons: 1 })); } catch (_) { /* ignore */ }
            try { elx.dispatchEvent(new M('mousedown', { ...base, buttons: 1 })); } catch (_) { /* ignore */ }
            try { if (P) elx.dispatchEvent(new P('pointerup', pointer)); } catch (_) { /* ignore */ }
            try { elx.dispatchEvent(new M('mouseup', base)); } catch (_) { /* ignore */ }
            try { elx.dispatchEvent(new M('click', base)); } catch (_) { /* ignore */ }
            try { elx.click(); } catch (_) { /* ignore */ }
        } finally {
            suppress = false;
        }
    }

    function fireKey(target, key) {
        suppress = true;
        try {
            const K = W.KeyboardEvent || window.KeyboardEvent;
            const o = { bubbles: true, cancelable: true, composed: true, view: W, key, code: key };
            try { target.dispatchEvent(new K('keydown', o)); } catch (_) { /* ignore */ }
            try { target.dispatchEvent(new K('keyup', o)); } catch (_) { /* ignore */ }
        } finally {
            suppress = false;
        }
    }

    function injectStyles() {
        if (document.getElementById('bqa-styles')) return;
        const style = document.createElement('style');
        style.id = 'bqa-styles';
        // While html.bqa-hide-menu is set, an open repost dropdown is invisible and
        // inert - it exists just long enough for the script to click an item in it.
        // :has() scopes the hiding to the repost menu specifically, so an unrelated
        // tooltip or dialog that happens to be open is never blanked.
        style.textContent =
            'html.bqa-hide-menu [data-radix-popper-content-wrapper]:has([data-testid="repostDropdownRepostBtn"]),' +
            'html.bqa-hide-menu [data-radix-menu-content]:has([data-testid="repostDropdownRepostBtn"])' +
            ' { visibility: hidden !important; pointer-events: none !important; }';
        (document.head || document.documentElement).appendChild(style);
    }

    function hideMenus(on) {
        document.documentElement.classList.toggle('bqa-hide-menu', !!on);
    }

    /* ---- instant repost ------------------------------------------------ */

    // Click `menu`'s Repost / Undo-repost item and confirm the menu closed;
    // falls back to the keyboard path (focus + Enter) if the click select was
    // ignored. Returns once the select has settled either way.
    async function selectRepostItem(btn, menu) {
        const item = menu.querySelector(REPOST_ITEM);
        if (!item) { logDebug('repost item missing from menu'); return; }
        logDebug('clicking menu item "' + (item.getAttribute('aria-label') || 'repost') + '"');
        fireClick(item);
        const closed = await waitFor(() => !openMenuFor(btn), 400);
        if (closed) return;
        const still = openMenuFor(btn);
        const retry = still && still.querySelector(REPOST_ITEM);
        if (retry) {
            logDebug('click select ignored; retrying via focus+Enter');
            try { retry.focus(); } catch (_) { /* ignore */ }
            fireKey(retry, 'Enter');
            await waitFor(() => !openMenuFor(btn), 300);
        }
    }

    // Keep the menu invisible, get it open (the user's own press usually does it;
    // `mustOpen` presses the trigger synthetically when the real press couldn't
    // reach it), then select the repost item. Any failure (menu never mounts,
    // item missing, select ignored) ends with an unhide - worst case the user
    // simply sees the menu they'd have seen anyway.
    async function autoRepost(btn, mustOpen) {
        const op = {};
        pending = op;
        hideMenus(true);
        try {
            if (mustOpen) fireClick(btn);
            const menu = openMenuFor(btn) || await waitFor(() => openMenuFor(btn), MENU_WAIT_MS);
            if (pending !== op) return;
            if (!menu) { logDebug('repost menu never appeared (logged out / markup changed?)'); return; }
            await selectRepostItem(btn, menu);
        } finally {
            if (pending === op) {
                pending = null;
                hideMenus(false); // if a menu is somehow still open, it becomes visible/usable
            }
        }
    }

    // Toggle via a menu that is already open on screen (hover put it up, or the
    // press was aimed at the trigger of an open menu).
    async function toggleViaOpenMenu(btn, menu) {
        const op = {};
        pending = op;
        try {
            await selectRepostItem(btn, menu);
        } finally {
            if (pending === op) pending = null;
        }
    }

    // Classify a press. While a repost menu is open, hit-testing is unreliable
    // (the page behind the modal layer is pointer-events:none and what the press
    // targets varies), so coordinates are authoritative there: inside the open
    // menu's trigger rect = a press on that button, whatever e.target says. A
    // press on the menu itself always stays native (item selection / Quote), and
    // a press anywhere else stays native too (dismiss).
    function classifyPress(e, menu) {
        const t = e.target;
        if (menu) {
            if (t && t.closest && t.closest(MENU_CONTENT)) return null; // menu items are native
            const trig = triggerOf(menu);
            if (trig && rectHas(trig.getBoundingClientRect(), e.clientX, e.clientY, 0)) {
                return { btn: trig, menu, direct: false };
            }
            return null;
        }
        const direct = t && t.closest ? t.closest(REPOST_BTN) : null;
        if (direct) return { btn: direct, menu: null, direct: true };
        // No menu open but the press hit-tested to the root (an overlay lingering a
        // frame after close): recover the intended button from the coordinates.
        if (t === document.documentElement || t === document.body) {
            for (const b of document.querySelectorAll(REPOST_BTN)) {
                const r = b.getBoundingClientRect();
                if (r.width > 0 && rectHas(r, e.clientX, e.clientY, 0)) return { btn: b, menu: null, direct: false };
            }
        }
        return null;
    }

    // Swallowed presses never reach the page, but the browser still fires the
    // trailing `click` of that press ~when the button is released - by which time
    // the modal layer may be gone and the click would land on the post card and
    // navigate. Arm a short, button-scoped guard to eat exactly that click.
    function armClickGuard(btn) {
        guardBtn = btn;
        guardUntil = Date.now() + 400;
    }
    function onClickCapture(e) {
        if (suppress || !guardBtn || Date.now() >= guardUntil) return;
        const onBtn = (e.target && e.target.closest && e.target.closest(REPOST_BTN) === guardBtn) ||
            rectHas(guardBtn.getBoundingClientRect(), e.clientX, e.clientY, 0);
        if (onBtn) {
            e.preventDefault();
            e.stopImmediatePropagation();
            guardBtn = null;
        }
    }

    function onPointerDown(e) {
        if (suppress || !settings.instantRepost) return;
        // Touch and pen keep Bluesky's native menu: with no hover available there,
        // an instant repost would leave "Quote post" unreachable. Keyboard (Enter /
        // Space) never produces a pointerdown, so it keeps the native menu too.
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        const menuOpen = anyOpenRepostMenu();
        const press = classifyPress(e, menuOpen);
        if (menuOpen || press) {
            logDebug('pointerdown target=' + describe(e.target) +
                ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY) +
                ' menuOpen=' + !!menuOpen +
                ' -> ' + (press ? ('btn' + (press.menu ? '+menu' : '') + (press.direct ? ' (direct)' : ' (geometric)')) : 'no match (native)'));
        }
        if (!press) return;
        const btn = press.btn;

        if (pending) { // a repost op is already mid-flight: swallow the extra press
            logDebug('press ignored: op already in flight');
            e.preventDefault();
            e.stopImmediatePropagation();
            armClickGuard(btn);
            return;
        }

        if (press.menu) {
            // The open menu belongs to this button: a click on the button still means
            // "toggle the repost now". Swallow the press so Radix doesn't dismiss /
            // toggle-close the menu before our item click lands.
            e.preventDefault();
            e.stopImmediatePropagation();
            armClickGuard(btn);
            hoverOpenedFor = null;
            stopHoverTracking();
            toggleViaOpenMenu(btn, press.menu);
            return;
        }

        cancelHover(); // the press supersedes any pending hover-open
        // If the press physically can't reach the trigger (it hit-tested to the
        // root under a lingering overlay), swallow it and press synthetically.
        if (!press.direct) {
            e.preventDefault();
            e.stopImmediatePropagation();
            armClickGuard(btn);
        }
        autoRepost(btn, !press.direct);
    }

    /* ---- hover opens the menu ------------------------------------------ */

    function cancelHover() {
        if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
        hoverBtn = null;
    }
    function cancelLeave() {
        if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    }

    // Close `btn`'s open dropdown: Escape first (Radix's own dismiss path - its
    // top-most layer consumes the key), then a toggle-press on the trigger if the
    // synthetic Escape was ignored.
    async function closeMenuFor(btn) {
        if (!openMenuFor(btn)) return;
        fireKey(document, 'Escape');
        await sleep(VERIFY_MS);
        if (openMenuFor(btn)) {
            logDebug('Escape ignored; toggling the trigger to close');
            fireClick(btn);
        }
    }

    function openMenuByHover(btn) {
        if (pending || openMenuFor(btn)) return;
        logDebug('hover: opening repost menu');
        fireClick(btn); // Radix opens on the synthetic pointerdown; `suppress` keeps our own hooks out
        hoverOpenedFor = btn;
        startHoverTracking();
        // If Radix ignored the synthetic press, clear the marker so nothing sticks.
        setTimeout(() => {
            if (hoverOpenedFor === btn && !openMenuFor(btn)) { hoverOpenedFor = null; stopHoverTracking(); }
        }, 250);
    }

    /* The open hover-menu's lifetime: pointer coordinates only (see THE MODAL
     * TRAP above). A padded union of the button rect + menu rect counts as
     * "inside"; only after the pointer has been outside it for LEAVE_GRACE_MS
     * does the menu close. */
    let trackHandler = null, trackRaf = false, trackX = 0, trackY = 0;

    function startHoverTracking() {
        if (trackHandler) return;
        trackHandler = (e) => {
            if (e.pointerType && e.pointerType !== 'mouse') return;
            trackX = e.clientX; trackY = e.clientY;
            if (trackRaf) return; // coalesce the move stream to one check per frame
            trackRaf = true;
            requestAnimationFrame(() => { trackRaf = false; trackTick(); });
        };
        document.addEventListener('pointermove', trackHandler, { passive: true, capture: true });
    }

    function stopHoverTracking() {
        if (trackHandler) {
            document.removeEventListener('pointermove', trackHandler, true);
            trackHandler = null;
        }
        cancelLeave();
    }

    function trackTick() {
        const btn = hoverOpenedFor;
        if (!btn) { stopHoverTracking(); return; }
        const menu = openMenuFor(btn);
        if (!menu) { hoverOpenedFor = null; stopHoverTracking(); return; } // closed by select/Escape/etc.
        const inside = rectHas(btn.getBoundingClientRect(), trackX, trackY, HOVER_PAD_PX) ||
                       rectHas(menu.getBoundingClientRect(), trackX, trackY, HOVER_PAD_PX);
        if (inside) { cancelLeave(); return; }
        if (!leaveTimer) {
            leaveTimer = setTimeout(() => {
                leaveTimer = null;
                const b = hoverOpenedFor;
                hoverOpenedFor = null;
                stopHoverTracking();
                if (b) { logDebug('hover: pointer left button+menu; closing'); closeMenuFor(b); }
            }, LEAVE_GRACE_MS);
        }
    }

    function onPointerOver(e) {
        if (suppress || !settings.hoverMenu) return;
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const t = e.target;
        if (!t || !t.closest) return;
        if (hoverOpenedFor) {
            if (openMenuFor(hoverOpenedFor)) return; // an open hover-menu is tracking's business
            hoverOpenedFor = null;                   // stale marker (menu closed some other way)
            stopHoverTracking();
        }
        const btn = t.closest(REPOST_BTN);
        if (!btn || pending || hoverBtn === btn) return; // mid-repost, or timer already armed
        cancelHover();
        if (openMenuFor(btn)) return; // already open by other means
        hoverBtn = btn;
        hoverTimer = setTimeout(() => {
            hoverTimer = null;
            const b = hoverBtn;
            hoverBtn = null;
            // Only if the pointer is still resting on the button (hover-intent).
            if (b && b.isConnected && b.matches(':hover')) openMenuByHover(b);
        }, HOVER_DELAY_MS);
    }

    // Boundary events are only used for the intent phase (no menu open yet, so
    // hit-testing is honest): leaving the button before the delay elapses cancels
    // the pending open. The OPEN menu never listens to these - see trackTick.
    function onPointerOut(e) {
        if (suppress || !settings.hoverMenu || !hoverBtn) return;
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const t = e.target, rt = e.relatedTarget;
        if (!t || !t.closest || t.closest(REPOST_BTN) !== hoverBtn) return;
        if (rt && rt.closest && rt.closest(REPOST_BTN) === hoverBtn) return; // moved within the button
        cancelHover();
    }

    // Scrolling means "I'm moving on": cancel a pending hover-open, and close a
    // hover-opened menu right away (its modal layer would otherwise pin the page's
    // scroll until dismissed).
    function onWheel() {
        if (hoverTimer) cancelHover();
        if (hoverOpenedFor) {
            const b = hoverOpenedFor;
            hoverOpenedFor = null;
            stopHoverTracking();
            logDebug('hover: scroll; closing menu');
            closeMenuFor(b);
        }
    }

    /* ======================================================================
     * Wire-up.
     * ==================================================================== */
    function start() {
        injectStyles();
        // Capture phase everywhere: we must run before React's delegated handlers
        // (Radix opens its menu on pointerdown), and the buttons live all over a
        // virtualised feed, so one set of document-level listeners is both cheaper
        // and more robust than per-button hooks.
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('click', onClickCapture, true);
        document.addEventListener('pointerover', onPointerOver, true);
        document.addEventListener('pointerout', onPointerOut, true);
        document.addEventListener('wheel', onWheel, { passive: true, capture: true });
        refreshMenu();
        logDebug('ready (instant repost: ' + settings.instantRepost + ', hover menu: ' + settings.hoverMenu + ')');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
