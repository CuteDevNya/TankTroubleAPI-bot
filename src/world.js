(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before world.js');

    function readWorldObjects(state) {
        const walls = (state?.mazeWallGroup?.children || [])
            .map((wall, index) => {
                const bounds = api.getWorldBounds(wall);
                return bounds ? { id: index, ...bounds } : null;
            })
            .filter(Boolean);

        const crates = api.activeChildren(state?.crateGroup)
            .map((crate, index) => {
                const bounds = api.getWorldBounds(crate);
                const center = api.centerOf(bounds);
                if (!center) return null;
                return {
                    id: index,
                    x: center.x,
                    y: center.y,
                    bounds,
                    frameName: crate.frameName || ''
                };
            })
            .filter(Boolean);

        const mines = api.activeChildren(state?.mineGroup)
            .map((mine, index) => {
                const bounds = api.getWorldBounds(mine);
                const center = api.centerOf(bounds);
                return center ? { id: index, x: center.x, y: center.y, bounds } : null;
            })
            .filter(Boolean);

        return { walls, crates, mines };
    }

    api.modules.world = { readWorldObjects };
})();