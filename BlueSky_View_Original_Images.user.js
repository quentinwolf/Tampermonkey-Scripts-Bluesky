// ==UserScript==
// @name         BlueSky (View Original Images)
// @description  Load the original images anywhere that thumbnails are loaded.
// @author       QuentinWolf
// @icon         https://www.google.com/s2/favicons?sz=64&domain=bsky.app
// @namespace    quentinwolf_bluesky_view_original_images
// @version      0.32
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
        let images = document.querySelectorAll('img');

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

    // Observe for changes in DOM
    let callback = (mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                replaceImageSources();
            }
        }
    };
    const observeConfig = {
        childList: true,
        subtree: true
    };
    const observer = new MutationObserver(callback);

    // Start observing
    observer.observe(document.body, observeConfig);

    // Initial replacement
    replaceImageSources();
})();
