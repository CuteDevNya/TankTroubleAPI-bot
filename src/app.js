(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before app.js');

    let running = false;
    let retryTimer = null;

    function readWorld() {
        const started = performance.now();
        const state = api.getState();
        if (!state) throw new Error('Game state is not available yet');

        const identity = api.modules.identity.updatePlayerIdentity(state);
        const tanks = api.modules.identity.readTanks(state, identity);
        const world = api.modules.world.readWorldObjects(state);
        const roundModel = api.getRoundModel(state);
        const projectileData = api.modules.projectiles.readProjectiles(state, roundModel);

        const snapshot = {
            timestamp: Date.now(),
            game: {
                width: Number(api.game.width),
                height: Number(api.game.height)
            },
            tanks,
            myPlayerId: identity.id,
            playerDetectionMethod: identity.method,
            walls: world.walls,
            crates: world.crates,
            mines: world.mines,
            projectiles: projectileData.projectiles,
            lasers: projectileData.lasers
        };

        snapshot.dangers = api.modules.projectiles.analyzeThreats(snapshot);
        snapshot.readMs = performance.now() - started;
        return snapshot;
    }

    function tick() {
        if (!api.game) {
            const game = api.findExistingGame();
            if (game) api.attachGame(game);
            return;
        }

        if (!api.gameCanvas || !api.gameCanvas.isConnected) {
            api.gameCanvas = api.findGameCanvas(api.game);
        }
        if (!api.gameCanvas) {
            api.modules.overlay.status('Game found · waiting for canvas', true);
            return;
        }

        try {
            api.snapshot = readWorld();
            api.lastError = '';
            api.lastReadAt = Date.now();
            api.modules.overlay.render(api.snapshot);
        } catch (error) {
            api.lastError = error?.message || String(error);
            api.modules.overlay.status('Read error · ' + api.lastError, true);
        }
    }

    function installPhaserHook() {
        const prototype = window.Phaser?.Game?.prototype;
        if (!prototype || typeof prototype.update !== 'function') return false;
        if (prototype.__ttWorldReaderV08Hooked) return true;

        const originalUpdate = prototype.update;
        Object.defineProperty(prototype, '__ttWorldReaderV08Hooked', {
            value: true,
            configurable: false,
            enumerable: false
        });

        prototype.update = function(...args) {
            const result = originalUpdate.apply(this, args);
            if (api.game === this) {
                try { this.stage?.updateTransform?.(); } catch (_) {}
                tick();
            }
            return result;
        };
        return true;
    }

    function start() {
        if (running) return;
        running = true;
        api.modules.overlay.ensure();

        const attempt = () => {
            // The script runs at document-start, so body may not exist yet.
            // Retry overlay creation as well as game discovery.
            api.modules.overlay.ensure();

            const hooked = installPhaserHook();
            if (!api.game) {
                const game = api.findExistingGame();
                if (game) api.attachGame(game);
            }
            if (api.game && hooked) {
                tick();
                return;
            }
            retryTimer = window.setTimeout(() => {
                retryTimer = null;
                attempt();
            }, 250);
        };
        attempt();
    }

    function dispose() {
        running = false;
        if (retryTimer) window.clearTimeout(retryTimer);
        retryTimer = null;
        api.modules.overlay.dispose();
    }

    api.tick = tick;
    api.dispose = dispose;
    window.__TT_WORLD_READER__ = {
        getSnapshot: () => api.snapshot,
        getStatus: () => ({
            connected: Boolean(api.game),
            lastReadAt: api.lastReadAt,
            lastError: api.lastError,
            myPlayerId: api.playerId,
            playerDetectionMethod: api.playerDetectionMethod
        }),
        dispose
    };
    start();
})();