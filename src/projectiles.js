(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before projectiles.js');
    const geom = () => api.modules.geometry;

    function readProjectileModels(roundModel) {
        const source = roundModel?.projectiles || {};
        return Array.isArray(source) ? source : Object.values(source);
    }

    function readLaserPaths(state, projectileModels) {
        const projectileById = new Map(
            projectileModels.map(projectile => [String(projectile?.id ?? ''), projectile])
        );

        return api.activeChildren(state?.laserGroup).map(laser => {
            const id = String(laser.laserId ?? '');
            const points = Array.isArray(laser.laserPositions)
                ? laser.laserPositions
                    .filter(point =>
                        api.finite(Number(point?.x)) &&
                        api.finite(Number(point?.y))
                    )
                    .map(point => api.transformDisplayPoint(laser, {
                        x: Number(point.x),
                        y: Number(point.y)
                    }, true))
                : [];

            const projectile = projectileById.get(id);
            return {
                id,
                shooterId: String(projectile?.playerId ?? ''),
                isMine: Boolean(api.playerId) &&
                    String(projectile?.playerId ?? '') === api.playerId,
                color: String(laser.colour ?? laser.lineColor ?? '0xffffff')
                    .replace(/^0x/i, '#'),
                width: Number(laser.lineWidth) || api.CONFIG.laserLineWidth,
                alpha: api.finite(Number(laser.lineAlpha))
                    ? Number(laser.lineAlpha)
                    : 1,
                expanding: Boolean(laser.expanding),
                retracting: Boolean(laser.retracting),
                points
            };
        }).filter(laser => laser.id && laser.points.length >= 2);
    }

    function mapProjectiles(state, roundModel, laserPaths) {
        const projectileModels = readProjectileModels(roundModel);
        const bulletSprites = api.activeChildren(state?.projectileGroup);
        const missileSprites = api.activeChildren(state?.missileGroup);
        const usedSprites = new Set();

        return projectileModels.map((projectile, index) => {
            const id = String(projectile?.id ?? 'projectile-' + index);
            const type = Number(projectile?.type ?? -1);
            const local = {
                x: Number(projectile?.x) * 20,
                y: Number(projectile?.y) * 20
            };

            let display = null;
            let position = null;
            let matchDistance = null;

            if (type === 3) {
                display = missileSprites.find(sprite =>
                    String(sprite.projectileId ?? '') === id
                ) || null;
            }

            if (type === 0) {
                display = api.activeChildren(state?.laserGroup)
                    .find(item => String(item.laserId ?? '') === id) || null;
                const path = laserPaths.find(item => item.id === id);
                if (path?.points?.length) position = path.points[path.points.length - 1];
            }

            if (!display && !position &&
                api.finite(local.x) && api.finite(local.y)) {
                let bestDistance = Infinity;
                for (const sprite of bulletSprites) {
                    if (usedSprites.has(sprite)) continue;
                    if (!api.finite(Number(sprite.x)) || !api.finite(Number(sprite.y))) continue;
                    const distance = Math.hypot(
                        Number(sprite.x) - local.x,
                        Number(sprite.y) - local.y
                    );
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        display = sprite;
                    }
                }

                if (display && bestDistance <= 3) {
                    usedSprites.add(display);
                    matchDistance = bestDistance;
                } else {
                    display = null;
                }
            }

            if (!position && display && api.finite(local.x) && api.finite(local.y)) {
                position = api.transformDisplayPoint(display, local, false);
            }

            if (!position && type === 0) {
                const laser = api.activeChildren(state?.laserGroup)
                    .find(item => String(item.laserId ?? '') === id);
                const point = laser?.laserPositions?.slice?.(-1)?.[0];
                if (point) {
                    position = api.transformDisplayPoint(laser, {
                        x: Number(point.x),
                        y: Number(point.y)
                    }, true);
                }
            }

            const localVx = Number(projectile?.speedX) * 20;
            const localVy = Number(projectile?.speedY) * 20;
            const velocity = api.transformVector(display?.parent?.worldTransform, {
                x: localVx,
                y: localVy
            });
            const speed = Math.hypot(velocity.x, velocity.y);
            const bouncesDone = Array.isArray(projectile?.bounces)
                ? projectile.bounces.length
                : 0;
            const maximumBounces = Number.isFinite(Number(projectile?.timeoutBounceCount))
                ? Number(projectile.timeoutBounceCount)
                : 5;
            const lifetime = Number(projectile?.lifetime) || 10;
            const timeAlive = Number(projectile?.timeAlive) || 0;

            return {
                id,
                type,
                kind: type === 0 ? 'laser' : type === 3 ? 'missile' : 'projectile',
                shooterId: String(projectile?.playerId ?? ''),
                isMine: Boolean(api.playerId) &&
                    String(projectile?.playerId ?? '') === api.playerId,
                x: position?.x ?? null,
                y: position?.y ?? null,
                vx: velocity.x,
                vy: velocity.y,
                speed,
                positionValid: Boolean(position &&
                    api.finite(position.x) && api.finite(position.y)),
                spriteMatchDistance: matchDistance,
                timeAlive,
                timeLeft: Math.max(0, lifetime - timeAlive),
                bouncesDone,
                bouncesLeft: Math.max(0, maximumBounces - bouncesDone),
                deadlyToOwner: Boolean(projectile?.deadlyToOwner),
                stopped: Boolean(projectile?.stopped)
            };
        });
    }

    function rayAabb(x, y, dx, dy, maxDistance, wall, radius) {
        const minX = wall.x - radius;
        const maxX = wall.x + wall.w + radius;
        const minY = wall.y - radius;
        const maxY = wall.y + wall.h + radius;
        let nearX = -Infinity;
        let farX = Infinity;
        let nearY = -Infinity;
        let farY = Infinity;

        if (Math.abs(dx) < 1e-9) {
            if (x < minX || x > maxX) return null;
        } else {
            const a = (minX - x) / dx;
            const b = (maxX - x) / dx;
            nearX = Math.min(a, b);
            farX = Math.max(a, b);
        }

        if (Math.abs(dy) < 1e-9) {
            if (y < minY || y > maxY) return null;
        } else {
            const a = (minY - y) / dy;
            const b = (maxY - y) / dy;
            nearY = Math.min(a, b);
            farY = Math.max(a, b);
        }

        const entry = Math.max(nearX, nearY);
        const exit = Math.min(farX, farY);
        if (entry > exit || exit < 0 || entry < 0.5 || entry > maxDistance) return null;

        const normal = nearX > nearY
            ? { x: dx > 0 ? -1 : 1, y: 0 }
            : { x: 0, y: dy > 0 ? -1 : 1 };
        return { distance: entry, normal };
    }

    function traceProjectile(projectile, walls) {
        if (!projectile.positionValid || projectile.stopped || projectile.speed < 1) {
            return { segments: [], bouncePoints: [] };
        }

        const durationLimit = projectile.type === 3
            ? api.CONFIG.missilePreviewSeconds
            : api.CONFIG.dangerHorizonSeconds;
        const duration = Math.min(durationLimit, projectile.timeLeft);
        if (duration <= 0) return { segments: [], bouncePoints: [] };

        let x = projectile.x;
        let y = projectile.y;
        let vx = projectile.vx;
        let vy = projectile.vy;
        let remainingDistance = projectile.speed * duration;
        let elapsed = 0;

        const maxBounces = Math.min(
            api.CONFIG.maxDrawBounces,
            projectile.bouncesLeft
        );
        const segments = [];
        const bouncePoints = [];

        for (let bounce = 0;
             bounce <= maxBounces && remainingDistance > 1;
             bounce++) {
            const speed = Math.hypot(vx, vy);
            if (speed < 1e-8) break;
            const dx = vx / speed;
            const dy = vy / speed;
            let closest = null;

            for (const wall of walls) {
                const hit = rayAabb(
                    x, y, dx, dy,
                    remainingDistance,
                    wall,
                    projectile.type === 0
                        ? api.CONFIG.laserRadius
                        : api.CONFIG.bulletRadius
                );
                if (hit && (!closest || hit.distance < closest.distance)) {
                    closest = hit;
                }
            }

            const distance = closest ? closest.distance : remainingDistance;
            const endX = x + dx * distance;
            const endY = y + dy * distance;
            segments.push({
                x1: x,
                y1: y,
                x2: endX,
                y2: endY,
                startTime: elapsed,
                endTime: elapsed + distance / speed,
                bounceAtEnd: Boolean(closest)
            });

            x = endX;
            y = endY;
            elapsed += distance / speed;
            remainingDistance -= distance;
            if (!closest) break;

            bouncePoints.push({ x, y });
            if (bounce >= maxBounces) break;
            if (closest.normal.x) vx = -vx;
            if (closest.normal.y) vy = -vy;

            const epsilon = 0.75;
            const reflectedSpeed = Math.hypot(vx, vy);
            x += vx / reflectedSpeed * epsilon;
            y += vy / reflectedSpeed * epsilon;
            remainingDistance -= epsilon;
            elapsed += epsilon / reflectedSpeed;
        }

        return { segments, bouncePoints };
    }

    function analyzeThreats(snapshot) {
        const ownTank = snapshot.tanks.find(tank => tank.isMe);
        if (!ownTank || !ownTank.hitboxes?.length) return [];
        const dangers = [];

        for (const projectile of snapshot.projectiles) {
            projectile.prediction = traceProjectile(projectile, snapshot.walls);
            projectile.isThreat = false;
            if ((projectile.isMine && !projectile.deadlyToOwner) ||
                !projectile.positionValid ||
                projectile.stopped) continue;

            let earliest = null;
            for (const segment of projectile.prediction.segments) {
                for (const hitbox of ownTank.hitboxes) {
                    if (hitbox.type !== 'polygon') continue;
                    const radius = projectile.type === 0
                        ? api.CONFIG.laserRadius
                        : api.CONFIG.bulletRadius;
                    const contact = geom().firstPolygonImpact(
                        segment, hitbox.points, radius
                    );
                    if (contact === null) continue;
                    const time = segment.startTime +
                        contact * (segment.endTime - segment.startTime);
                    const point = {
                        x: segment.x1 + (segment.x2 - segment.x1) * contact,
                        y: segment.y1 + (segment.y2 - segment.y1) * contact
                    };
                    if (!earliest || time < earliest.impactSeconds) {
                        earliest = {
                            projectileId: projectile.id,
                            shooterId: projectile.shooterId,
                            impactSeconds: time,
                            x: point.x,
                            y: point.y,
                            kind: projectile.kind,
                            isMine: projectile.isMine
                        };
                    }
                }
            }
            projectile.isThreat = Boolean(earliest);
            if (earliest) dangers.push(earliest);
        }

        // The laser Graphics object stores the real, currently visible beam polyline.
        for (const laser of snapshot.lasers) {
            if (laser.isMine) {
                const source = snapshot.projectiles.find(p => p.id === laser.id);
                if (source && !source.deadlyToOwner) continue;
            }

            let hit = null;
            for (let i = 1; i < laser.points.length && !hit; i++) {
                const segment = {
                    x1: laser.points[i - 1].x,
                    y1: laser.points[i - 1].y,
                    x2: laser.points[i].x,
                    y2: laser.points[i].y
                };
                for (const hitbox of ownTank.hitboxes) {
                    if (hitbox.type !== 'polygon') continue;
                    const contact = geom().firstPolygonImpact(
                        segment, hitbox.points, api.CONFIG.laserRadius
                    );
                    if (contact !== null) {
                        hit = {
                            projectileId: laser.id,
                            shooterId: laser.shooterId,
                            impactSeconds: 0,
                            x: segment.x1 + (segment.x2 - segment.x1) * contact,
                            y: segment.y1 + (segment.y2 - segment.y1) * contact,
                            kind: 'laser',
                            isMine: laser.isMine
                        };
                        break;
                    }
                }
            }
            if (hit) dangers.push(hit);
        }

        dangers.sort((a, b) => a.impactSeconds - b.impactSeconds);
        return dangers;
    }

    function readProjectiles(state, roundModel) {
        const models = readProjectileModels(roundModel);
        const lasers = readLaserPaths(state, models);
        const projectiles = mapProjectiles(state, roundModel, lasers);
        return { projectiles, lasers };
    }

    api.modules.projectiles = {
        readProjectiles,
        mapProjectiles,
        readLaserPaths,
        traceProjectile,
        analyzeThreats
    };
})();