(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before identity.js');

    function updatePlayerIdentity(state) {
        // Preserve the confirmed 0.6.0 account-to-active-player matching.
        // No keyboard hooks or input-state inspection are used.
        const authenticatedIds = window.g_users &&
            typeof window.g_users === 'object'
            ? Object.keys(window.g_users).map(String)
            : [];
        const guestIds = window.g_guests &&
            typeof window.g_guests === 'object'
            ? Object.keys(window.g_guests).map(String)
            : [];

        const accountIds = new Set([...authenticatedIds, ...guestIds]);
        const activePlayers = state?.gameController?.model?.activePlayers || {};
        const activeIds = Object.keys(activePlayers).map(String);
        const matches = activeIds.filter(id => accountIds.has(id));

        if (matches.length === 1) {
            api.playerId = matches[0];
            const isGuest = guestIds.includes(api.playerId);
            const isAuthenticated = authenticatedIds.includes(api.playerId);
            const accountType = isGuest && isAuthenticated
                ? 'account'
                : isGuest ? 'guest account' : 'authenticated account';
            api.playerDetectionMethod = accountType + ' matched active players';
        } else if (matches.length > 1) {
            api.playerId = null;
            api.playerDetectionMethod = 'ambiguous account/player match';
        } else if (api.playerId && accountIds.has(api.playerId)) {
            api.playerDetectionMethod = 'confirmed account ID (temporarily inactive)';
        } else {
            api.playerId = null;
            api.playerDetectionMethod = accountIds.size === 0
                ? 'account data unavailable'
                : 'no active account match';
        }

        return { id: api.playerId, method: api.playerDetectionMethod };
    }

    function readTanks(state, identity) {
        return api.activeChildren(state?.tankGroup).map((sprite, index) => {
            const id = String(sprite.playerId ?? '');
            const bounds = api.getWorldBounds(sprite);
            const center = api.centerOf(bounds);
            const physicsTank = api.getPhysicsTank(state, id);

            return {
                id,
                isMe: Boolean(identity.id) && id === identity.id,
                index,
                x: center?.x ?? null,
                y: center?.y ?? null,
                rotation: Number(sprite.rotation) || 0,
                alive: sprite.alive !== false,
                visible: sprite.visible !== false,
                bounds,
                hitboxes: api.modules.geometry.getPhysicsHitboxes(physicsTank, sprite)
            };
        }).filter(tank => api.finite(tank.x) && api.finite(tank.y));
    }

    api.modules.identity = { updatePlayerIdentity, readTanks };
})();