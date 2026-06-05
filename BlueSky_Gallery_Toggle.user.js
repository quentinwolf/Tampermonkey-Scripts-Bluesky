// ==UserScript==
// @name         Bluesky Gallery Toggle
// @description  Replaces a profile's Media view with an x.com-style media grid (images + video), fed live by the AT Protocol API with infinite scroll. Full-screen or in-line.
// @author       @quentinwolf.ca
// @match        *://bsky.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @namespace    quentinwolf
// @version      2.3.1
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @downloadURL  https://github.com/quentinwolf/Tampermonkey-Scripts/raw/refs/heads/main/BlueSky_Gallery_Toggle.user.js
// @updateURL    https://github.com/quentinwolf/Tampermonkey-Scripts/raw/refs/heads/main/BlueSky_Gallery_Toggle.user.js
// ==/UserScript==

(function () {
    'use strict';

    /* ======================================================================
     * Config
     * ==================================================================== */
    const BTN_ID = 'bsky-gallery-toggle-btn';
    const OVERLAY_ID = 'bsky-gallery-overlay';
    const LIGHTBOX_ID = 'bsky-gallery-lightbox';
    const SETTINGS_ID = 'bsky-gallery-settings';
    const STORAGE_KEY = 'bsky-gallery-enabled';
    const MODE_KEY = 'bsky-gallery-mode';            // 'fullscreen' | 'inline'
    const SIZE_KEY = 'bsky-gallery-size';            // 'small' | 'medium' | 'large'
    const PAGE_LIMIT = 100;                          // max getAuthorFeed page size
    const PUBLIC_API = 'https://public.api.bsky.app'; // unauthenticated fallback
    const ACCENT = '#4aa8ff';

    // Tile min-width per size. Tuned so in-line lands on ~5 / 4 / 3 columns
    // (Large ≈ x.com's 3-across); full-screen is wider so it shows more.
    const SIZES = {
        small:  { inline: '100px', full: '120px' },
        medium: { inline: '120px', full: '150px' },
        large:  { inline: '170px', full: '210px' },
    };

    const ICON_GRID = 'M2 6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6zm2 0v4h4V6H4zm10-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v4h4V6h-4zM2 16a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4zm2 0v4h4v-4H4zm10-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zm0 2v4h4v-4h-4z';
    const ICON_GEAR = 'M19.14 12.94c.04-.3.06-.62.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.13.22.39.3.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z';
    const ICON_EXT = 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h5v2H7v10h10v-3h2v5H5V5z';
    const ICON_PLAY = 'M8 5v14l11-7z';

    // Post-action icons (lifted from Bluesky's own buttons so the lightbox bar
    // matches the native look). Heart + bookmark have a filled variant for the
    // "on" state; the filled bookmark is Bluesky's outer silhouette, solid.
    const ICON_REPLY = 'M20.002 7a2 2 0 0 0-2-2h-12a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2a1 1 0 0 1 1 1v1.918l3.375-2.7a1 1 0 0 1 .625-.218h5a2 2 0 0 0 2-2V7Zm2 8a4 4 0 0 1-4 4h-4.648l-4.727 3.781A1.001 1.001 0 0 1 7.002 22v-3h-1a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8Z';
    const ICON_REPOST = 'M17.957 2.293a1 1 0 1 0-1.414 1.414L17.836 5H6a3 3 0 0 0-3 3v3a1 1 0 1 0 2 0V8a1 1 0 0 1 1-1h11.836l-1.293 1.293a1 1 0 0 0 1.414 1.414l2.47-2.47a1.75 1.75 0 0 0 0-2.474l-2.47-2.47ZM20 12a1 1 0 0 1 1 1v3a3 3 0 0 1-3 3H6.164l1.293 1.293a1 1 0 1 1-1.414 1.414l-2.47-2.47a1.75 1.75 0 0 1 0-2.474l2.47-2.47a1 1 0 0 1 1.414 1.414L6.164 17H18a1 1 0 0 0 1-1v-3a1 1 0 0 1 1-1Z';
    const ICON_HEART = 'M16.734 5.091c-1.238-.276-2.708.047-4.022 1.38a1 1 0 0 1-1.424 0C9.974 5.137 8.504 4.814 7.266 5.09c-1.263.282-2.379 1.206-2.92 2.556C3.33 10.18 4.252 14.84 12 19.348c7.747-4.508 8.67-9.168 7.654-11.7-.541-1.351-1.657-2.275-2.92-2.557Zm4.777 1.812c1.604 4-.494 9.69-9.022 14.47a1 1 0 0 1-.978 0C2.983 16.592.885 10.902 2.49 6.902c.779-1.942 2.414-3.334 4.342-3.764 1.697-.378 3.552.003 5.169 1.286 1.617-1.283 3.472-1.664 5.17-1.286 1.927.43 3.562 1.822 4.34 3.764Z';
    const ICON_HEART_FILLED = 'M12.489 21.372c8.528-4.78 10.626-10.47 9.022-14.47-.779-1.941-2.414-3.333-4.342-3.763-1.697-.378-3.552.003-5.169 1.287-1.617-1.284-3.472-1.665-5.17-1.287-1.927.43-3.562 1.822-4.34 3.764-1.605 4 .493 9.69 9.021 14.47a1 1 0 0 0 .978 0Z';
    const ICON_BOOKMARK = 'M9.7 16.895a4 4 0 0 1 4.6 0l3.7 2.6V6.5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12.995l3.7-2.6Zm10.3 2.6c0 1.62-1.825 2.567-3.15 1.636l-3.7-2.6a2.001 2.001 0 0 0-2.3 0l-3.7 2.6C5.825 22.062 4 21.115 4 19.495V6.5a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v12.995Z';
    const ICON_BOOKMARK_FILLED = 'M20 19.495C20 21.115 18.175 22.062 16.85 21.131L13.15 18.531A2.001 2.001 0 0 0 10.85 18.531L7.15 21.131C5.825 22.062 4 21.115 4 19.495V6.5A4 4 0 0 1 8 2.5H16A4 4 0 0 1 20 6.5V19.495Z';

    let galleryEnabled = GM_getValue(STORAGE_KEY, false);
    const settings = {
        mode: GM_getValue(MODE_KEY, 'fullscreen'),
        size: GM_getValue(SIZE_KEY, 'medium'),
    };

    // The page-realm fetch, captured before we patch it. We use this for our own
    // API calls so they don't recurse through our capture hook.
    const nativeFetch = unsafeWindow.fetch;

    /* ======================================================================
     * 1. Borrow the logged-in session straight off the app's own requests.
     *
     *    The official bsky.app web client uses password-session Bearer tokens
     *    (not DPoP), and continually refreshes them. By watching the requests
     *    it already makes to /xrpc/app.bsky.* we get a fresh token + the exact
     *    origin/headers it uses, so our grid sees precisely what you see -
     *    including adult / labeled media. Falls back to the public API.
     * ==================================================================== */
    const auth = { origin: null, headers: null };

    function normalizeHeaders(h) {
        const out = {};
        if (!h) return out;
        try {
            if (h instanceof Headers || (typeof h.forEach === 'function' && !Array.isArray(h))) {
                h.forEach((v, k) => { out[String(k).toLowerCase()] = v; });
            } else if (Array.isArray(h)) {
                h.forEach(([k, v]) => { out[String(k).toLowerCase()] = v; });
            } else if (typeof h === 'object') {
                Object.keys(h).forEach(k => { out[k.toLowerCase()] = h[k]; });
            }
        } catch (e) { /* ignore */ }
        return out;
    }

    function captureAuth(url, headersLike) {
        try {
            if (!url || url.indexOf('/xrpc/app.bsky.') === -1) return;
            const h = normalizeHeaders(headersLike);
            const authz = h['authorization'];
            if (!authz || !/^bearer\s+/i.test(authz)) return; // need a bearer token

            auth.origin = new URL(url, location.href).origin;
            const replay = { 'authorization': authz };
            // Carry over proxy / labeler / language context so moderation matches.
            ['atproto-proxy', 'atproto-accept-labelers', 'accept-language'].forEach(k => {
                if (h[k]) replay[k] = h[k];
            });
            auth.headers = replay;
        } catch (e) { /* ignore */ }
    }

    function installFetchHook() {
        unsafeWindow.fetch = function (input, init) {
            try {
                let url, headers;
                if (input && typeof input === 'object' && 'url' in input) { // Request
                    url = input.url;
                    headers = input.headers;
                    if (init && init.headers) headers = { ...normalizeHeaders(headers), ...normalizeHeaders(init.headers) };
                } else {
                    url = String(input);
                    headers = init && init.headers;
                }
                captureAuth(url, headers);
            } catch (e) { /* never break the app */ }
            return nativeFetch.apply(this, arguments);
        };
    }

    /* ======================================================================
     * 2. API: getAuthorFeed?filter=posts_with_media, paginated by cursor.
     * ==================================================================== */
    async function fetchMediaPage(actor, cursor) {
        const params = new URLSearchParams({
            actor: actor,
            filter: 'posts_with_media',
            limit: String(PAGE_LIMIT),
        });
        if (cursor) params.set('cursor', cursor);
        const path = '/xrpc/app.bsky.feed.getAuthorFeed?' + params.toString();

        // Preferred: replay the app's authenticated request.
        if (auth.origin && auth.headers) {
            try {
                const res = await nativeFetch(auth.origin + path, {
                    headers: auth.headers,
                    credentials: 'omit',
                });
                if (res.ok) return res.json();
            } catch (e) { /* fall through to public */ }
        }

        // Fallback: public AppView, no auth (default moderation applies).
        const res = await nativeFetch(PUBLIC_API + path, {
            headers: { 'accept-language': navigator.language || 'en' },
        });
        if (!res.ok) throw new Error('getAuthorFeed ' + res.status);
        return res.json();
    }

    /* ======================================================================
     * 3. Turn a post into one or more grid tiles.
     * ==================================================================== */
    function postUrl(post) {
        const rkey = post.uri.split('/').pop();
        const handle = (post.author && post.author.handle) || (post.author && post.author.did);
        return 'https://bsky.app/profile/' + handle + '/post/' + rkey;
    }

    // Distil the bits the lightbox action bar needs: identity (uri/cid) for writes,
    // current counts, and the viewer's like/repost record URIs + bookmark flag so we
    // can show the right pressed state and toggle it. One object is shared by every
    // image tile from the same post, so a like/repost updates them together.
    function postStateFrom(post) {
        const v = (post && post.viewer) || {};
        return {
            uri: post.uri, cid: post.cid, url: postUrl(post),
            replyCount: post.replyCount || 0,
            repostCount: post.repostCount || 0,
            likeCount: post.likeCount || 0,
            likeUri: v.like || null,
            repostUri: v.repost || null,
            bookmarked: !!v.bookmarked,
        };
    }

    function tilesFromPost(post) {
        const tiles = [];
        let embed = post && post.embed;
        if (!embed) return tiles;

        // Unwrap quote-post-with-media to the media itself.
        if (embed.$type === 'app.bsky.embed.recordWithMedia#view' && embed.media) {
            embed = embed.media;
        }
        const type = embed.$type;

        if (type === 'app.bsky.embed.images#view' && Array.isArray(embed.images)) {
            const ps = postStateFrom(post); // shared across this post's image tiles
            embed.images.forEach(img => {
                tiles.push({
                    kind: 'image',
                    thumb: img.thumb,
                    full: img.fullsize,   // already @jpeg from the AppView
                    alt: img.alt || '',
                    url: postUrl(post),
                    postState: ps,
                });
            });
        } else if (type === 'app.bsky.embed.video#view') {
            tiles.push({
                kind: 'video',
                label: 'Video',
                thumb: embed.thumbnail,
                alt: embed.alt || '',
                url: postUrl(post),
            });
        } else if (type === 'app.bsky.embed.external#view' && embed.external && embed.external.thumb) {
            // Tenor/Giphy gifs ride in as external embeds; include them as playable tiles.
            const uri = embed.external.uri || '';
            if (/\.gif($|\?)/i.test(uri) || /tenor\.com|media\.tenor|giphy\.com/i.test(uri)) {
                tiles.push({
                    kind: 'video',
                    label: 'GIF',
                    thumb: embed.external.thumb,
                    alt: embed.external.title || '',
                    url: postUrl(post),
                });
            }
        }
        return tiles;
    }

    /* ======================================================================
     * Tiny DOM helper (no innerHTML -> safe under Trusted-Types CSP).
     * ==================================================================== */
    function el(tag, props) {
        const e = document.createElement(tag);
        if (props) {
            for (const k in props) {
                const v = props[k];
                if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
                else if (k === 'class') e.className = v;
                else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k in e) { try { e[k] = v; } catch (_) { e.setAttribute(k, v); } }
                else e.setAttribute(k, v);
            }
        }
        for (let i = 2; i < arguments.length; i++) {
            let c = arguments[i];
            if (c == null) continue;
            if (Array.isArray(c)) { c.forEach(x => x != null && e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x)); continue; }
            e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
        return e;
    }

    function svgIcon(path, w, h) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', w || 24);
        svg.setAttribute('height', h || 24);
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', path);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
        return svg;
    }

    /* ======================================================================
     * 4. The grid + state.
     * ==================================================================== */
    const grid = {
        actor: null, cursor: undefined, loading: false, done: false,
        images: [], seen: null,
    };
    let rootEl, scrollEl, gridEl, sentinelEl, countEl, io, overlayKeyHandler;
    let mountedMode = null, inlineHost = null;

    function buildHeader(actor) {
        const title = el('div', { class: 'bgt-title' }, actor.startsWith('did:') ? actor : '@' + actor);
        const sub = el('div', { class: 'bgt-sub' }, 'Media gallery');
        countEl = el('div', { class: 'bgt-sub bgt-count' }, '');

        const closeBtn = el('button', { class: 'bgt-iconbtn', title: 'Close gallery (Esc)', onClick: closeGallery }, '✕');
        const gearBtn = el('button', { class: 'bgt-iconbtn', title: 'Gallery settings', onClick: openSettings }, svgIcon(ICON_GEAR, 20, 20));
        const openProfile = el('a', {
            class: 'bgt-iconbtn', title: 'Open profile in new tab', target: '_blank', rel: 'noopener',
            href: 'https://bsky.app/profile/' + actor,
        }, svgIcon(ICON_EXT, 20, 20));

        return el('div', { class: 'bgt-header' },
            closeBtn,
            el('div', { class: 'bgt-titlewrap' }, title, el('div', { class: 'bgt-subrow' }, sub, countEl)),
            el('div', { class: 'bgt-spacer' }),
            gearBtn, openProfile
        );
    }

    // ---- find the in-line injection point (your selector first, then fallbacks) ----
    function findInlineHost() {
        const r = document.querySelector('.r-2llsf');
        if (r) {
            const tries = [
                ':scope > div:nth-child(6) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)',
                ':scope > div:nth-child(6)',
            ];
            for (const s of tries) {
                try { const h = r.querySelector(s); if (h) return h; } catch (_) { /* bad selector */ }
            }
        }
        return null;
    }

    function mountFullscreen(header) {
        const inner = el('div', { class: 'bgt-inner' }, gridEl, sentinelEl);
        scrollEl = el('div', { class: 'bgt-scroll' }, inner);
        rootEl = el('div', { id: OVERLAY_ID }, header, scrollEl);
        document.body.appendChild(rootEl);
        mountedMode = 'fullscreen';
    }

    function mountInline(header) {
        const host = findInlineHost();
        if (!host || !host.parentNode) return false;
        inlineHost = host;
        host.classList.add('bgt-feed-hidden');
        const inner = el('div', { class: 'bgt-inner bgt-inner-inline' }, gridEl, sentinelEl);
        rootEl = el('div', { id: OVERLAY_ID, class: 'bgt-inline' }, header, inner);
        host.parentNode.insertBefore(rootEl, host.nextSibling);
        // Detect infinite-scroll against the viewport (observer root = null). Anchoring
        // to an inner scroll container is unreliable: Bluesky's wrappers can have
        // overflow:auto yet scroll as a block with the page, so the sentinel never
        // changes intersection against them and further pages never load.
        scrollEl = null;
        mountedMode = 'inline';
        return true;
    }

    function setSentinel(mode, text) {
        if (!sentinelEl) return;
        while (sentinelEl.firstChild) sentinelEl.removeChild(sentinelEl.firstChild);
        if (mode === 'spin') sentinelEl.appendChild(el('div', { class: 'bgt-spinner' }));
        else if (mode === 'text') sentinelEl.appendChild(document.createTextNode(text || ''));
    }

    function makeTile(t) {
        const img = el('img', { src: t.thumb, alt: t.alt, loading: 'lazy', draggable: false });
        // Real anchor (not a button) so the browser's own link affordances all point
        // at the actual post: middle-click / ctrl- / shift-click open it in a new tab,
        // and the right-click menu offers "Open in new tab" + "Copy link". We only
        // hijack a plain left-click for the in-grid lightbox / open-post behaviour.
        const tile = el('a', {
            class: 'bgt-tile', title: t.alt || '', href: t.url,
            onClick: (e) => {
                // Leave modified / non-primary clicks to the browser (new tab, etc).
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                if (t.kind === 'image') openLightbox(t._imgIndex);
                else unsafeWindow.open(t.url, '_blank', 'noopener'); // video/gif -> the post
            },
        }, img);

        if (t.kind === 'video') {
            const badge = el('span', { class: 'bgt-badge' }, svgIcon(ICON_PLAY, 12, 12), t.label || 'Video');
            tile.appendChild(badge);
        }
        return tile;
    }

    function appendTiles(tiles) {
        const frag = document.createDocumentFragment();
        tiles.forEach(t => {
            const key = t.thumb || (t.url + t.alt);
            if (grid.seen.has(key)) return;
            grid.seen.add(key);
            if (t.kind === 'image') {
                t._imgIndex = grid.images.length;
                grid.images.push({ full: t.full, alt: t.alt, url: t.url, postState: t.postState });
            }
            frag.appendChild(makeTile(t));
        });
        gridEl.appendChild(frag);
        if (countEl) countEl.textContent = '· ' + grid.seen.size + ' items';
    }

    async function loadMore() {
        if (grid.loading || grid.done || !grid.actor || !rootEl) return;
        grid.loading = true;
        setSentinel('spin');
        try {
            const data = await fetchMediaPage(grid.actor, grid.cursor);
            grid.cursor = data.cursor;
            if (!data.cursor) grid.done = true;

            const tiles = [];
            (data.feed || []).forEach(item => {
                if (item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost') return; // skip reposts
                tilesFromPost(item.post).forEach(t => tiles.push(t));
            });
            appendTiles(tiles);

            if (grid.done) setSentinel('text', grid.seen.size ? 'End of media' : 'No media found');
            else setSentinel('none');
        } catch (e) {
            console.error('[Gallery Toggle] load failed:', e);
            grid.done = true;
            setSentinel('text', 'Could not load media (' + (e && e.message ? e.message : 'error') + ')');
        } finally {
            grid.loading = false;
            if (!grid.done) requestAnimationFrame(maybeLoadMore); // keep filling short pages
        }
    }

    function maybeLoadMore() {
        if (!rootEl || grid.done || grid.loading) return;
        const s = sentinelEl.getBoundingClientRect();
        const bottom = scrollEl ? scrollEl.getBoundingClientRect().bottom : window.innerHeight;
        if (s.top <= bottom + 800) loadMore();
    }

    /* ======================================================================
     * 4b. Post actions (like / repost / bookmark) driven straight off the
     *     borrowed session - the same token we read the feed with can write,
     *     so these are real records, not a fake UI. Like/repost are repo
     *     records on your PDS; bookmarks are an AppView call (proxied).
     * ==================================================================== */
    let myDid = null, myDidTok = null;

    // The atproto access token is a JWT whose `sub` is the account DID - decode it
    // locally rather than spend a round-trip on getSession. Re-derived if the app
    // rotates the token.
    function b64urlToStr(s) {
        s = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return atob(s);
    }
    function getMyDid() {
        const authz = auth.headers && auth.headers.authorization;
        if (!authz) return null;
        const tok = authz.replace(/^bearer\s+/i, '');
        if (myDid && myDidTok === tok) return myDid;
        try {
            const payload = JSON.parse(b64urlToStr(tok.split('.')[1]));
            if (payload && typeof payload.sub === 'string' && payload.sub.indexOf('did:') === 0) {
                myDid = payload.sub; myDidTok = tok; return myDid;
            }
        } catch (e) { /* not a decodable JWT */ }
        return null;
    }

    // POST an XRPC procedure on the borrowed session. `useProxy` forwards the
    // app's atproto-proxy header so app.bsky.* calls reach the AppView; repo
    // writes (com.atproto.*) are handled by the PDS itself, so they omit it.
    async function xrpcPost(method, body, useProxy) {
        if (!auth.origin || !auth.headers || !auth.headers.authorization) throw new Error('no session');
        const headers = { 'authorization': auth.headers.authorization, 'content-type': 'application/json' };
        if (useProxy) {
            ['atproto-proxy', 'atproto-accept-labelers', 'accept-language'].forEach(k => {
                if (auth.headers[k]) headers[k] = auth.headers[k];
            });
        }
        const res = await nativeFetch(auth.origin + '/xrpc/' + method, {
            method: 'POST', headers, body: JSON.stringify(body), credentials: 'omit',
        });
        if (!res.ok) throw new Error(method + ' ' + res.status);
        const text = await res.text();
        try { return text ? JSON.parse(text) : {}; } catch (_) { return {}; }
    }
    const rkeyOf = (uri) => String(uri).split('/').pop();
    const repoCreate = (repo, collection, record) => xrpcPost('com.atproto.repo.createRecord', { repo, collection, record }, false);
    const repoDelete = (repo, collection, rkey) => xrpcPost('com.atproto.repo.deleteRecord', { repo, collection, rkey }, false);

    // Abbreviate like Bluesky: 999 -> "999", 1200 -> "1.2K", 0 -> "" (icon only).
    function fmtCount(n) {
        n = n || 0;
        if (n <= 0) return '';
        if (n < 1000) return String(n);
        if (n < 1e6) { const v = n / 1e3; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + 'K'; }
        const v = n / 1e6; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + 'M';
    }

    // Each toggle flips the UI optimistically, fires the write, and rolls back on
    // failure. Without a writable session we just open the post so the user can act
    // natively. A busy flag guards against double-taps racing the network.
    async function toggleLike(st) {
        if (!st || st._busyLike) return;
        const did = getMyDid();
        if (!did) { unsafeWindow.open(st.url, '_blank', 'noopener'); return; }
        st._busyLike = true;
        const was = !!st.likeUri, prev = st.likeUri;
        st.likeUri = was ? null : 'pending';
        st.likeCount = Math.max(0, st.likeCount + (was ? -1 : 1));
        updateActionBar();
        try {
            if (was) {
                await repoDelete(did, 'app.bsky.feed.like', rkeyOf(prev));
                st.likeUri = null;
            } else {
                const r = await repoCreate(did, 'app.bsky.feed.like',
                    { '$type': 'app.bsky.feed.like', subject: { uri: st.uri, cid: st.cid }, createdAt: new Date().toISOString() });
                st.likeUri = (r && r.uri) || null;
                if (!st.likeUri) throw new Error('no uri returned');
            }
        } catch (e) {
            console.error('[Gallery Toggle] like failed:', e);
            st.likeUri = prev;
            st.likeCount = Math.max(0, st.likeCount + (was ? 1 : -1));
        } finally {
            st._busyLike = false;
            updateActionBar();
        }
    }

    async function toggleRepost(st) {
        if (!st || st._busyRepost) return;
        const did = getMyDid();
        if (!did) { unsafeWindow.open(st.url, '_blank', 'noopener'); return; }
        st._busyRepost = true;
        const was = !!st.repostUri, prev = st.repostUri;
        st.repostUri = was ? null : 'pending';
        st.repostCount = Math.max(0, st.repostCount + (was ? -1 : 1));
        updateActionBar();
        try {
            if (was) {
                await repoDelete(did, 'app.bsky.feed.repost', rkeyOf(prev));
                st.repostUri = null;
            } else {
                const r = await repoCreate(did, 'app.bsky.feed.repost',
                    { '$type': 'app.bsky.feed.repost', subject: { uri: st.uri, cid: st.cid }, createdAt: new Date().toISOString() });
                st.repostUri = (r && r.uri) || null;
                if (!st.repostUri) throw new Error('no uri returned');
            }
        } catch (e) {
            console.error('[Gallery Toggle] repost failed:', e);
            st.repostUri = prev;
            st.repostCount = Math.max(0, st.repostCount + (was ? 1 : -1));
        } finally {
            st._busyRepost = false;
            updateActionBar();
        }
    }

    async function toggleBookmark(st) {
        if (!st || st._busyBm) return;
        const did = getMyDid();
        if (!did) { unsafeWindow.open(st.url, '_blank', 'noopener'); return; }
        st._busyBm = true;
        const was = !!st.bookmarked;
        st.bookmarked = !was;
        updateActionBar();
        try {
            if (was) await xrpcPost('app.bsky.bookmark.deleteBookmark', { uri: st.uri }, true);
            else await xrpcPost('app.bsky.bookmark.createBookmark', { uri: st.uri, cid: st.cid }, true);
        } catch (e) {
            console.error('[Gallery Toggle] bookmark failed:', e);
            st.bookmarked = was;
        } finally {
            st._busyBm = false;
            updateActionBar();
        }
    }

    /* ======================================================================
     * 5. Lightbox for images (videos/gifs open the post instead).
     * ==================================================================== */
    let lbEl, lbImg, lbCap, lbLink, lbPrev, lbNext, lbIndex = 0, lbKeyHandler;
    let lbActionsRow, lbReply, lbRepost, lbLike, lbBookmark;

    // Build one action button. `withCount` adds a live counter; like/bookmark pass a
    // second path so the icon can swap to its filled variant when active.
    function iconWithPath(d, size) {
        const svg = svgIcon(d, size, size);
        return { svg, path: svg.querySelector('path') };
    }
    function lbActButton(kind, pathD, withCount, onClick) {
        const ip = iconWithPath(pathD, 22);
        const out = { btn: null, path: ip.path, count: null };
        const kids = [ip.svg];
        if (withCount) { out.count = el('span', { class: 'bgt-act-count' }, ''); kids.push(out.count); }
        out.btn = el('button', { class: 'bgt-act bgt-act-' + kind, type: 'button', onClick }, kids);
        return out;
    }

    function curPostState() {
        const im = grid.images[lbIndex];
        return im && im.postState;
    }

    // Repaint the action bar for the post currently shown in the lightbox.
    function updateActionBar() {
        if (!lbActionsRow) return;
        const st = curPostState();
        if (!st) { lbActionsRow.style.visibility = 'hidden'; return; }
        lbActionsRow.style.visibility = 'visible';
        const canWrite = !!getMyDid();

        lbReply.count.textContent = fmtCount(st.replyCount);
        lbReply.btn.title = 'Reply (opens post)';

        lbRepost.count.textContent = fmtCount(st.repostCount);
        lbRepost.btn.classList.toggle('bgt-on', !!st.repostUri);
        lbRepost.btn.title = !canWrite ? 'Repost (opens post)' : (st.repostUri ? 'Undo repost' : 'Repost');

        const liked = !!st.likeUri;
        lbLike.count.textContent = fmtCount(st.likeCount);
        lbLike.btn.classList.toggle('bgt-on', liked);
        lbLike.path.setAttribute('d', liked ? ICON_HEART_FILLED : ICON_HEART);
        lbLike.btn.title = !canWrite ? 'Like (opens post)' : (liked ? 'Unlike' : 'Like');

        lbBookmark.btn.classList.toggle('bgt-on', !!st.bookmarked);
        lbBookmark.path.setAttribute('d', st.bookmarked ? ICON_BOOKMARK_FILLED : ICON_BOOKMARK);
        lbBookmark.btn.title = !canWrite ? 'Save (opens post)' : (st.bookmarked ? 'Remove bookmark' : 'Save');
    }

    function buildLightbox() {
        lbImg = el('img', { class: 'bgt-lbimg', alt: '' });
        lbCap = el('div', { class: 'bgt-lb-cap' });
        lbLink = el('a', { class: 'bgt-lb-post', target: '_blank', rel: 'noopener' }, 'Open post ↗');

        // Native-style action bar. Each handler reads the post currently shown, so
        // the single reused bar always acts on the right post as you navigate.
        lbReply = lbActButton('reply', ICON_REPLY, true, () => { const st = curPostState(); if (st) unsafeWindow.open(st.url, '_blank', 'noopener'); });
        lbRepost = lbActButton('repost', ICON_REPOST, true, () => toggleRepost(curPostState()));
        lbLike = lbActButton('like', ICON_HEART, true, () => toggleLike(curPostState()));
        lbBookmark = lbActButton('bookmark', ICON_BOOKMARK, false, () => toggleBookmark(curPostState()));
        lbActionsRow = el('div', { class: 'bgt-lb-actions' },
            lbReply.btn, lbRepost.btn, lbLike.btn, lbBookmark.btn, lbLink);

        const bar = el('div', { class: 'bgt-lb-bar' }, lbActionsRow, lbCap);

        lbPrev = el('button', { class: 'bgt-iconbtn bgt-lb-nav bgt-lb-prev', title: 'Previous', onClick: (e) => { e.stopPropagation(); navLightbox(-1); } }, '‹');
        lbNext = el('button', { class: 'bgt-iconbtn bgt-lb-nav bgt-lb-next', title: 'Next', onClick: (e) => { e.stopPropagation(); navLightbox(1); } }, '›');
        const close = el('button', { class: 'bgt-iconbtn bgt-lb-close', title: 'Close (Esc)', onClick: closeLightbox }, '✕');

        lbEl = el('div', { id: LIGHTBOX_ID, onClick: (e) => { if (e.target === lbEl) closeLightbox(); } },
            close, lbPrev, el('div', { class: 'bgt-lb-stage' }, lbImg), lbNext, bar);
        document.body.appendChild(lbEl);

        // stopImmediatePropagation + window-capture so we win over Bluesky's own
        // arrow-key shortcuts (which listen on document and would otherwise eat them).
        lbKeyHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeLightbox(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(1); }
        };
    }

    function showLightbox() {
        const it = grid.images[lbIndex];
        if (!it) return;
        lbImg.src = it.full;
        lbImg.alt = it.alt || '';
        lbCap.textContent = it.alt || '';
        lbLink.href = it.url;
        lbPrev.style.visibility = lbIndex > 0 ? 'visible' : 'hidden';
        lbNext.style.visibility = lbIndex < grid.images.length - 1 ? 'visible' : 'hidden';
        updateActionBar();
    }

    function openLightbox(i) {
        if (!lbEl) buildLightbox();
        lbIndex = i;
        showLightbox();
        lbEl.style.display = 'flex';
        unsafeWindow.addEventListener('keydown', lbKeyHandler, true);
    }

    function navLightbox(d) {
        const n = lbIndex + d;
        if (n < 0 || n >= grid.images.length) return;
        lbIndex = n;
        showLightbox();
        if (n >= grid.images.length - 4) maybeLoadMore(); // keep nav going near the end
    }

    function closeLightbox() {
        if (!lbEl) return;
        lbEl.style.display = 'none';
        lbImg.src = '';
        unsafeWindow.removeEventListener('keydown', lbKeyHandler, true);
    }

    /* ======================================================================
     * 6. Open / close / route sync.
     * ==================================================================== */
    function currentProfileActor() {
        const m = location.pathname.match(/^\/profile\/([^/]+)(?:\/(media|replies|likes|with_replies))?\/?$/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    let pendingHeader = null, waitingActor = null, mountObserver = null, mountTimer = null;

    // The profile feed has to be painted before we can find the in-line anchor.
    // Treat it as ready once the feed host actually holds content (images, or the
    // feed-item testid) rather than an empty skeleton.
    function inlineReady() {
        const host = findInlineHost();
        return !!(host && (host.querySelector('img') || host.querySelector('[data-testid^="feedItem-by-"]')));
    }

    function openGallery(actor) {
        if (rootEl && rootEl.isConnected && grid.actor === actor) return; // already showing this profile
        if (!rootEl && waitingActor === actor) return;                    // already waiting to mount it
        removeOverlay();

        grid.actor = actor;
        grid.cursor = undefined;
        grid.done = false;
        grid.loading = false;
        grid.images = [];
        grid.seen = new Set();

        gridEl = el('div', { class: 'bgt-grid' });
        sentinelEl = el('div', { class: 'bgt-sentinel' }, el('div', { class: 'bgt-spinner' }));
        pendingHeader = buildHeader(actor);

        if (settings.mode === 'inline') {
            // On a fresh load the feed isn't painted yet, so defer until it is.
            if (inlineReady() && mountInline(pendingHeader)) finishMount();
            else waitForInlineHost(actor);
        } else {
            mountFullscreen(pendingHeader);
            finishMount();
        }
    }

    function finishMount() {
        io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) loadMore();
        }, { root: scrollEl || null, rootMargin: '800px' });
        io.observe(sentinelEl);

        overlayKeyHandler = (e) => {
            if (e.key === 'Escape' && (!lbEl || lbEl.style.display === 'none')) closeGallery();
        };
        document.addEventListener('keydown', overlayKeyHandler);

        loadMore();
    }

    function waitForInlineHost(actor) {
        waitingActor = actor;

        // "Sit and watch" for the media feed to appear (e.g. when you switch to the
        // Media tab). Deliberately NO full-screen fallback and NO constant polling:
        // the observer only does work when the DOM actually changes, and the check is
        // debounced so a burst of mutations collapses into one. That keeps it cheap
        // even with many tabs parked on profiles, and it never surprises you with the
        // full-page grid just because the in-line anchor isn't on screen yet.
        const check = () => {
            mountTimer = null;
            if (waitingActor !== actor || rootEl) { stopWaiting(); return; }
            if (inlineReady() && mountInline(pendingHeader)) {
                stopWaiting();
                finishMount();
            }
            // otherwise: keep waiting until the media feed shows up
        };
        const schedule = () => {
            if (mountTimer) return;                 // a check is already queued
            mountTimer = setTimeout(check, 250);    // coalesce bursts of mutations
        };

        mountObserver = new MutationObserver(schedule);
        mountObserver.observe(document.body, { childList: true, subtree: true });
        check(); // try once right away
    }

    function stopWaiting() {
        waitingActor = null;
        if (mountObserver) { mountObserver.disconnect(); mountObserver = null; }
        if (mountTimer) { clearTimeout(mountTimer); mountTimer = null; }
    }

    function removeOverlay() {
        stopWaiting();
        pendingHeader = null;
        closeLightbox();
        if (lbEl) { lbEl.remove(); lbEl = null; }
        if (io) { io.disconnect(); io = null; }
        if (overlayKeyHandler) { document.removeEventListener('keydown', overlayKeyHandler); overlayKeyHandler = null; }
        if (rootEl) { rootEl.remove(); rootEl = null; }
        if (inlineHost) { inlineHost.classList.remove('bgt-feed-hidden'); inlineHost = null; }
        mountedMode = null;
        grid.actor = null;
        scrollEl = gridEl = sentinelEl = countEl = null;
    }

    function remountGallery() {
        const actor = grid.actor || currentProfileActor();
        removeOverlay();
        if (galleryEnabled && actor) openGallery(actor);
    }

    function closeGallery() {
        galleryEnabled = false;
        GM_setValue(STORAGE_KEY, false);
        removeOverlay();
        updateButtonState();
    }

    function syncGallery() {
        const actor = currentProfileActor();
        if (galleryEnabled && actor) openGallery(actor);
        else removeOverlay();
        updateButtonState();
    }

    /* ======================================================================
     * 7. Settings modal.
     * ==================================================================== */
    let settingsKeyHandler;

    function modeRow(value, label, desc) {
        const input = el('input', {
            type: 'radio', name: 'bgt-mode', value: value, checked: settings.mode === value,
            onChange: () => setMode(value),
        });
        return el('label', { class: 'bgt-radio' }, input,
            el('div', {}, el('div', { class: 'bgt-radio-label' }, label), el('div', { class: 'bgt-radio-desc' }, desc)));
    }

    function setMode(m) {
        if (settings.mode === m) return;
        settings.mode = m;
        GM_setValue(MODE_KEY, m);
        if (galleryEnabled && currentProfileActor()) remountGallery();
    }

    function sizeChip(value, label) {
        const input = el('input', {
            type: 'radio', name: 'bgt-size', value: value, checked: settings.size === value,
            onChange: () => setSize(value),
        });
        return el('label', { class: 'bgt-size-chip' }, input, label);
    }

    function setSize(s) {
        if (settings.size === s) return;
        settings.size = s;
        GM_setValue(SIZE_KEY, s);
        applySize(); // live: just swaps CSS vars, no rebuild needed
    }

    function applySize() {
        const s = SIZES[settings.size] || SIZES.medium;
        const root = document.documentElement;
        root.style.setProperty('--bgt-tile-inline', s.inline);
        root.style.setProperty('--bgt-tile-full', s.full);
    }

    function openSettings() {
        if (document.getElementById(SETTINGS_ID)) return;
        const card = el('div', { class: 'bgt-settings-card' },
            el('h2', {}, 'Gallery settings'),
            el('div', { class: 'bgt-settings-sub' }, 'How should the media grid appear?'),
            modeRow('fullscreen', 'Full screen', 'Takes over the whole window (default). Most reliable.'),
            modeRow('inline', 'In-line', 'Embeds the grid in the profile page, keeping the sidebar and header. Depends on Bluesky’s layout, so it may fall back to full screen.'),
            el('div', { class: 'bgt-settings-label' }, 'Tile size'),
            el('div', { class: 'bgt-size-group' },
                sizeChip('small', 'Small'),
                sizeChip('medium', 'Medium'),
                sizeChip('large', 'Large')),
            el('div', { class: 'bgt-settings-hint' }, 'In-line columns: 5 · 4 · 3'),
            el('div', { class: 'bgt-settings-foot' }, el('button', { onClick: closeSettings }, 'Done'))
        );
        const backdrop = el('div', {
            id: SETTINGS_ID, onClick: (e) => { if (e.target === backdrop) closeSettings(); },
        }, card);
        document.body.appendChild(backdrop);
        settingsKeyHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSettings(); } };
        document.addEventListener('keydown', settingsKeyHandler, true);
    }

    function closeSettings() {
        const m = document.getElementById(SETTINGS_ID);
        if (m) m.remove();
        if (settingsKeyHandler) { document.removeEventListener('keydown', settingsKeyHandler, true); settingsKeyHandler = null; }
    }

    /* ======================================================================
     * 8. Nav toggle button (kept where it was, after Settings) + gear.
     * ==================================================================== */
    function navTextColor() {
        const nav = document.querySelector('nav[role="navigation"]');
        const ref = nav && Array.from(nav.querySelectorAll('a')).find(a => a.getAttribute('aria-label') === 'Settings');
        return ref ? getComputedStyle(ref).color : 'rgb(241, 243, 245)';
    }

    function updateButtonState() {
        const btn = document.getElementById(BTN_ID);
        if (!btn) return;
        btn.classList.toggle('bgt-active', galleryEnabled);
        // Match the nav's own text colour so the icon is visible in light AND dark.
        btn.style.color = galleryEnabled ? ACCENT : navTextColor();
    }

    function createButton() {
        const nav = document.querySelector('nav[role="navigation"]');
        if (!nav) return;
        const settingsLink = Array.from(nav.querySelectorAll('a')).find(a => a.getAttribute('aria-label') === 'Settings');
        if (!settingsLink) return;

        const icon = el('div', { class: 'bgt-btn-icon' }, svgIcon(ICON_GRID, 28, 28));
        const text = el('div', { class: 'bgt-btn-text' }, 'Gallery');
        const gear = el('span', {
            class: 'bgt-gear', role: 'button', title: 'Gallery settings',
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); openSettings(); },
        }, svgIcon(ICON_GEAR, 18, 18));

        const btn = el('a', {
            id: BTN_ID,
            class: 'css-175oi2r r-1loqt21 r-1otgn73',
            role: 'button',
            onClick: () => {
                galleryEnabled = !galleryEnabled;
                GM_setValue(STORAGE_KEY, galleryEnabled);
                syncGallery();
            },
        }, icon, text, gear);

        // Layout (flex row, etc.) is pinned with !important in injectStyles(), because
        // Bluesky's base class forces flex-direction:column and the children would
        // otherwise stack icon-over-text-over-gear.
        settingsLink.parentNode.insertBefore(btn, settingsLink.nextSibling);
        updateButtonState();
    }

    function ensureButton() {
        if (!document.getElementById(BTN_ID)) createButton();
    }

    /* ======================================================================
     * 9. Styles.
     * ==================================================================== */
    function injectStyles() {
        if (document.getElementById('bgt-styles')) return;
        const css = `
        #${BTN_ID} {
            display: flex !important; flex-direction: row !important; align-items: center !important;
            gap: 8px; padding: 12px; border-radius: 8px; cursor: pointer; text-decoration: none;
            color: inherit; transition: background-color 100ms cubic-bezier(0.17,0.73,0.14,1);
        }
        #${BTN_ID}:hover { background: rgba(127,127,127,0.16); }
        #${BTN_ID} .bgt-btn-icon { display:flex; align-items:center; justify-content:center; width:24px; height:24px; z-index:10; }
        #${BTN_ID} .bgt-btn-text {
            font-size: 18.75px; line-height: 18.75px; color: inherit; font-weight: 400;
            font-family: InterVariable, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica;
        }
        #${BTN_ID}.bgt-active { background: rgba(0,133,255,0.16); }
        #${BTN_ID}.bgt-active .bgt-btn-text { font-weight: 600; }
        #${BTN_ID} .bgt-gear { display:inline-flex; align-items:center; margin-left:6px; opacity:0.65; cursor:pointer; }
        #${BTN_ID} .bgt-gear:hover { opacity:1; }

        #${OVERLAY_ID} {
            position: fixed; inset: 0; z-index: 99990; background: #0b0f14;
            display: flex; flex-direction: column;
            font-family: InterVariable, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
        }
        #${OVERLAY_ID} * { box-sizing: border-box; }
        #${OVERLAY_ID} .bgt-header {
            display: flex; align-items: center; gap: 12px; padding: 9px 14px;
            border-bottom: 1px solid #1f2a36; color: #f1f3f5; flex: 0 0 auto;
        }
        #${OVERLAY_ID} .bgt-title { font-size: 18px; font-weight: 600; line-height: 1.2; color: #f1f3f5; }
        #${OVERLAY_ID} .bgt-subrow { display: flex; gap: 6px; }
        #${OVERLAY_ID} .bgt-sub { font-size: 13px; color: #8b98a5; }
        #${OVERLAY_ID} .bgt-spacer { flex: 1; }
        .bgt-iconbtn {
            display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;
            border-radius: 18px; background: transparent; color: #f1f3f5; border: none;
            cursor: pointer; font-size: 20px; line-height: 1; text-decoration: none;
        }
        .bgt-iconbtn:hover { background: rgba(127,127,127,0.18); }

        #${OVERLAY_ID} .bgt-scroll { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; }
        #${OVERLAY_ID} .bgt-inner { max-width: 1200px; margin: 0 auto; padding: 8px; }
        #${OVERLAY_ID} .bgt-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--bgt-tile-full, 150px), 1fr)); gap: 3px;
        }
        #${OVERLAY_ID} .bgt-tile {
            position: relative; display: block; aspect-ratio: 1 / 1; overflow: hidden; background: #11171f;
            border: none; padding: 0; cursor: pointer; border-radius: 2px;
            text-decoration: none; color: inherit;
        }
        #${OVERLAY_ID} .bgt-tile img {
            width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .15s ease;
        }
        #${OVERLAY_ID} .bgt-tile:hover img { transform: scale(1.04); }
        #${OVERLAY_ID} .bgt-badge {
            position: absolute; left: 6px; bottom: 6px; display: flex; align-items: center; gap: 4px;
            padding: 2px 7px; border-radius: 6px; background: rgba(0,0,0,0.72); color: #fff;
            font-size: 12px; font-weight: 600; pointer-events: none;
        }
        #${OVERLAY_ID} .bgt-sentinel {
            grid-column: 1 / -1; display: flex; align-items: center; justify-content: center;
            padding: 24px; min-height: 44px; color: #8b98a5; font-size: 14px;
        }
        .bgt-spinner {
            width: 22px; height: 22px; border: 3px solid #2a3540; border-top-color: #0085ff;
            border-radius: 50%; animation: bgtspin .8s linear infinite;
        }
        @keyframes bgtspin { to { transform: rotate(360deg); } }

        /* ---- in-line mode: flow in the page, inherit the page theme ---- */
        #${OVERLAY_ID}.bgt-inline {
            position: static; inset: auto; z-index: auto; display: block; width: 100%;
            min-height: 60vh; background: transparent; color: inherit;
        }
        #${OVERLAY_ID}.bgt-inline .bgt-header { background: transparent; color: inherit; border-bottom: 1px solid rgba(127,127,127,0.25); }
        #${OVERLAY_ID}.bgt-inline .bgt-title, #${OVERLAY_ID}.bgt-inline .bgt-iconbtn { color: inherit; }
        #${OVERLAY_ID}.bgt-inline .bgt-inner-inline { max-width: none; margin: 0; padding: 6px; }
        #${OVERLAY_ID}.bgt-inline .bgt-grid { grid-template-columns: repeat(auto-fill, minmax(var(--bgt-tile-inline, 120px), 1fr)); }
        .bgt-feed-hidden { display: none !important; }

        /* ---- lightbox ---- */
        #${LIGHTBOX_ID} {
            position: fixed; inset: 0; z-index: 99999; background: rgba(0,0,0,0.93);
            display: none; align-items: center; justify-content: center;
        }
        #${LIGHTBOX_ID} .bgt-lb-stage { display: flex; align-items: center; justify-content: center; }
        #${LIGHTBOX_ID} .bgt-lbimg { max-width: 94vw; max-height: 90vh; object-fit: contain; border-radius: 4px; }
        #${LIGHTBOX_ID} .bgt-lb-close { position: absolute; top: 16px; right: 20px; }
        #${LIGHTBOX_ID} .bgt-lb-nav {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 50px; height: 50px; font-size: 34px; background: rgba(0,0,0,0.4);
        }
        #${LIGHTBOX_ID} .bgt-lb-prev { left: 14px; }
        #${LIGHTBOX_ID} .bgt-lb-next { right: 14px; }
        #${LIGHTBOX_ID} .bgt-lb-bar {
            position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 18px 12px;
            display: flex; flex-direction: column; gap: 8px; color: #e6e9ec; font-size: 14px;
            background: linear-gradient(transparent, rgba(0,0,0,0.82));
        }
        #${LIGHTBOX_ID} .bgt-lb-actions { display: flex; align-items: center; justify-content: center; gap: 6px; }
        #${LIGHTBOX_ID} .bgt-lb-cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        #${LIGHTBOX_ID} .bgt-lb-post { color: #4aa8ff; text-decoration: none; white-space: nowrap; }
        .bgt-act {
            display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px;
            border: none; background: transparent; color: #aeb9c4; cursor: pointer; border-radius: 999px;
            font-size: 14px; font-weight: 600; line-height: 1;
            font-family: InterVariable, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
            transition: background-color 100ms ease, color 100ms ease;
        }
        .bgt-act:hover { background: rgba(127,127,127,0.22); }
        .bgt-act svg { display: block; }
        .bgt-act-count:empty { display: none; }
        .bgt-act-like.bgt-on { color: #EC4899; }
        .bgt-act-repost.bgt-on { color: #09B35E; }
        .bgt-act-bookmark.bgt-on { color: ${ACCENT}; }

        /* ---- settings modal ---- */
        #${SETTINGS_ID} {
            position: fixed; inset: 0; z-index: 100002; background: rgba(0,0,0,0.55);
            display: flex; align-items: center; justify-content: center;
            font-family: InterVariable, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
        }
        #${SETTINGS_ID} .bgt-settings-card {
            width: 400px; max-width: 92vw; background: #1b2530; color: #f1f3f5;
            border: 1px solid #2a3743; border-radius: 14px; padding: 18px 20px;
            box-shadow: 0 14px 50px rgba(0,0,0,0.55);
        }
        #${SETTINGS_ID} h2 { margin: 0 0 4px; font-size: 18px; }
        #${SETTINGS_ID} .bgt-settings-sub { color: #8b98a5; font-size: 13px; margin-bottom: 14px; }
        #${SETTINGS_ID} .bgt-radio {
            display: flex; gap: 10px; align-items: flex-start; padding: 11px 12px;
            border: 1px solid #2a3743; border-radius: 10px; margin-bottom: 9px; cursor: pointer;
        }
        #${SETTINGS_ID} .bgt-radio:hover { background: rgba(255,255,255,0.04); }
        #${SETTINGS_ID} .bgt-radio input { margin-top: 3px; accent-color: #0085ff; }
        #${SETTINGS_ID} .bgt-radio-label { font-size: 15px; font-weight: 600; }
        #${SETTINGS_ID} .bgt-radio-desc { font-size: 12.5px; color: #8b98a5; margin-top: 2px; }
        #${SETTINGS_ID} .bgt-settings-label { font-size: 13px; color: #8b98a5; margin: 12px 0 8px; }
        #${SETTINGS_ID} .bgt-size-group { display: flex; gap: 8px; }
        #${SETTINGS_ID} .bgt-size-chip {
            flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
            padding: 9px 6px; border: 1px solid #2a3743; border-radius: 10px; cursor: pointer;
            font-size: 14px; font-weight: 600;
        }
        #${SETTINGS_ID} .bgt-size-chip:hover { background: rgba(255,255,255,0.04); }
        #${SETTINGS_ID} .bgt-size-chip input { accent-color: #0085ff; }
        #${SETTINGS_ID} .bgt-settings-hint { font-size: 12px; color: #8b98a5; margin: 8px 2px 2px; }
        #${SETTINGS_ID} .bgt-settings-foot { display: flex; justify-content: flex-end; margin-top: 12px; }
        #${SETTINGS_ID} .bgt-settings-foot button {
            background: #0085ff; color: #fff; border: none; border-radius: 8px;
            padding: 8px 18px; font-size: 14px; font-weight: 600; cursor: pointer;
        }
        #${SETTINGS_ID} .bgt-settings-foot button:hover { background: #0a78dd; }
        `;
        const style = el('style', { id: 'bgt-styles' });
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ======================================================================
     * 10. SPA route + DOM observers, init.
     * ==================================================================== */
    function hookHistory() {
        ['pushState', 'replaceState'].forEach(m => {
            const orig = unsafeWindow.history[m];
            unsafeWindow.history[m] = function () {
                const r = orig.apply(this, arguments);
                Promise.resolve().then(onRouteChange);
                return r;
            };
        });
        unsafeWindow.addEventListener('popstate', onRouteChange);
    }

    let lastHref = location.href;
    function onRouteChange() {
        ensureButton();
        syncGallery();
    }

    function startDom() {
        injectStyles();
        applySize();
        ensureButton();
        hookHistory();

        // Re-add the button if Bluesky re-renders the nav.
        new MutationObserver(() => {
            if (!document.getElementById(BTN_ID)) ensureButton();
        }).observe(document.body, { childList: true, subtree: true });

        // Recolour the nav icon when the user switches light/dark/dim theme.
        new MutationObserver(updateButtonState)
            .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        // Safety-net route watcher (covers any navigation the history hook misses).
        setInterval(() => {
            if (location.href !== lastHref) { lastHref = location.href; onRouteChange(); }
        }, 500);

        syncGallery();
    }

    try {
        installFetchHook();
    } catch (e) {
        console.error('[Gallery Toggle] fetch hook failed:', e);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startDom);
    } else {
        startDom();
    }
})();
