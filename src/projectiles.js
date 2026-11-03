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

    // Sweep a circular projectile against an axis-aligned wall rectangle.
    // The collision boundary is a rounded rectangle: straight face segments
    // plus four circular corner arcs. This is the exact Minkowski sum of the
    // wall rectangle and the projectile circle.
    function rayCircleAabb(x, y, dx, dy, maxDistance, wall, radius) {
        const left = Number(wall.x);
        const top = Number(wall.y);
        const right = left + Number(wall.w);
        const bottom = top + Number(wall.h);
        const r = Math.max(0, Number(radius) || 0);
        const minDistance = 0.02;
        const tolerance = 1e-7;
        let closest = null;

        if (![left, top, right, bottom, x, y, dx, dy, maxDistance].every(Number.isFinite) ||
            maxDistance <= minDistance) {
            return null;
        }

        function consider(distance, normalX, normalY, feature) {
            if (!Number.isFinite(distance) ||
                distance <= minDistance ||
                distance > maxDistance) return;

            const normalLength = Math.hypot(normalX, normalY);
            if (normalLength < 1e-9) return;
            normalX /= normalLength;
            normalY /= normalLength;

            // A collision only changes the path while the projectile moves
            // into the surface. Tangential or separating contacts are ignored.
            if (dx * normalX + dy * normalY >= -1e-8) return;

            if (!closest || distance < closest.distance) {
                closest = {
                    distance,
                    normal: { x: normalX, y: normalY },
                    feature
                };
            }
        }

        // Four straight faces. Their valid spans stop at the original
        // rectangle corners; the round corner arcs are checked separately.
        if (dx > 1e-10) {
            const distance = (left - r - x) / dx;
            const hitY = y + dy * distance;
            if (hitY >= top - tolerance && hitY <= bottom + tolerance) {
                consider(distance, -1, 0, 'left');
            }
        } else if (dx < -1e-10) {
            const distance = (right + r - x) / dx;
            const hitY = y + dy * distance;
            if (hitY >= top - tolerance && hitY <= bottom + tolerance) {
                consider(distance, 1, 0, 'right');
            }
        }

        if (dy > 1e-10) {
            const distance = (top - r - y) / dy;
            const hitX = x + dx * distance;
            if (hitX >= left - tolerance && hitX <= right + tolerance) {
                consider(distance, 0, -1, 'top');
            }
        } else if (dy < -1e-10) {
            const distance = (bottom + r - y) / dy;
            const hitX = x + dx * distance;
            if (hitX >= left - tolerance && hitX <= right + tolerance) {
                consider(distance, 0, 1, 'bottom');
            }
        }

        // Rounded corners: solve |position + direction * t - corner| = radius.
        // Restrict each circle to its outer quadrant so only the quarter-circle
        // belonging to this rectangle corner can produce a collision.
        if (r > 0) {
            const corners = [
                { x: left,  y: top,    sx: -1, sy: -1, name: 'top-left' },
                { x: right, y: top,    sx: 1,  sy: -1, name: 'top-right' },
                { x: left,  y: bottom, sx: -1, sy: 1,  name: 'bottom-left' },
                { x: right, y: bottom, sx: 1,  sy: 1,  name: 'bottom-right' }
            ];

            for (const corner of corners) {
                const mx = x - corner.x;
                const my = y - corner.y;
                const projected = mx * dx + my * dy;
                const constant = mx * mx + my * my - r * r;
                const discriminant = projected * projected - constant;
                if (discriminant < -tolerance) continue;

                const distance = -projected - Math.sqrt(Math.max(0, discriminant));
                if (distance <= minDistance || distance > maxDistance) continue;

                const hitX = x + dx * distance;
                const hitY = y + dy * distance;
                if ((hitX - corner.x) * corner.sx < -tolerance ||
                    (hitY - corner.y) * corner.sy < -tolerance) {
                    continue;
                }

                const normalX = (hitX - corner.x) / r;
                const normalY = (hitY - corner.y) / r;
                consider(distance, normalX, normalY, corner.name);
            }
        }

        return closest;
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
                const hit = rayCircleAabb(
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
            // Reflect against the actual contact normal. At a rounded corner
            // the normal is diagonal, so both velocity components may change.
            const normalVelocity = vx * closest.normal.x + vy * closest.normal.y;
            vx -= 2 * normalVelocity * closest.normal.x;
            vy -= 2 * normalVelocity * closest.normal.y;

            const epsilon = 0.35;
            const reflectedSpeed = Math.hypot(vx, vy);
            // Move out of the contact surface along its normal. This avoids an
            // immediate duplicate hit without biasing the reflected direction.
            x += closest.normal.x * epsilon;
            y += closest.normal.y * epsilon;
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