// ==UserScript==
// @name         BlueSky (View Original Images)
// @description  Load the original images anywhere that thumbnails are loaded.
// @author       quentinwolf
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @namespace    quentinwolf_bluesky_view_original_images
// @version      0.34
// @license      GPL-3.0-or-later
// @match        https://bsky.app/*
// @match        https://av-cdn.bsky.app/img/*
// @match        https://cdn.bsky.app/img/*
// @downloadURL  https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky/raw/refs/heads/main/BlueSky_View_Original_Images.user.js
// @updateURL    https://github.com/quentinwolf/Tampermonkey-Scripts-Bluesky/raw/refs/heads/main/BlueSky_View_Original_Images.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const URL = window.location.href;
    const match = URL.match(/https:\/\/(av-cdn|cdn)\.bsky\.app\/img\/feed_(?:thumbnail|fullsize)\/plain\/([a-zA-Z0-9\-\:\/]+)\/([a-zA-Z0-9\-\_]+)/);

    // If user visits a direct image URL, redirect to high-quality version
    if (match && !URL.endsWith('@jpeg')) {
        window.location.replace(`https://${match[1]}.bsky.app/img/feed_fullsize/plain/${match[2]}/${match[3]}@jpeg`);
        return;
    }

    // Announce ourselves on <html> so companion scripts can adapt rather than fight us.
    // The Gallery Toggle reads this to pre-apply the @jpeg suffix below to the image its
    // lightbox is about to show: without it, that image is set as a bare (webp) URL, we
    // rewrite it a moment later, and the browser fetches the same picture twice.
    document.documentElement.setAttribute('data-bsky-view-original', '1');

    function enableDrag(imgElement) {
        // Set the image and its parents as draggable
        imgElement.setAttribute('draggable', 'true');
        let parent = imgElement.parentElement;
        while (parent) {
            parent.setAttribute('draggable', 'true');
            parent = parent.parentElement;
        }

        // Set styles to potentially enable dragging in Firefox
        imgElement.style.userDrag = "auto";
        imgElement.style.userSelect = "auto";
        imgElement.style.MozUserSelect = "auto";

        // Prevent any default behavior on mousedown
        ['dragstart', 'drag', 'mousedown', 'mouseup', 'mousemove'].forEach(eventName => {
            imgElement.addEventListener(eventName, function(e) {
                e.stopPropagation();
            }, true);  // The `true` here means the listener is capturing, so it runs before any other listeners.
        });


        // Add the dragstart event listener
        imgElement.addEventListener('dragstart', function(e) {
            e.dataTransfer.setData('text/plain', e.target.src);
            e.dataTransfer.setData('DownloadURL', 'image/jpeg:' + e.target.src);
            e.stopPropagation();  // Stop event propagation
        });

        // Clone the image and replace the original with the clone to remove any event listeners
        const clonedImg = imgElement.cloneNode(true);
        imgElement.parentNode.replaceChild(clonedImg, imgElement);
    }

    function replaceImageSources() {
        // data-keep-thumbnail opts an image out. A companion script sets it on images it
        // deliberately renders small - the Gallery Toggle grid and its lightbox filmstrip -
        // where upgrading each tile means downloading a full-resolution JPEG to draw it at
        // ~150px. Those scripts hand out the full-size URL on drag themselves.
        let images = document.querySelectorAll('img:not([data-keep-thumbnail])');

        images.forEach(img => {
            let src = img.getAttribute('src');

            if (src && (src.includes('feed_thumbnail') || (src.includes('feed_fullsize') && !src.endsWith('@jpeg')))) {
                let newSrc = src.replace('feed_thumbnail', 'feed_fullsize').replace(/@\w+$/, '') + '@jpeg';
                img.setAttribute('src', newSrc);
                img.setAttribute('draggable', 'true');
                //enableDrag(img); // Make the image draggable
            }
        });
    }

    // Observe for changes in DOM. replaceImageSources() sweeps every <img> in the
    // document, and Bluesky re-renders constantly - a gallery page alone appends ~100
    // tiles in one go - so running it per mutation record meant dozens of full-document
    // scans back to back. Collapse each burst into a single scan on the next frame.
    // (A background tab gets no frames, so its scan waits until you look at it - which
    // is exactly when the upgraded images could first matter.)
    let scanQueued = false;
    const queueScan = () => {
        if (scanQueued) return;
        scanQueued = true;
        requestAnimationFrame(() => { scanQueued = false; replaceImageSources(); });
    };
    const observeConfig = {
        childList: true,
        subtree: true
    };
    const observer = new MutationObserver(queueScan);

    // Start observing
    observer.observe(document.body, observeConfig);

    // Initial replacement
    replaceImageSources();
})();
