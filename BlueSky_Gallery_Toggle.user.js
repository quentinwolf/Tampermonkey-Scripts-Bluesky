// ==UserScript==
// @name         Bluesky Gallery Toggle
// @description  Replaces a profile's Media view with an x.com-style media grid (images + video), fed live by the AT Protocol API with infinite scroll. Full-screen or in-line.
// @author       @quentinwolf.ca
// @match        *://bsky.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @namespace    quentinwolf
// @version      2.8.1
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @require      https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js    // for in-lightbox video playback (including .m3u8 from the API and Tenor/Giphy GIFs that come in as external embeds)
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
    const DEBUG_KEY = 'bsky-gallery-debug';          // boolean: console logging
    const POSTINFO_KEY = 'bsky-gallery-postinfo';    // boolean: post text in lightbox
    const ALT_KEY = 'bsky-gallery-alt';              // boolean: image alt text in lightbox
    const CONTINUOUS_KEY = 'bsky-gallery-continuous';// boolean: lightbox arrows cross posts
    const WHEEL_KEY = 'bsky-gallery-wheel';          // boolean: master switch for wheel features
    const WHEELACTION_KEY = 'bsky-gallery-wheelact'; // 'navigate' | 'zoom' | 'none' over the image
    const WHEELREV_KEY = 'bsky-gallery-wheelrev';    // boolean: invert wheel direction
    const BITRATE_KEY = 'bsky-gallery-bitrate';      // number: video start-quality guess, Mbps (1-25)
    const PAGE_LIMIT = 100;                          // max getAuthorFeed page size
    const PUBLIC_API = 'https://public.api.bsky.app'; // unauthenticated fallback
    const ACCENT = '#4aa8ff';
    const LB_PREFETCH_AHEAD = 5;                     // lightbox: warm this many upcoming full-size images
    const LB_PREFETCH_CACHE = 12;                    // lightbox: cap on retained prefetched images (memory bound)

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
    const ICON_PLUS = 'M11 5a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z';

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
        debug: GM_getValue(DEBUG_KEY, false),
        postInfo: GM_getValue(POSTINFO_KEY, false),
        altText: GM_getValue(ALT_KEY, false),
        continuousNav: GM_getValue(CONTINUOUS_KEY, true),
        wheel: GM_getValue(WHEEL_KEY, false),
        wheelAction: GM_getValue(WHEELACTION_KEY, 'navigate'),
        wheelReverse: GM_getValue(WHEELREV_KEY, false),
        bitrate: GM_getValue(BITRATE_KEY, 5),
    };

    // Gated console logging - toggle via the settings modal (Debug logging).
    function logDebug(...args) {
        if (settings.debug) console.log('[Gallery Toggle]', ...args);
    }

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
    async function fetchMediaPage(actor, cursor, filter) {
        const buildPath = (f) => {
            const params = new URLSearchParams({ actor: actor, filter: f, limit: String(PAGE_LIMIT) });
            if (cursor) params.set('cursor', cursor);
            return '/xrpc/app.bsky.feed.getAuthorFeed?' + params.toString();
        };

        const fetchPath = async (path) => {
            // Preferred: replay the app's authenticated request.
            if (auth.origin && auth.headers) {
                try {
                    const res = await nativeFetch(auth.origin + path, { headers: auth.headers, credentials: 'omit' });
                    if (res.ok) return res.json();
                } catch (e) { /* fall through to public */ }
            }
            // Fallback: public AppView, no auth (default moderation applies).
            const res = await nativeFetch(PUBLIC_API + path, { headers: { 'accept-language': navigator.language || 'en' } });
            if (!res.ok) throw new Error('getAuthorFeed ' + res.status);
            return res.json();
        };

        try {
            return await fetchPath(buildPath(filter));
        } catch (e) {
            // Older AppViews may not know the posts_with_video filter; widen to all media
            // (the caller still filters to videos client-side).
            if (filter === 'posts_with_video') {
                logDebug('filter "posts_with_video" failed (' + (e && e.message) + '); retrying posts_with_media');
                return fetchPath(buildPath('posts_with_media'));
            }
            throw e;
        }
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
            text: (post.record && typeof post.record.text === 'string') ? post.record.text : '',
            // Authored time, straight off the feed payload (no extra API call). Falls
            // back to the AppView's indexedAt if a record somehow lacks createdAt.
            createdAt: (post.record && post.record.createdAt) || post.indexedAt || '',
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
            // playlist is the HLS .m3u8 the lightbox plays via hls.js; aspectRatio
            // lets us size the <video> before metadata loads. Both ride in the feed
            // payload we already fetched - no extra API call.
            tiles.push({
                kind: 'video',
                label: 'Video',
                thumb: embed.thumbnail,
                playlist: embed.playlist || '',
                aspectRatio: embed.aspectRatio || null,
                alt: embed.alt || '',
                url: postUrl(post),
                postState: postStateFrom(post),
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
        actor: null, videosOnly: false, cursor: undefined, loading: false, done: false,
        items: [], seen: null, // lightbox-viewable items (images + native videos), in grid order
    };
    let rootEl, scrollEl, gridEl, sentinelEl, countEl, io, overlayKeyHandler;
    let mountedMode = null, inlineHost = null, inlineResizeHandler = null;
    let headerTitleEl = null, followBtn = null, inlineScrollHandler = null, followVisTick = false;
    // Viewed profile's identity + follow state, populated by loadProfile() from
    // app.bsky.actor.getProfile. followUri is the viewer's follow-record URI (the
    // handle for unfollow) or null; isMe suppresses the button on your own profile.
    const profile = { actor: null, did: null, handle: null, displayName: '', followUri: null, isMe: false, _busyFollow: false };

    function buildHeader(actor) {
        const title = el('div', { class: 'bgt-title' }, actor.startsWith('did:') ? actor : '@' + actor);
        headerTitleEl = title; // loadProfile() swaps a raw did for the resolved @handle
        const sub = el('div', { class: 'bgt-sub' }, grid.videosOnly ? 'Video gallery' : 'Media gallery');
        countEl = el('div', { class: 'bgt-sub bgt-count' }, '');

        const closeBtn = el('button', { class: 'bgt-iconbtn', title: 'Close gallery (Esc)', onClick: closeGallery }, '✕');
        const gearBtn = el('button', { class: 'bgt-iconbtn', title: 'Gallery settings', onClick: openSettings }, svgIcon(ICON_GEAR, 20, 20));
        const openProfile = el('a', {
            class: 'bgt-iconbtn', title: 'Open profile in new tab', target: '_blank', rel: 'noopener',
            href: 'https://bsky.app/profile/' + actor,
        }, svgIcon(ICON_EXT, 20, 20));

        // Follow / Following toggle. Hidden until loadProfile() confirms a writable
        // session, a resolved DID, and that this isn't your own profile; in in-line
        // mode it also stays hidden until the bar pins to the top, so it never doubles
        // up with the profile's own follow button while the bio is still on screen.
        const followPlus = svgIcon(ICON_PLUS, 15, 15);
        followPlus.classList.add('bgt-fl-plus');
        followBtn = el('button', {
            class: 'bgt-followbtn', type: 'button', style: { display: 'none' },
            onClick: (e) => { e.preventDefault(); e.stopPropagation(); toggleFollow(); },
        }, followPlus,
            el('span', { class: 'bgt-fl-follow' }, 'Follow'),
            el('span', { class: 'bgt-fl-following' }, 'Following'),
            el('span', { class: 'bgt-fl-unfollow' }, 'Unfollow'));

        return el('div', { class: 'bgt-header' },
            closeBtn,
            el('div', { class: 'bgt-titlewrap' }, title, el('div', { class: 'bgt-subrow' }, sub, countEl)),
            el('div', { class: 'bgt-spacer' }),
            followBtn, gearBtn, openProfile
        );
    }

    function isOnScreen(elx) {
        const r = elx.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > 0 && r.left < (window.innerWidth || 99999);
    }

    // ---- find the in-line injection point: the *visible* feed list of the active
    //      pager panel. Profile tabs are a pager - each tab (Media/Videos/...) has its
    //      own feed container and inactive ones are hidden/translated off-screen, so a
    //      fixed structural selector lands on the wrong (hidden) tab. Pick the one
    //      that's actually on screen. ----
    function findInlineHost() {
        // 1) The visible feed-list of the active pager panel (Bluesky uses .r-sa2ff0).
        //    During a tab transition more than one can be partly on screen, so prefer
        //    the most-centred one (the incoming/active panel).
        const lists = Array.from(document.querySelectorAll('.r-sa2ff0')).filter(l =>
            isOnScreen(l) && l.querySelector('[data-testid^="feedItem-by-"], img[src*="cdn.bsky.app"]'));
        if (lists.length) {
            const cx = (window.innerWidth || 0) / 2;
            const dist = (l) => { const r = l.getBoundingClientRect(); return Math.abs((r.left + r.right) / 2 - cx); };
            lists.sort((a, b) => dist(a) - dist(b));
            return lists[0];
        }
        // 2) Walk up from a visible feed item to its .r-sa2ff0 list container.
        const items = document.querySelectorAll('[data-testid^="feedItem-by-"]');
        for (const it of items) {
            if (!isOnScreen(it)) continue;
            let node = it.parentElement;
            while (node && node !== document.body) {
                if (node.classList && node.classList.contains('r-sa2ff0')) return node;
                node = node.parentElement;
            }
        }
        // 3) Legacy structural fallback - only if it's actually on screen.
        const root = document.querySelector('.r-2llsf');
        if (root) {
            const tries = [
                ':scope > div:nth-child(6) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)',
                ':scope > div:nth-child(6)',
            ];
            for (const s of tries) {
                try { const h = root.querySelector(s); if (h && isOnScreen(h)) return h; } catch (_) { /* bad selector */ }
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

    // Height of Bluesky's pinned profile tab bar (Posts/Replies/Media/Videos), so the
    // in-line header can stick just beneath it instead of overlapping it.
    function stickyTabBarHeight() {
        const tablist = document.querySelector('[role="tablist"]');
        if (tablist) {
            const h = Math.round(tablist.getBoundingClientRect().height);
            if (h > 8 && h < 200) return h;
        }
        // Fallback: the sticky bar that sits directly above our grid in the profile column.
        const r = document.querySelector('.r-2llsf');
        if (r) {
            for (const child of r.children) {
                if (rootEl && child.contains(rootEl)) break; // reached our own row
                if (getComputedStyle(child).position === 'sticky') {
                    const h = Math.round(child.getBoundingClientRect().height);
                    if (h > 8 && h < 200) return h;
                }
            }
        }
        return 0;
    }

    // The page surface colour, so the sticky header is opaque (tiles scroll cleanly
    // under it) and matches light / dark / dim themes.
    function surfaceBg() {
        let p = rootEl ? rootEl.parentElement : null;
        while (p && p !== document.documentElement) {
            const bg = getComputedStyle(p).backgroundColor;
            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
            p = p.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor || '#161e27';
    }

    function applyInlineSticky() {
        if (mountedMode !== 'inline' || !rootEl) return;
        const header = rootEl.querySelector('.bgt-header');
        if (!header) return;
        header.style.position = 'sticky';
        header.style.top = stickyTabBarHeight() + 'px';
        header.style.zIndex = '5';
        header.style.backgroundColor = surfaceBg();
        logDebug('in-line sticky header: top=' + header.style.top + ' bg=' + header.style.backgroundColor);
    }

    function mountInline(header) {
        const host = findInlineHost();
        if (!host || !host.parentNode) return false;
        logDebug('mountInline host=' + (host.getAttribute('class') || host.tagName) + ' onScreen=' + isOnScreen(host));
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
        applyInlineSticky(); // pin our header beneath Bluesky's tab bar
        inlineResizeHandler = () => { applyInlineSticky(); scheduleFollowVis(); };
        window.addEventListener('resize', inlineResizeHandler);
        // Reveal the follow button as the bar nears the top. Capture phase (not bubbling)
        // so we still catch the scroll when Bluesky scrolls an inner overflow container -
        // those scroll events don't bubble to window, but they do fire during capture.
        inlineScrollHandler = () => scheduleFollowVis();
        window.addEventListener('scroll', inlineScrollHandler, { passive: true, capture: true });
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
                // Images and native videos have a lightbox slot; GIF/external open the post.
                if (t._lbIndex != null) openLightbox(t._lbIndex);
                else unsafeWindow.open(t.url, '_blank', 'noopener');
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
            // Images and native videos (those with an HLS playlist) are viewable in the
            // lightbox; GIF/external embeds have no playlist, so they stay click-to-post.
            if (t.kind === 'image' || (t.kind === 'video' && t.playlist)) {
                t._lbIndex = grid.items.length;
                grid.items.push({
                    kind: t.kind, full: t.full, thumb: t.thumb, alt: t.alt, url: t.url,
                    playlist: t.playlist, aspectRatio: t.aspectRatio, postState: t.postState,
                });
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
            const filter = grid.videosOnly ? 'posts_with_video' : 'posts_with_media';
            logDebug('loadMore filter=' + filter + ' cursor=' + (grid.cursor || '(first page)'));
            const data = await fetchMediaPage(grid.actor, grid.cursor, filter);
            grid.cursor = data.cursor;
            if (!data.cursor) grid.done = true;

            const tiles = [];
            (data.feed || []).forEach(item => {
                if (item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost') return; // skip reposts
                tilesFromPost(item.post).forEach(t => {
                    if (grid.videosOnly && t.kind !== 'video') return; // Videos tab: drop stills
                    tiles.push(t);
                });
            });
            appendTiles(tiles);
            logDebug('page: +' + tiles.length + ' tiles, total=' + grid.seen.size + ', done=' + grid.done);
            if (lbEl && lbEl.style.display !== 'none') prefetchNeighbors(); // warm the freshly-loaded page for the open lightbox

            const noun = grid.videosOnly ? 'videos' : 'media';
            if (grid.done) setSentinel('text', grid.seen.size ? 'End of ' + noun : 'No ' + noun + ' found');
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

    // Bluesky-style post stamp: "1:59 PM · May 21, 2026" (uses the viewer's locale).
    function fmtPostTime(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        return time + ' · ' + date;
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
     * 4c. Profile identity + follow toggle (header bar).
     *
     *     One getProfile call per gallery resolves the @handle (so a /profile/did:…
     *     URL shows a name, not the raw DID) and reads the viewer's follow state.
     *     Follows are repo records (app.bsky.graph.follow) on your PDS, just like
     *     likes/reposts - the subject is the target DID, and the returned record URI
     *     is what we delete to unfollow.
     * ==================================================================== */
    async function fetchProfile(actor) {
        const path = '/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(actor);
        // Authed first so viewer.following comes back; fall back to the public AppView
        // (handle/displayName only - no follow state without a session).
        if (auth.origin && auth.headers) {
            try {
                const res = await nativeFetch(auth.origin + path, { headers: auth.headers, credentials: 'omit' });
                if (res.ok) return res.json();
            } catch (e) { /* fall through to public */ }
        }
        try {
            const res = await nativeFetch(PUBLIC_API + path, { headers: { 'accept-language': navigator.language || 'en' } });
            if (res.ok) return res.json();
        } catch (e) { /* ignore */ }
        return null;
    }

    async function loadProfile(actor) {
        let data;
        try { data = await fetchProfile(actor); } catch (e) { data = null; }
        if (!data || grid.actor !== actor) return; // gallery closed or switched while we waited
        profile.did = data.did || null;
        profile.handle = data.handle || null;
        profile.displayName = data.displayName || '';
        profile.followUri = (data.viewer && data.viewer.following) || null;
        const me = getMyDid();
        profile.isMe = !!(me && profile.did && me === profile.did);
        logDebug('profile loaded handle=' + profile.handle + ' following=' + !!profile.followUri + ' isMe=' + profile.isMe);
        updateHeaderIdentity();
        updateFollowButton();
        updateFollowVisibility();
    }

    // Swap the raw DID shown in the title for the resolved @handle once we have it.
    function updateHeaderIdentity() {
        if (headerTitleEl && profile.handle) headerTitleEl.textContent = '@' + profile.handle;
    }

    // Paint the follow button's state. The label swap (+ Follow / Following / Unfollow)
    // and colours live in CSS, keyed off the bgt-following class; 'pending' counts as
    // following so the optimistic flip sticks while the write is in flight.
    function updateFollowButton() {
        if (!followBtn) return;
        const following = !!profile.followUri;
        followBtn.classList.toggle('bgt-following', following);
        followBtn.title = (following ? 'Unfollow @' : 'Follow @') + (profile.handle || '');
    }

    // True once the sticky bar has risen near the top of the viewport - i.e. it's pinned
    // just under Bluesky's profile tab bar, by which point the bio (with its own follow
    // button, only in the top ~200px of the page) has scrolled away. The bar mounts ~425px
    // down, so there's ample slack before the native button would overlap; a generous
    // margin over the measured tab-bar height (~50px) absorbs browser/OS scaling and any
    // case where stickyTabBarHeight() reads small.
    function headerNearTop() {
        if (!rootEl) return false;
        const header = rootEl.querySelector('.bgt-header');
        if (!header) return false;
        return header.getBoundingClientRect().top <= stickyTabBarHeight() + 120;
    }

    function updateFollowVisibility() {
        if (!followBtn) return;
        // Only meaningful with a writable session, a known DID, and not your own profile.
        const eligible = !!getMyDid() && !!profile.did && !profile.isMe;
        // Full screen hides the bio entirely, so the button is always welcome there;
        // in-line shows it only once the bar nears the top (else it would duplicate the
        // bio's own follow button while the bio is still on screen).
        const show = eligible && (mountedMode !== 'inline' || headerNearTop());
        followBtn.style.display = show ? '' : 'none';
    }

    // Scroll fires often; collapse a burst into one rAF-aligned visibility check.
    function scheduleFollowVis() {
        if (followVisTick) return;
        followVisTick = true;
        requestAnimationFrame(() => { followVisTick = false; updateFollowVisibility(); });
    }

    // Optimistic follow/unfollow, mirroring toggleLike/toggleRepost: flip the UI now,
    // fire the write, roll back on failure. Without a writable session we just open the
    // profile so the user can act natively. _busyFollow guards against double-taps.
    async function toggleFollow() {
        if (!profile || profile._busyFollow) return;
        const did = getMyDid();
        if (!did || !profile.did) { unsafeWindow.open('https://bsky.app/profile/' + (profile.handle || profile.did || ''), '_blank', 'noopener'); return; }
        profile._busyFollow = true;
        const was = !!profile.followUri, prev = profile.followUri;
        profile.followUri = was ? null : 'pending';
        updateFollowButton();
        try {
            if (was) {
                await repoDelete(did, 'app.bsky.graph.follow', rkeyOf(prev));
                profile.followUri = null;
            } else {
                const r = await repoCreate(did, 'app.bsky.graph.follow',
                    { '$type': 'app.bsky.graph.follow', subject: profile.did, createdAt: new Date().toISOString() });
                profile.followUri = (r && r.uri) || null;
                if (!profile.followUri) throw new Error('no uri returned');
            }
        } catch (e) {
            console.error('[Gallery Toggle] follow failed:', e);
            profile.followUri = prev;
        } finally {
            profile._busyFollow = false;
            updateFollowButton();
        }
    }

    /* ======================================================================
     * 5. Lightbox for images (videos/gifs open the post instead).
     * ==================================================================== */
    let lbEl, lbImg, lbVideo, lbHls, lbCap, lbLink, lbPrev, lbNext, lbIndex = 0, lbKeyHandler;
    let lbActionsRow, lbReply, lbRepost, lbLike, lbBookmark, lbPostText, lbTime, lbThumbs;
    let lbLoading, lbLoadingSpin, lbLoadingText; // "Loading media…" overlay while an image decodes
    let thumbsRange = null; // [lo,hi] of items currently rendered in the thumbnail strip
    let lbLastDir = 1;            // last lightbox nav direction (+1 next / -1 prev), to bias prefetch
    const lbPrefetch = new Map(); // url -> Image: bounded buffer of warmed upcoming full-size images

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
        const im = grid.items[lbIndex];
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

        if (lbTime) {
            const stamp = fmtPostTime(st.createdAt);
            lbTime.textContent = stamp;
            lbTime.title = stamp ? new Date(st.createdAt).toLocaleString() : '';
        }
    }

    function buildLightbox() {
        lbImg = el('img', { class: 'bgt-lbimg', alt: '' });
        // Native <video> + controls; hls.js feeds it the .m3u8 (see attachVideo). loop
        // matches Bluesky (lots of "videos" are really gifs, so a single play-through
        // breaks the immersion).
        lbVideo = el('video', { class: 'bgt-lbvideo', controls: true, loop: true, preload: 'none', style: { display: 'none' } });
        lbVideo.setAttribute('playsinline', '');
        // Once the real dimensions are known, drive the box's aspect-ratio off them so
        // the player fills the stage at the right shape no matter which rendition the
        // ABR ladder started on.
        lbVideo.addEventListener('loadedmetadata', () => {
            if (lbVideo.videoWidth && lbVideo.videoHeight)
                lbVideo.style.setProperty('--bgt-ar', lbVideo.videoWidth + ' / ' + lbVideo.videoHeight);
        });
        lbCap = el('div', { class: 'bgt-lb-cap' });
        lbPostText = el('div', { class: 'bgt-lb-text' });
        lbLink = el('a', { class: 'bgt-lb-post', target: '_blank', rel: 'noopener' }, 'Open post ↗');

        // Native-style action bar. Each handler reads the post currently shown, so
        // the single reused bar always acts on the right post as you navigate.
        lbReply = lbActButton('reply', ICON_REPLY, true, () => { const st = curPostState(); if (st) unsafeWindow.open(st.url, '_blank', 'noopener'); });
        lbRepost = lbActButton('repost', ICON_REPOST, true, () => toggleRepost(curPostState()));
        lbLike = lbActButton('like', ICON_HEART, true, () => toggleLike(curPostState()));
        lbBookmark = lbActButton('bookmark', ICON_BOOKMARK, false, () => toggleBookmark(curPostState()));
        // Muted post timestamp, sits just before the Open-post link.
        lbTime = el('span', { class: 'bgt-lb-time' });
        lbActionsRow = el('div', { class: 'bgt-lb-actions' },
            lbReply.btn, lbRepost.btn, lbLike.btn, lbBookmark.btn, lbTime, lbLink);

        // Action row is pinned LAST so it stays anchored to the bottom; post text and
        // alt caption stack ABOVE it. That way toggling the alt caption pushes the post
        // text up (over the image, where captions belong) instead of shoving the
        // buttons up into the image.
        const bar = el('div', { class: 'bgt-lb-bar' }, lbPostText, lbCap, lbActionsRow);

        lbPrev = el('button', { class: 'bgt-iconbtn bgt-lb-nav bgt-lb-prev', title: 'Previous', onClick: (e) => { e.stopPropagation(); navLightbox(-1); } }, '‹');
        lbNext = el('button', { class: 'bgt-iconbtn bgt-lb-nav bgt-lb-next', title: 'Next', onClick: (e) => { e.stopPropagation(); navLightbox(1); } }, '›');
        const close = el('button', { class: 'bgt-iconbtn bgt-lb-close', title: 'Close (Esc)', onClick: closeLightbox }, '✕');
        // Top strip of sibling-image thumbnails; only populated for multi-image posts.
        lbThumbs = el('div', { class: 'bgt-lb-thumbs' });
        thumbsRange = null; // fresh element, so force a rebuild on the first show

        // Centred "Loading media…" overlay, shown while a freshly-navigated image is
        // still decoding so the previous picture isn't left on screen in the meantime.
        lbLoadingSpin = el('div', { class: 'bgt-spinner' });
        lbLoadingText = el('div', { class: 'bgt-lb-loading-text' }, 'Loading media…');
        lbLoading = el('div', { class: 'bgt-lb-loading' }, lbLoadingSpin, lbLoadingText);

        lbEl = el('div', { id: LIGHTBOX_ID, onClick: (e) => { if (e.target === lbEl) closeLightbox(); } },
            close, lbThumbs, lbPrev, el('div', { class: 'bgt-lb-stage' }, lbImg, lbVideo, lbLoading), lbNext, bar);
        document.body.appendChild(lbEl);

        // Mouse-wheel (navigate / flip thumbnails / zoom) + cursor-follow pan. Both are
        // gated on the settings at event time, so they're inert until enabled. passive:
        // false lets us stop the page behind the lightbox from scrolling.
        lbEl.addEventListener('wheel', lbWheel, { passive: false });
        lbImg.addEventListener('mousemove', lbImgPan);

        // stopImmediatePropagation + window-capture so we win over Bluesky's own
        // arrow-key shortcuts (which listen on document and would otherwise eat them).
        lbKeyHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeLightbox(); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(-1); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); navLightbox(1); }
        };
    }

    // Loading overlay: spinner + "Loading media…" while a navigated-to image decodes.
    function showLbLoading() {
        if (!lbLoading) return;
        lbLoadingSpin.style.display = 'block';
        lbLoadingText.textContent = 'Loading media…';
        lbLoading.style.display = 'flex';
    }
    function hideLbLoading() {
        if (lbLoading) lbLoading.style.display = 'none';
    }
    function lbLoadError() {
        if (!lbLoading) return;
        lbLoadingSpin.style.display = 'none';
        lbLoadingText.textContent = 'Could not load media';
        lbLoading.style.display = 'flex';
    }

    function showLightbox() {
        const it = grid.items[lbIndex];
        if (!it) return;
        teardownVideo(); // stop/detach whatever was playing before we switch slots
        resetZoom();     // every item starts unzoomed
        const isVideo = it.kind === 'video';
        lbEl.classList.toggle('bgt-has-video', isVideo);
        if (isVideo) {
            hideLbLoading(); // video uses its own poster; no image-decode wait
            lbImg.style.display = 'none';
            lbImg.removeAttribute('src');
            lbVideo.style.display = 'block';
            lbVideo.poster = it.thumb || '';
            // Seed the box shape from the embed's aspectRatio so the poster sizes right
            // before metadata; the loadedmetadata handler then refines it from the real
            // video. (Default 16/9 via CSS until either is known.)
            if (it.aspectRatio && it.aspectRatio.width && it.aspectRatio.height)
                lbVideo.style.setProperty('--bgt-ar', it.aspectRatio.width + ' / ' + it.aspectRatio.height);
            else lbVideo.style.removeProperty('--bgt-ar');
            attachVideo(it);
        } else {
            lbVideo.style.display = 'none';
            lbImg.style.display = 'block';
            lbImg.alt = it.alt || '';
            lbImg.style.cursor = (settings.wheel && settings.wheelAction === 'zoom') ? 'zoom-in' : '';
            // Hide the just-shown image and show the loader until the new one decodes, so
            // fast wheel-navigation never lingers on the previous picture. onload reveals
            // it; a cached image is already complete, so we reveal instantly (no flash).
            lbImg.classList.remove('bgt-loaded');
            showLbLoading();
            lbImg.onload = () => { lbImg.classList.add('bgt-loaded'); hideLbLoading(); };
            lbImg.onerror = () => lbLoadError();
            lbImg.src = it.full;
            if (lbImg.complete && lbImg.naturalWidth > 0) { lbImg.classList.add('bgt-loaded'); hideLbLoading(); }
        }
        lbLink.href = it.url;
        updateNavButtons();
        updateActionBar();
        applyPostInfo();
        applyAltText();
        applyThumbs();
        // Pull the next page before nav (and the buffer) hit the end of what's loaded -
        // index-driven, so it works even when the grid behind is scrolled out of view
        // (unlike the viewport-gated maybeLoadMore). loadMore() no-ops if busy/done.
        if (settings.continuousNav && grid.items.length - lbIndex <= LB_PREFETCH_AHEAD + 2) loadMore();
        prefetchNeighbors(); // warm the next few full-size images so fast nav doesn't wait on each
    }

    // Items from one post share a postState object reference (set once per post in
    // tilesFromPost) and are contiguous in grid.items, so the current post's images are
    // the run around lbIndex that share it. Videos have their own postState -> group of 1.
    function postGroupRange(i) {
        const items = grid.items;
        const ps = items[i] && items[i].postState;
        let lo = i, hi = i;
        if (!ps) return [lo, hi];
        while (lo > 0 && items[lo - 1].postState === ps) lo--;
        while (hi < items.length - 1 && items[hi + 1].postState === ps) hi++;
        return [lo, hi];
    }

    // Arrow-key / chevron reach: the whole gallery when continuous nav is on, otherwise
    // just the current post's image group.
    function navBounds() {
        return settings.continuousNav ? [0, grid.items.length - 1] : postGroupRange(lbIndex);
    }

    function updateNavButtons() {
        const [lo, hi] = navBounds();
        lbPrev.style.visibility = lbIndex > lo ? 'visible' : 'hidden';
        lbNext.style.visibility = lbIndex < hi ? 'visible' : 'hidden';
    }

    // The thumbnail strip shows the current post's sibling images (2-4); for single
    // images and videos it stays hidden. Rebuilt only when the post group changes, so
    // arrowing within a post just moves the highlight (no thumbnail reflow/reload).
    function applyThumbs() {
        if (!lbThumbs) return;
        const [lo, hi] = postGroupRange(lbIndex);
        if (hi - lo < 1) { // single item: no strip
            while (lbThumbs.firstChild) lbThumbs.removeChild(lbThumbs.firstChild);
            lbThumbs.style.display = 'none';
            lbEl.classList.remove('bgt-has-thumbs');
            thumbsRange = null;
            return;
        }
        if (!thumbsRange || thumbsRange[0] !== lo || thumbsRange[1] !== hi) {
            while (lbThumbs.firstChild) lbThumbs.removeChild(lbThumbs.firstChild);
            for (let i = lo; i <= hi; i++) {
                const it = grid.items[i], idx = i;
                lbThumbs.appendChild(el('button', {
                    class: 'bgt-lb-thumb', type: 'button', 'data-idx': String(idx),
                    title: it.alt || ('Image ' + (idx - lo + 1)),
                    onClick: (e) => { e.stopPropagation(); if (idx !== lbIndex) { lbIndex = idx; showLightbox(); } },
                }, el('img', { src: it.thumb, alt: '', draggable: false })));
            }
            thumbsRange = [lo, hi];
        }
        for (const b of lbThumbs.children)
            b.classList.toggle('bgt-on', Number(b.getAttribute('data-idx')) === lbIndex);
        lbThumbs.style.display = 'flex';
        lbEl.classList.add('bgt-has-thumbs');
    }

    // hls.js arrives via @require; grab it wherever the userscript manager parked it.
    function getHls() {
        return (typeof Hls !== 'undefined' && Hls) || window.Hls || unsafeWindow.Hls || null;
    }

    // Tear down any active playback: destroy the hls.js instance and reset the element
    // so a stale stream never bleeds into the next item (or keeps decoding in the bg).
    function teardownVideo() {
        if (lbHls) { try { lbHls.destroy(); } catch (_) { /* ignore */ } lbHls = null; }
        if (lbVideo) {
            try { lbVideo.pause(); } catch (_) { /* ignore */ }
            lbVideo.removeAttribute('src');
            try { lbVideo.load(); } catch (_) { /* ignore */ }
        }
    }

    // Point the <video> at the post's HLS playlist. Safari plays .m3u8 natively;
    // everything else goes through hls.js. Autoplay is attempted (the click/keypress
    // that opened the item is a user gesture) and falls back to the visible controls.
    function attachVideo(it) {
        const url = it && it.playlist;
        if (!lbVideo || !url) return;
        const v = lbVideo;
        const tryPlay = () => { const p = v.play(); if (p && p.catch) p.catch(() => logDebug('video: autoplay blocked, awaiting user')); };

        if (v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = url;
            v.addEventListener('loadedmetadata', tryPlay, { once: true });
            logDebug('video: native HLS', url);
            return;
        }

        const HlsLib = getHls();
        if (HlsLib && HlsLib.isSupported()) {
            // abrEwmaDefaultEstimate biases the *first* rendition pick toward HD: the
            // ABR controller assumes this much bandwidth until it has measured the real
            // throughput, so playback starts at full resolution instead of climbing the
            // ladder from 240p (which short/looping clips often end before reaching).
            // Tunable via the settings panel (Mbps); 5 by default.
            const startEstimate = (settings.bitrate || 5) * 1e6;
            const hls = new HlsLib({ enableWorker: true, abrEwmaDefaultEstimate: startEstimate });
            logDebug('video: hls start estimate', settings.bitrate + ' Mbps');
            lbHls = hls;
            hls.on(HlsLib.Events.MANIFEST_PARSED, () => { logDebug('video: manifest parsed'); tryPlay(); });
            hls.on(HlsLib.Events.ERROR, (_evt, data) => {
                logDebug('video: hls error type=' + (data && data.type) + ' details=' + (data && data.details) + ' fatal=' + (data && data.fatal));
                if (!data || !data.fatal) return;
                if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR) hls.startLoad();
                else if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
                else teardownVideo();
            });
            hls.loadSource(url);
            hls.attachMedia(v);
            logDebug('video: hls.js attached', url);
            return;
        }

        // No HLS path in this browser: let the user watch it natively on the post.
        logDebug('video: no HLS support; opening post');
        unsafeWindow.open(it.url, '_blank', 'noopener');
    }

    function applyPostInfo() {
        if (!lbPostText) return;
        const st = curPostState();
        const text = (settings.postInfo && st && st.text) ? st.text : '';
        lbPostText.textContent = text;
        lbPostText.style.display = text ? 'block' : 'none';
    }

    function applyAltText() {
        if (!lbCap) return;
        const it = grid.items[lbIndex];
        const alt = (settings.altText && it && it.alt) ? it.alt : '';
        lbCap.textContent = alt;
        lbCap.style.display = alt ? 'block' : 'none';
    }

    /* ---- lightbox image prefetch -------------------------------------------------
     * Grid tiles only load thumbnails; the lightbox shows `full` (a different, larger
     * URL), so scrolling fast past the loaded region means each full image is a cold
     * fetch. Keep a small buffer of upcoming `full` images warm in the browser's HTTP
     * cache so showing them is near-instant. Bounded by LB_PREFETCH_CACHE for memory.
     * ----------------------------------------------------------------------------- */
    function warmImage(url) {
        if (!url) return;
        if (lbPrefetch.has(url)) {                    // LRU touch: move to the freshest slot
            const v = lbPrefetch.get(url);
            lbPrefetch.delete(url);
            lbPrefetch.set(url, v);
            return;
        }
        const img = new Image();
        img.decoding = 'async';
        img.src = url;                                // browser fetches into its HTTP cache; lbImg reuses it
        lbPrefetch.set(url, img);
        while (lbPrefetch.size > LB_PREFETCH_CACHE) { // evict oldest beyond the cap
            const oldest = lbPrefetch.keys().next().value;
            lbPrefetch.delete(oldest);
        }
    }

    // Only still images have a `full` worth warming; videos stream via HLS and their
    // poster is the thumb already loaded by the grid.
    function prefetchItem(it) {
        if (it && it.kind === 'image' && it.full) warmImage(it.full);
    }

    // Warm LB_PREFETCH_AHEAD images in the direction of travel (plus one behind, for a
    // quick reversal), clamped to the range the arrows can actually reach.
    function prefetchNeighbors() {
        if (!grid.items.length) return;
        const [lo, hi] = navBounds();
        const dir = lbLastDir < 0 ? -1 : 1;
        for (let k = 1; k <= LB_PREFETCH_AHEAD; k++) {
            const i = lbIndex + dir * k;
            if (i < lo || i > hi) break;
            prefetchItem(grid.items[i]);
        }
        const back = lbIndex - dir;
        if (back >= lo && back <= hi) prefetchItem(grid.items[back]);
    }

    function openLightbox(i) {
        if (!lbEl) buildLightbox();
        lbLastDir = 1; // fresh open: bias the buffer forward
        lbIndex = i;
        showLightbox();
        lbEl.style.display = 'flex';
        unsafeWindow.addEventListener('keydown', lbKeyHandler, true);
    }

    function navLightbox(d) {
        const [lo, hi] = navBounds();
        const n = lbIndex + d;
        if (n < lo || n > hi) return; // off the end of the gallery, or of the post group
        lbLastDir = d < 0 ? -1 : 1;   // bias the prefetch buffer toward the way we're moving
        lbIndex = n;
        showLightbox();               // showLightbox tops up the page + prefetch buffer near the end
    }

    // Step strictly within the current post's image group, regardless of the
    // continuous-nav setting (used by the thumbnail-strip wheel).
    function navWithinPost(d) {
        const [lo, hi] = postGroupRange(lbIndex);
        const n = lbIndex + d;
        if (n < lo || n > hi) return;
        lbLastDir = d < 0 ? -1 : 1;
        lbIndex = n;
        showLightbox();
    }

    /* ---- mouse-wheel: navigate / flip thumbnails / zoom (all opt-in) ---- */
    let lbZoom = 1, lbImgBox = null, wheelLastEvent = 0, wheelLastStep = 0, wheelDir = 0;

    function resetZoom() {
        if (!lbImg) return;
        lbZoom = 1;
        lbImgBox = null;
        lbImg.style.transform = '';
        lbImg.style.transformOrigin = '';
        lbImg.style.cursor = '';
    }

    // Cursor position as a % of the image's UNSCALED layout box, snapshotted in lbImgBox
    // at zoom-in. Reading getBoundingClientRect() live here would return the *scaled*
    // rect, which shifts with the very origin we're about to set - a feedback loop that
    // made small pans lag, overshoot, then catch up on the next move.
    function setZoomOrigin(e) {
        const r = lbImgBox;
        if (!r || !r.width || !r.height) return;
        const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
        const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
        lbImg.style.transformOrigin = x + '% ' + y + '%';
    }

    function zoomByWheel(e, dir) {
        const prev = lbZoom;
        lbZoom = Math.max(1, Math.min(5, lbZoom + (dir < 0 ? 0.5 : -0.5))); // wheel up = in
        if (lbZoom === prev) return;                              // already at min/max
        if (prev === 1) lbImgBox = lbImg.getBoundingClientRect(); // snapshot while still unscaled
        if (lbZoom === 1) { resetZoom(); lbImg.style.cursor = 'zoom-in'; return; }
        setZoomOrigin(e); // anchor the zoom at the cursor
        lbImg.style.transform = 'scale(' + lbZoom + ')';
        lbImg.style.cursor = 'zoom-out';
    }

    // While zoomed, follow the cursor so the user can pan without dragging.
    function lbImgPan(e) {
        if (lbZoom > 1) setZoomOrigin(e);
    }

    function lbWheel(e) {
        // Let the scrollable caption / post-text boxes scroll normally.
        if (e.target.closest && e.target.closest('.bgt-lb-text, .bgt-lb-cap')) return;
        e.preventDefault(); // modal: never scroll the page behind the lightbox
        if (!settings.wheel) return;

        let dy = e.deltaY;
        if (settings.wheelReverse) dy = -dy;
        // Normalise line/page wheels toward pixels, only to gate out 0/jitter events
        // (e.g. a horizontal-only scroll reporting deltaY 0).
        const mag = Math.abs(dy) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
        if (mag < 1) return;
        const dir = dy > 0 ? 1 : -1;

        // What the wheel acts on is decided by what's under the cursor.
        let mode = 'none';
        if (e.target.closest && e.target.closest('.bgt-lb-thumbs')) mode = 'thumbs';
        else if (settings.wheelAction === 'navigate') mode = 'nav';
        else if (settings.wheelAction === 'zoom') {
            const it = grid.items[lbIndex];
            if (it && it.kind === 'image' && e.target.closest && e.target.closest('.bgt-lb-stage')) mode = 'zoom';
        }
        if (mode === 'none') return;

        if (mode === 'zoom') { zoomByWheel(e, dir); return; }

        // One notch -> one image, independent of how big a delta the mouse reports
        // (the old "sum pixels to a threshold" approach took ~3 clicks on low-delta
        // mice and could double-step from leftover accumulation). Instead, detect a
        // fresh notch by a gap since the previous wheel event: a ratcheted click - or a
        // tight burst of tiny events from a high-res wheel - counts once. A continuous
        // stream (trackpad / free-spin coast) still advances, but capped to a steady
        // cadence so it can't fly past several at once.
        const now = Date.now();
        const newNotch = (now - wheelLastEvent) > 60 || dir !== wheelDir;
        wheelLastEvent = now;
        wheelDir = dir;
        if (!newNotch && (now - wheelLastStep) < 180) return;
        wheelLastStep = now;
        if (mode === 'thumbs') navWithinPost(dir); else navLightbox(dir);
    }

    function closeLightbox() {
        if (!lbEl) return;
        teardownVideo();
        lbEl.style.display = 'none';
        lbImg.src = '';
        lbPrefetch.clear(); // release the buffer's Image refs; the HTTP cache still holds the bytes
        unsafeWindow.removeEventListener('keydown', lbKeyHandler, true);
    }

    /* ======================================================================
     * 6. Open / close / route sync.
     * ==================================================================== */
    // The profile tabs are a pager: clicking Posts/Media/Videos does NOT change the
    // URL, so we read the active tab from the DOM. The selected tab's label holds an
    // underline element with an inline background-colour; inactive tabs leave it empty.
    function activeProfileTab() {
        const labels = document.querySelectorAll('[data-testid^="profilePager-"]:not([data-testid^="profilePager-selector"])');
        for (const lab of labels) {
            if (lab.querySelector('[style*="background-color"]')) {
                return (lab.getAttribute('data-testid') || '').replace('profilePager-', '').toLowerCase();
            }
        }
        return null;
    }

    // The gallery only takes over the media-bearing tabs; Posts/Replies/Likes are left
    // exactly as Bluesky renders them.
    function tabUsesGallery(tab) { return tab === 'media' || tab === 'videos'; }

    function currentProfileRoute() {
        const m = location.pathname.match(/^\/profile\/([^/]+)(?:\/(media|video|videos|replies|likes|with_replies))?\/?$/);
        if (!m) return null;
        // Active tab from the DOM pager; fall back to the URL segment (deep links, or
        // before the pager has painted).
        let tab = activeProfileTab();
        if (!tab) {
            const seg = m[2];
            if (seg === 'video' || seg === 'videos') tab = 'videos';
            else if (seg === 'media') tab = 'media';
            else tab = seg || 'posts';
        }
        return { actor: decodeURIComponent(m[1]), tab: tab };
    }

    let pendingHeader = null, waitingActor = null, waitingVideos = false, mountObserver = null, mountTimer = null;

    // The profile feed has to be painted before we can find the in-line anchor.
    // Treat it as ready once the feed host actually holds content (images, or the
    // feed-item testid) rather than an empty skeleton.
    function inlineReady() {
        const host = findInlineHost();
        return !!(host && (host.querySelector('img') || host.querySelector('[data-testid^="feedItem-by-"]')));
    }

    function openGallery(actor, videosOnly) {
        videosOnly = !!videosOnly;
        if (rootEl && rootEl.isConnected && grid.actor === actor && grid.videosOnly === videosOnly) return; // already showing this view
        if (!rootEl && waitingActor === actor && waitingVideos === videosOnly) return;                       // already waiting to mount it
        removeOverlay();

        logDebug('openGallery actor=' + actor + ' videosOnly=' + videosOnly + ' mode=' + settings.mode);
        grid.actor = actor;
        grid.videosOnly = videosOnly;
        grid.cursor = undefined;
        grid.done = false;
        grid.loading = false;
        grid.items = [];
        grid.seen = new Set();

        // Reset per-profile identity/follow state; loadProfile() fills it in async.
        profile.actor = actor; profile.did = null; profile.handle = null;
        profile.displayName = ''; profile.followUri = null; profile.isMe = false; profile._busyFollow = false;

        gridEl = el('div', { class: 'bgt-grid' });
        sentinelEl = el('div', { class: 'bgt-sentinel' }, el('div', { class: 'bgt-spinner' }));
        pendingHeader = buildHeader(actor); // reads grid.videosOnly, set just above
        loadProfile(actor);                 // resolve @handle + follow state (async)

        if (settings.mode === 'inline') {
            // On a fresh load the feed isn't painted yet, so defer until it is.
            if (inlineReady() && mountInline(pendingHeader)) finishMount();
            else waitForInlineHost(actor, videosOnly);
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
        updateFollowVisibility(); // header is mounted now; reflect the current pin state
    }

    function waitForInlineHost(actor, videosOnly) {
        waitingActor = actor;
        waitingVideos = videosOnly;

        // "Sit and watch" for the media feed to appear (e.g. when you switch to the
        // Media tab). Deliberately NO full-screen fallback and NO constant polling:
        // the observer only does work when the DOM actually changes, and the check is
        // debounced so a burst of mutations collapses into one. That keeps it cheap
        // even with many tabs parked on profiles, and it never surprises you with the
        // full-page grid just because the in-line anchor isn't on screen yet.
        const check = () => {
            mountTimer = null;
            if (waitingActor !== actor || waitingVideos !== videosOnly || rootEl) { stopWaiting(); return; }
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
        if (inlineResizeHandler) { window.removeEventListener('resize', inlineResizeHandler); inlineResizeHandler = null; }
        if (inlineScrollHandler) { window.removeEventListener('scroll', inlineScrollHandler, true); inlineScrollHandler = null; }
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
        headerTitleEl = followBtn = null;
        profile.actor = null;
    }

    function remountGallery() {
        const r = currentProfileRoute();
        removeOverlay();
        if (galleryEnabled && r && tabUsesGallery(r.tab)) openGallery(r.actor, r.tab === 'videos');
    }

    function closeGallery() {
        galleryEnabled = false;
        GM_setValue(STORAGE_KEY, false);
        removeOverlay();
        updateButtonState();
    }

    function syncGallery() {
        const r = currentProfileRoute();
        if (galleryEnabled && r && tabUsesGallery(r.tab)) openGallery(r.actor, r.tab === 'videos');
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
        if (galleryEnabled && currentProfileRoute()) remountGallery();
    }

    function sizeChip(value, label) {
        const input = el('input', {
            type: 'radio', name: 'bgt-size', value: value, checked: settings.size === value,
            onChange: () => setSize(value),
        });
        return el('label', { class: 'bgt-size-chip' }, input, label);
    }

    function wheelActionRadio(value, label) {
        const input = el('input', {
            type: 'radio', name: 'bgt-wheelaction', value: value, checked: settings.wheelAction === value,
            onChange: () => setWheelAction(value),
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

    function setDebug(on) {
        settings.debug = !!on;
        GM_setValue(DEBUG_KEY, settings.debug);
        console.log('[Gallery Toggle] debug logging ' + (settings.debug ? 'enabled' : 'disabled'));
    }

    function setPostInfo(on) {
        settings.postInfo = !!on;
        GM_setValue(POSTINFO_KEY, settings.postInfo);
        applyPostInfo(); // live-update if the lightbox is open
    }

    function setAltText(on) {
        settings.altText = !!on;
        GM_setValue(ALT_KEY, settings.altText);
        applyAltText(); // live-update if the lightbox is open
    }

    function setContinuousNav(on) {
        settings.continuousNav = !!on;
        GM_setValue(CONTINUOUS_KEY, settings.continuousNav);
        if (lbEl && lbEl.style.display !== 'none') updateNavButtons(); // live: refresh the arrows
    }

    function setWheel(on) {
        settings.wheel = !!on;
        GM_setValue(WHEEL_KEY, settings.wheel);
        if (!settings.wheel) resetZoom(); // turning it off clears any active zoom
    }

    function setWheelAction(v) {
        settings.wheelAction = v;
        GM_setValue(WHEELACTION_KEY, v);
        resetZoom(); // switching modes drops any current zoom
        if (lbImg && lbImg.style.display !== 'none')
            lbImg.style.cursor = (settings.wheel && v === 'zoom') ? 'zoom-in' : '';
    }

    function setWheelReverse(on) {
        settings.wheelReverse = !!on;
        GM_setValue(WHEELREV_KEY, settings.wheelReverse);
    }

    // Clamp to a sane 1-25 Mbps integer and persist; returns the clamped value so the
    // input can snap to it. Takes effect on the next video opened (hls reads the
    // estimate when its instance is built).
    function setBitrate(v) {
        let n = parseInt(v, 10);
        if (isNaN(n)) n = settings.bitrate;
        n = Math.max(1, Math.min(25, n));
        settings.bitrate = n;
        GM_setValue(BITRATE_KEY, n);
        return n;
    }

    function openSettings() {
        if (document.getElementById(SETTINGS_ID)) return;
        // Declared up front so its onChange can snap the box to the clamped value.
        const bitrateInput = el('input', {
            type: 'number', class: 'bgt-num-input', min: 1, max: 25, step: 1, value: String(settings.bitrate),
            onChange: () => { bitrateInput.value = String(setBitrate(bitrateInput.value)); },
        });
        // Wheel sub-options, kept in their own block so the master checkbox can reveal
        // or hide them in place.
        const wheelSub = el('div', { class: 'bgt-wheel-sub', style: { display: settings.wheel ? 'block' : 'none' } },
            el('div', { class: 'bgt-settings-label' }, 'Wheel over image'),
            el('div', { class: 'bgt-size-group' },
                wheelActionRadio('navigate', 'Navigate'),
                wheelActionRadio('zoom', 'Zoom'),
                wheelActionRadio('none', 'None')),
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.wheelReverse, onChange: (e) => setWheelReverse(e.target.checked) }),
                el('span', {}, 'Reverse wheel direction')),
            el('div', { class: 'bgt-settings-hint' }, 'Scroll the thumbnail strip to flip within a post; over the image the wheel does the action chosen above.'));
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
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.postInfo, onChange: (e) => setPostInfo(e.target.checked) }),
                el('span', {}, 'Show post text in the lightbox')),
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.altText, onChange: (e) => setAltText(e.target.checked) }),
                el('span', {}, 'Show image alt text (accessibility)')),
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.continuousNav, onChange: (e) => setContinuousNav(e.target.checked) }),
                el('span', {}, 'Continuous navigation across posts')),
            el('div', { class: 'bgt-settings-hint' }, 'On: arrows flow through every image. Off: arrows stay within a post’s images — use the thumbnail strip (shown for 2–4 image posts) to jump between them.'),
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.wheel, onChange: (e) => { setWheel(e.target.checked); wheelSub.style.display = e.target.checked ? 'block' : 'none'; } }),
                el('span', {}, 'Enable mouse-wheel features')),
            wheelSub,
            el('div', { class: 'bgt-settings-label' }, 'Video start quality'),
            el('div', { class: 'bgt-bitrate-row' },
                bitrateInput,
                el('span', { class: 'bgt-bitrate-unit' }, 'Mbps')),
            el('div', { class: 'bgt-settings-hint' }, 'Bandwidth hls.js assumes for the first video segment (1–25). Higher loads sharper sooner; lower it if you ever see stalls.'),
            el('label', { class: 'bgt-check-row' },
                el('input', { type: 'checkbox', checked: settings.debug, onChange: (e) => setDebug(e.target.checked) }),
                el('span', {}, 'Debug logging to console')),
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

        /* ---- header follow / following button ---- */
        #${OVERLAY_ID} .bgt-followbtn {
            display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 16px;
            border: none; border-radius: 999px; cursor: pointer; white-space: nowrap;
            font-size: 14px; font-weight: 600; line-height: 1;
            font-family: InterVariable, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, sans-serif;
            background: ${ACCENT}; color: #fff; transition: background-color 120ms ease, color 120ms ease;
        }
        #${OVERLAY_ID} .bgt-followbtn:hover { background: #2f93f0; }
        #${OVERLAY_ID} .bgt-followbtn svg { display: block; }
        /* Following: neutral grey pill (inherits the theme's text colour so it reads on
           light AND dark); hovering it reveals the red "Unfollow" cue. */
        #${OVERLAY_ID} .bgt-followbtn.bgt-following { background: rgba(127,127,127,0.22); color: inherit; }
        #${OVERLAY_ID} .bgt-followbtn.bgt-following:hover { background: rgba(244,33,46,0.14); color: #f4212e; }
        /* Label/icon visibility is state-driven: "+ Follow" / "Following" / (hover) "Unfollow". */
        #${OVERLAY_ID} .bgt-followbtn .bgt-fl-following,
        #${OVERLAY_ID} .bgt-followbtn .bgt-fl-unfollow { display: none; }
        #${OVERLAY_ID} .bgt-followbtn.bgt-following .bgt-fl-plus,
        #${OVERLAY_ID} .bgt-followbtn.bgt-following .bgt-fl-follow { display: none; }
        #${OVERLAY_ID} .bgt-followbtn.bgt-following .bgt-fl-following { display: inline; }
        #${OVERLAY_ID} .bgt-followbtn.bgt-following:hover .bgt-fl-following { display: none; }
        #${OVERLAY_ID} .bgt-followbtn.bgt-following:hover .bgt-fl-unfollow { display: inline; }

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
        #${LIGHTBOX_ID} .bgt-lb-stage { display: flex; align-items: center; justify-content: center; overflow: hidden; }
        #${LIGHTBOX_ID} .bgt-lbimg { max-width: 94vw; max-height: 90vh; object-fit: contain; border-radius: 4px; opacity: 0; }
        /* Revealed only once the new image has decoded (set in showLightbox), so a
           navigation shows the loader instead of the previous, still-displayed picture. */
        #${LIGHTBOX_ID} .bgt-lbimg.bgt-loaded { opacity: 1; }
        /* Centred over the stage; shown while the next image decodes. */
        #${LIGHTBOX_ID} .bgt-lb-loading {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            display: none; flex-direction: column; align-items: center; gap: 12px;
            color: #c3ccd6; font-size: 14px; font-weight: 600; z-index: 2; pointer-events: none;
        }
        #${LIGHTBOX_ID} .bgt-lbvideo { max-width: 94vw; max-height: 90vh; object-fit: contain; border-radius: 4px; background: #000; }
        /* A definite box, sized by the video's aspect ratio, so the player fills the
           stage and upscales a low starting rendition (object-fit) instead of shrinking
           to the rendition's own pixels. Height is capped so the native controls clear
           the action bar pinned along the bottom of the lightbox. */
        #${LIGHTBOX_ID}.bgt-has-video .bgt-lbvideo {
            height: 74vh; width: auto; max-width: 94vw; max-height: 74vh;
            aspect-ratio: var(--bgt-ar, 16 / 9);
        }
        #${LIGHTBOX_ID} .bgt-lb-close { position: absolute; top: 16px; right: 20px; z-index: 4; }
        #${LIGHTBOX_ID} .bgt-lb-nav {
            position: absolute; top: 50%; transform: translateY(-50%);
            width: 50px; height: 50px; font-size: 34px; background: rgba(0,0,0,0.4);
        }
        #${LIGHTBOX_ID} .bgt-lb-prev { left: 14px; }
        #${LIGHTBOX_ID} .bgt-lb-next { right: 14px; }
        /* ---- thumbnail strip (multi-image posts) ---- */
        #${LIGHTBOX_ID} .bgt-lb-thumbs {
            position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
            display: none; gap: 8px; align-items: center; padding: 6px; max-width: 92vw;
            overflow-x: auto; background: rgba(0,0,0,0.5); border-radius: 12px; z-index: 3;
        }
        #${LIGHTBOX_ID} .bgt-lb-thumb {
            flex: 0 0 auto; width: 100px; height: 100px; padding: 0; cursor: pointer;
            border: 2px solid transparent; border-radius: 8px; overflow: hidden;
            background: #11171f; opacity: 0.55; transition: opacity .12s ease, border-color .12s ease;
        }
        #${LIGHTBOX_ID} .bgt-lb-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        #${LIGHTBOX_ID} .bgt-lb-thumb:hover { opacity: 0.85; }
        #${LIGHTBOX_ID} .bgt-lb-thumb.bgt-on { opacity: 1; border-color: ${ACCENT}; }
        /* Keep the image clear of the strip (and the bottom bar) while it's showing. */
        #${LIGHTBOX_ID}.bgt-has-thumbs .bgt-lbimg { max-height: calc(100vh - 280px); }
        #${LIGHTBOX_ID} .bgt-lb-bar {
            position: absolute; left: 0; right: 0; bottom: 0; padding: 20px 18px 14px;
            display: flex; flex-direction: column; gap: 10px; color: #e6e9ec; font-size: 14px;
            background: linear-gradient(transparent, rgba(0,0,0,0.88));
            /* keep white text readable over light images, not just the gradient */
            text-shadow: 0 1px 3px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.85);
            /* The bar spans the bottom, but only its controls should be clickable -
               let clicks on the empty gradient fall through to the backdrop (close). */
            pointer-events: none;
        }
        /* Post text + alt caption sit close (10px gap); the action row gets its own
           clear separation above it, so the gap above the buttons is consistent whether
           or not the optional text blocks are showing. */
        /* align-self:center shrinks the row to its buttons so the empty corners beside
           it belong to the (click-through) bar, not the row; pointer-events:auto keeps
           the cluster - buttons, timestamp, gaps, link - from closing the lightbox. */
        #${LIGHTBOX_ID} .bgt-lb-actions { display: flex; align-self: center; align-items: center; justify-content: center; gap: 11px; margin-top: 14px; pointer-events: auto; }
        #${LIGHTBOX_ID} .bgt-lb-time { color: #8b98a5; font-size: 13px; white-space: nowrap; }
        #${LIGHTBOX_ID} .bgt-lb-time:empty { display: none; }
        #${LIGHTBOX_ID} .bgt-lb-text, #${LIGHTBOX_ID} .bgt-lb-cap {
            display: none; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere;
            overflow-y: auto; width: 50%; max-width: 450px; margin: 0 auto; line-height: 1.4;
            pointer-events: auto; /* scrollable/selectable text shouldn't close on click */
        }
        #${LIGHTBOX_ID} .bgt-lb-text { max-height: 22vh; font-size: 14px; color: #f1f3f5; }
        #${LIGHTBOX_ID} .bgt-lb-cap { max-height: 14vh; font-size: 13px; color: #d2d9e0; }
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
        #${SETTINGS_ID} .bgt-bitrate-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
        #${SETTINGS_ID} .bgt-num-input {
            width: 84px; background: #11171f; color: #f1f3f5; border: 1px solid #2a3743;
            border-radius: 8px; padding: 8px 10px; font-size: 14px; font-weight: 600;
            accent-color: #0085ff;
        }
        #${SETTINGS_ID} .bgt-num-input:focus { outline: none; border-color: #0085ff; }
        #${SETTINGS_ID} .bgt-bitrate-unit { font-size: 13px; color: #8b98a5; }
        #${SETTINGS_ID} .bgt-wheel-sub { margin: 6px 0 2px 4px; padding-left: 10px; border-left: 2px solid #2a3743; }
        #${SETTINGS_ID} .bgt-check-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; color: #c3ccd6; cursor: pointer; }
        #${SETTINGS_ID} .bgt-check-row input { accent-color: #0085ff; }
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

    let lastSig = '';
    function routeSig() {
        const r = currentProfileRoute();
        return location.href + '|' + (r ? r.tab : '-');
    }
    function onRouteChange() {
        lastSig = routeSig();
        logDebug('route/tab change -> ' + lastSig);
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

        // Watches for navigation AND profile tab switches. The Media/Videos pager
        // doesn't change the URL, so href alone isn't enough - routeSig() also folds
        // in the active-tab state.
        setInterval(() => {
            if (routeSig() !== lastSig) onRouteChange();
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
