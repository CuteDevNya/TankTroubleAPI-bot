(() => {
    'use strict';
    try { window.__TT_WORLD_READER__?.dispose?.(); } catch (_) {}
    try { window.TTWR?.dispose?.(); } catch (_) {}

    const api = window.TTWR = {
        version: '0.8.3',
        playerId: null,
        playerDetectionMethod: 'waiting for account data',
        game: null,
        gameCanvas: null,
        snapshot: null,
        lastError: '',
        lastReadAt: 0,
        modules: {},
        CONFIG: {
            showWalls: true,
            showTanks: true,
            showItems: true,
            showProjectiles: true,
            showTrajectories: true,
            dangerHorizonSeconds: 2.5,
            missilePreviewSeconds: 0.28,
            bulletRadius: 4,
            laserRadius: 2,
            laserLineWidth: 4,
            maxDrawBounces: 4,
            dangerWarningSeconds: 1.2
        }
    };

    api.finite = value => typeof value === 'number' && Number.isFinite(value);

    api.activeChildren = group => {
        if (!group || !Array.isArray(group.children)) return [];
        return group.children.filter(child =>
            child &&
            child.alive !== false &&
            child.exists !== false &&
            child.visible !== false &&
            child.renderable !== false &&
            (child.alpha == null || child.alpha > 0)
        );
    };

    api.getWorldBounds = object => {
        if (!object) return null;
        try {
            const bounds = object.getBounds?.();
            if (bounds &&
                api.finite(bounds.x) &&
                api.finite(bounds.y) &&
                api.finite(bounds.width) &&
                api.finite(bounds.height)) {
                const x2 = bounds.x + bounds.width;
                const y2 = bounds.y + bounds.height;
                return {
                    x: Math.min(bounds.x, x2),
                    y: Math.min(bounds.y, y2),
                    w: Math.abs(bounds.width),
                    h: Math.abs(bounds.height)
                };
            }
        } catch (_) {}
        if (object.world &&
            api.finite(object.world.x) &&
            api.finite(object.world.y)) {
            const w = Math.abs(Number(object.width) || 0);
            const h = Math.abs(Number(object.height) || 0);
            return {
                x: object.world.x - w / 2,
                y: object.world.y - h / 2,
                w,
                h
            };
        }
        return null;
    };

    api.centerOf = bounds => bounds
        ? { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
        : null;

    api.transformPoint = (matrix, point) => {
        if (matrix &&
            ['a', 'b', 'c', 'd', 'tx', 'ty'].every(key => api.finite(matrix[key]))) {
            return {
                x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
                y: matrix.b * point.x + matrix.d * point.y + matrix.ty
            };
        }
        return { x: point.x, y: point.y };
    };

    api.transformVector = (matrix, vector) => {
        if (matrix &&
            ['a', 'b', 'c', 'd'].every(key => api.finite(matrix[key]))) {
            return {
                x: matrix.a * vector.x + matrix.c * vector.y,
                y: matrix.b * vector.x + matrix.d * vector.y
            };
        }
        return { x: vector.x, y: vector.y };
    };

    api.transformDisplayPoint = (displayObject, point, includeSelf = false) => {
        const matrix = includeSelf
            ? displayObject?.worldTransform
            : displayObject?.parent?.worldTransform;
        return api.transformPoint(matrix, point);
    };

    api.isMainGame = game => Boolean(
        game &&
        Number(game.width) >= 1000 &&
        Number(game.height) >= 800 &&
        game.state &&
        typeof game.state.getCurrentState === 'function'
    );

    api.findExistingGame = () => {
        const values = [
            window.mainGame,
            window.allGames,
            window.allPhaserGames,
            window.Phaser?.GAMES
        ];
        const candidates = [];
        for (const value of values) {
            if (!value) continue;
            if (Array.isArray(value)) candidates.push(...value);
            else candidates.push(value);
        }
        return candidates.find(api.isMainGame) || null;
    };

    api.findGameCanvas = game => {
        if (game?.canvas?.tagName === 'CANVAS') return game.canvas;
        const canvases = Array.from(document.querySelectorAll('canvas'));
        return canvases.find(canvas =>
            Math.abs(canvas.width - game.width) <= 2 &&
            Math.abs(canvas.height - game.height) <= 2
        ) || canvases
            .filter(canvas => canvas.width >= 1000 && canvas.height >= 800)
            .sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;
    };

    api.attachGame = game => {
        if (!api.isMainGame(game)) return false;
        api.game = game;
        api.gameCanvas = api.findGameCanvas(game);
        api.modules.overlay?.ensure?.();
        api.modules.overlay?.status?.(
            api.gameCanvas ? 'Connected · read-only' : 'Game found · canvas not found'
        );
        return true;
    };

    api.getState = () => api.game?.state?.getCurrentState?.() || null;

    api.getPhysicsTank = (state, playerId) => {
        const controller = state?.gameController;
        const roundController = controller?.roundController;
        return [
            controller?.gameMode?.tanks?.[playerId],
            roundController?.getTank?.(playerId),
            roundController?.model?.getTank?.(playerId),
            roundController?.model?.tanks?.[playerId]
        ].find(Boolean) || {};
    };

    api.getRoundModel = state => {
        const tanks = state?.gameController?.gameMode?.tanks || {};
        const tankWithModel = Object.values(tanks).find(tank => tank?.roundModel);
        return tankWithModel?.roundModel ||
            state?.gameController?.roundController?.roundModel ||
            state?.gameController?.roundController?.model ||
            null;
    };

    console.info('[TT World Reader] Core module loaded', api.version);
})();