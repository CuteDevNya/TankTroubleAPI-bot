// ==UserScript==
// @name         Tank Trouble - World Reader (Module Loader)
// @namespace    https://tampermonkey.net/
// @version      0.8.0
// @description  Loads the modular Tank Trouble World Reader from GitHub
// @match        *://tanktrouble.com/*
// @match        *://*.tanktrouble.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(async () => {
    'use strict';

    const BASE = 'https://raw.githubusercontent.com/CuteDevNya/TankApiChat/main/';
    const MARKER = '__TTWR_MODULE_LOADER_080__';
    if (window[MARKER]) return;
    window[MARKER] = true;

    function loadScript(path, version) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = BASE + path + '?v=' + encodeURIComponent(version);
            script.async = false;
            script.onload = () => {
                script.remove();
                resolve();
            };
            script.onerror = () => {
                script.remove();
                reject(new Error('Could not load module: ' + path));
            };
            (document.head || document.documentElement).appendChild(script);
        });
    }

    try {
        const response = await fetch(BASE + 'loader/manifest.json', {
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error('Manifest request failed: HTTP ' + response.status);
        }

        const manifest = await response.json();
        if (!manifest || !Array.isArray(manifest.modules) ||
            !manifest.version || manifest.modules.length === 0) {
            throw new Error('Invalid module manifest.');
        }

        for (const path of manifest.modules) {
            await loadScript(path, manifest.version);
        }

        console.info(
            '[TT World Reader] Loaded ' + manifest.modules.length +
            ' modules · v' + manifest.version
        );
    } catch (error) {
        window[MARKER] = false;
        console.error('[TT World Reader] Module loader failed:', error);
    }
})();