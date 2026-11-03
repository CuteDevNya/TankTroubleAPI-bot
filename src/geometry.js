(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before geometry.js');

    function getPhysicsHitboxes(physicsTank, sprite) {
        const body = physicsTank?.b2dBody;
        if (!body) return [];

        const parentMatrix = sprite?.parent?.worldTransform;

        function toScreenCoordinates(worldPoint) {
            // Use the live Box2D world point, not the interpolated sprite x/y.
            return api.transformPoint(parentMatrix, {
                x: worldPoint.x * 20,
                y: worldPoint.y * 20
            });
        }

        function getWorldPoint(localPoint) {
            try {
                if (typeof body.GetWorldPoint === 'function') {
                    const point = body.GetWorldPoint(localPoint);
                    if (point && api.finite(point.x) && api.finite(point.y)) return point;
                }
            } catch (_) {}

            const xf = body.m_xf;
            const rotation = xf?.R;
            const position = xf?.position || xf?.p;
            if (!rotation || !position) return null;

            return {
                x: position.x +
                    rotation.col1.x * localPoint.x +
                    rotation.col2.x * localPoint.y,
                y: position.y +
                    rotation.col1.y * localPoint.x +
                    rotation.col2.y * localPoint.y
            };
        }

        const result = [];
        let fixture = body.GetFixtureList?.() || body.m_fixtureList;
        let guard = 0;

        while (fixture && guard++ < 64) {
            const shape = fixture.GetShape?.() || fixture.m_shape;

            if (shape?.m_type === 1 && Array.isArray(shape.m_vertices)) {
                const count = Math.min(
                    shape.m_vertexCount || shape.m_vertices.length,
                    shape.m_vertices.length
                );
                const points = [];

                for (let i = 0; i < count; i++) {
                    const worldPoint = getWorldPoint(shape.m_vertices[i]);
                    if (worldPoint) points.push(toScreenCoordinates(worldPoint));
                }

                if (points.length >= 3) result.push({ type: 'polygon', points });
            }

            fixture = fixture.GetNext?.() || fixture.m_next;
        }

        return result;
    }

    function pointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[i];
            const b = polygon[j];
            const crosses = ((a.y > point.y) !== (b.y > point.y)) &&
                (point.x < (b.x - a.x) * (point.y - a.y) /
                    ((b.y - a.y) || 1e-12) + a.x);
            if (crosses) inside = !inside;
        }
        return inside;
    }

    function pointSegmentDistance(point, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lengthSquared = dx * dx + dy * dy;
        if (lengthSquared < 1e-12) {
            return Math.hypot(point.x - a.x, point.y - a.y);
        }
        const t = Math.max(0, Math.min(1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
        ));
        return Math.hypot(
            point.x - (a.x + t * dx),
            point.y - (a.y + t * dy)
        );
    }

    function pointPolygonDistance(point, polygon) {
        if (!polygon || polygon.length < 3) return Infinity;
        if (pointInPolygon(point, polygon)) return 0;
        let minimum = Infinity;
        for (let i = 0; i < polygon.length; i++) {
            minimum = Math.min(minimum, pointSegmentDistance(
                point, polygon[i], polygon[(i + 1) % polygon.length]
            ));
        }
        return minimum;
    }

    function firstPolygonImpact(segment, polygon, radius) {
        const dx = segment.x2 - segment.x1;
        const dy = segment.y2 - segment.y1;
        const at = t => ({ x: segment.x1 + dx * t, y: segment.y1 + dy * t });
        const distance = t => pointPolygonDistance(at(t), polygon);
        if (distance(0) <= radius) return 0;

        let left = 0;
        let right = 1;
        for (let i = 0; i < 36; i++) {
            const t1 = left + (right - left) / 3;
            const t2 = right - (right - left) / 3;
            if (distance(t1) <= distance(t2)) right = t2;
            else left = t1;
        }

        const minimumT = (left + right) / 2;
        if (distance(minimumT) > radius + 1e-6) return null;

        left = 0;
        right = minimumT;
        for (let i = 0; i < 32; i++) {
            const middle = (left + right) / 2;
            if (distance(middle) <= radius) right = middle;
            else left = middle;
        }
        return right;
    }

    api.modules.geometry = {
        getPhysicsHitboxes,
        pointInPolygon,
        pointSegmentDistance,
        pointPolygonDistance,
        firstPolygonImpact
    };
})();