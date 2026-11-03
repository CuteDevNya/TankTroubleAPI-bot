// ==UserScript==
// @name         Tank Trouble - World Reader (Module Loader)
// @namespace    https://tampermonkey.net/
// @version      0.8.7
// @description  Loads the modular Tank Trouble World Reader from GitHub
// @match        *://tanktrouble.com/*
// @match        *://*.tanktrouble.com/*
// @run-at       document-start
// @grant        none
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/core.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/identity.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/geometry.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/world.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/physics.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/projectiles.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/overlay.js?v=0.8.7
// @require      https://raw.githubusercontent.com/CuteDevNya/TankTroubleAPI-bot/main/src/app.js?v=0.8.7
// ==/UserScript==
(() => {
    'use strict';

    const MARKER = '__TTWR_MODULE_LOADER_086__';
    if (window[MARKER]) return;
    window[MARKER] = true;

    const api = window.TTWR;
    if (!api) {
        console.error('[TT World Reader] Modules were required, but the core API is missing.');
        window[MARKER] = false;
        return;
    }

    console.info('[TT World Reader] Module loader ready · v' + api.version);
})();
