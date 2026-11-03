(() => {
    'use strict';

    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before physics.js');

    const PIXELS_PER_METER = 20;
    const STANDARD_BULLET_TYPES = new Set([-1, 1, 2, 5]);

    let sourceWorldRef = null;
    let cachedWorld = null;
    let cachedStaticCount = -1;
    let physicsStatus = 'Waiting for Box2D world';
    let lastError = '';

    function bodyType(body) {
        try {
            const type = body?.GetType?.();
            return Number.isFinite(type) ? type : Number(body?.m_type);
        } catch (_) {
            return Number(body?.m_type);
        }
    }

    function bodyPosition(body) {
        try {
            const position = body?.GetPosition?.() || body?.m_xf?.position;
            if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) {
                return { x: position.x, y: position.y };
            }
        } catch (_) {}
        return null;
    }

    function bodyVelocity(body) {
        try {
            const velocity = body?.GetLinearVelocity?.() || body?.m_linearVelocity;
            if (Number.isFinite(velocity?.x) && Number.isFinite(velocity?.y)) {
                return { x: velocity.x, y: velocity.y };
            }
        } catch (_) {}
        return { x: 0, y: 0 };
    }

    function bodyAngle(body) {
        try {
            const angle = body?.GetAngle?.();
            if (Number.isFinite(angle)) return angle;
        } catch (_) {}
        return Number(body?.m_sweep?.a) || 0;
    }

    function allBodies(world) {
        const bodies = [];
        let body = world?.GetBodyList?.() || world?.m_bodyList || null;
        let guard = 0;
        while (body && guard++ < 2000) {
            bodies.push(body);
            body = body.GetNext?.() || body.m_next || null;
        }
        return bodies;
    }

    function allFixtures(body) {
        const fixtures = [];
        let fixture = body?.GetFixtureList?.() || body?.m_fixtureList || null;
        let guard = 0;
        while (fixture && guard++ < 100) {
            fixtures.push(fixture);
            fixture = fixture.GetNext?.() || fixture.m_next || null;
        }
        return fixtures;
    }

    function makeVector(template, x, y) {
        const Vector = template?.constructor;
        if (typeof Vector !== 'function' || Vector === Object) {
            throw new Error('Box2D vector constructor is unavailable');
        }
        return new Vector(x, y);
    }

    function fixtureNumber(fixture, getter, field, fallback) {
        try {
            const value = typeof fixture?.[getter] === 'function'
                ? fixture[getter]()
                : fixture?.[field];
            return Number.isFinite(Number(value)) ? Number(value) : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function copyFilter(fixture) {
        let source = null;
        try {
            source = fixture?.GetFilterData?.() || fixture?.m_filter || null;
        } catch (_) {}

        if (source?.Copy) return source.Copy();

        const Filter = source?.constructor;
        const result = typeof Filter === 'function' && Filter !== Object
            ? new Filter()
            : {};
        result.categoryBits = Number(source?.categoryBits) || 1;
        result.maskBits = Number.isFinite(Number(source?.maskBits))
            ? Number(source.maskBits)
            : 0xffff;
        result.groupIndex = Number(source?.groupIndex) || 0;
        return result;
    }

    function copyBody(sourceBody, targetWorld, forceStatic = false) {
        const position = bodyPosition(sourceBody);
        if (!position) throw new Error('A Box2D body has no readable position');

        const velocity = bodyVelocity(sourceBody);
        const vectorTemplate = sourceBody.GetPosition?.() ||
            sourceBody.m_xf?.position;

        const definition = {
            type: forceStatic ? 0 : bodyType(sourceBody),
            position: makeVector(vectorTemplate, position.x, position.y),
            angle: bodyAngle(sourceBody),
            linearVelocity: makeVector(
                vectorTemplate,
                forceStatic ? 0 : velocity.x,
                forceStatic ? 0 : velocity.y
            ),
            angularVelocity: forceStatic ? 0 :
                Number(sourceBody.GetAngularVelocity?.()) ||
                Number(sourceBody.m_angularVelocity) || 0,
            linearDamping: Number(sourceBody.GetLinearDamping?.()) ||
                Number(sourceBody.m_linearDamping) || 0,
            angularDamping: Number(sourceBody.GetAngularDamping?.()) ||
                Number(sourceBody.m_angularDamping) || 0,
            allowSleep: sourceBody.IsSleepingAllowed?.() ?? true,
            awake: sourceBody.IsAwake?.() ?? true,
            fixedRotation: sourceBody.IsFixedRotation?.() ?? false,
            bullet: sourceBody.IsBullet?.() ?? false,
            active: sourceBody.IsActive?.() ?? true,
            userData: null
        };

        const targetBody = targetWorld.CreateBody(definition);
        if (!targetBody) throw new Error('Box2D could not clone a body');

        try {
            for (const sourceFixture of allFixtures(sourceBody)) {
                const sourceShape = sourceFixture.GetShape?.() ||
                    sourceFixture.m_shape;
                if (!sourceShape || typeof sourceShape.Copy !== 'function') {
                    throw new Error('A Box2D maze shape cannot be copied');
                }

                targetBody.CreateFixture({
                    shape: sourceShape.Copy(),
                    userData: null,
                    density: fixtureNumber(
                        sourceFixture, 'GetDensity', 'm_density', 0
                    ),
                    friction: fixtureNumber(
                        sourceFixture, 'GetFriction', 'm_friction', 0
                    ),
                    restitution: fixtureNumber(
                        sourceFixture, 'GetRestitution', 'm_restitution', 0
                    ),
                    isSensor: sourceFixture.IsSensor?.() ??
                        Boolean(sourceFixture.m_isSensor),
                    filter: copyFilter(sourceFixture)
                });
            }
        } catch (error) {
            try { targetWorld.DestroyBody(targetBody); } catch (_) {}
            throw error;
        }

        return targetBody;
    }

    function buildWorldCopy(sourceWorld, sourceBodies) {
        const gravity = sourceWorld.GetGravity?.() ||
            sourceWorld.m_gravity || { x: 0, y: 0 };
        const World = sourceWorld.constructor;

        if (typeof World !== 'function' || World === Object) {
            throw new Error('Box2D world constructor is unavailable');
        }

        const worldCopy = new World(
            makeVector(gravity, Number(gravity.x) || 0, Number(gravity.y) || 0),
            sourceWorld.m_allowSleep !== false
        );

        for (const key of [
            'm_warmStarting',
            'm_continuousPhysics',
            'm_subStepping'
        ]) {
            if (key in sourceWorld) worldCopy[key] = sourceWorld[key];
        }

        let mazeBodyCount = 0;
        for (const sourceBody of sourceBodies) {
            const type = bodyType(sourceBody);
            if (type !== 0 && type !== 1) continue;
            copyBody(sourceBody, worldCopy, type === 0);
            mazeBodyCount++;
        }

        if (mazeBodyCount === 0) {
            throw new Error('No static or kinematic maze bodies were found');
        }

        return { world: worldCopy, mazeBodyCount };
    }

    function getWorldCopy(sourceWorld, sourceBodies) {
        const staticBodies = sourceBodies.filter(body => bodyType(body) === 0);
        const kinematicBodies = sourceBodies.filter(body => bodyType(body) === 1);

        if (cachedWorld &&
            sourceWorldRef === sourceWorld &&
            cachedStaticCount === staticBodies.length &&
            kinematicBodies.length === 0) {
            return cachedWorld;
        }

        const built = buildWorldCopy(sourceWorld, sourceBodies);
        sourceWorldRef = sourceWorld;
        cachedStaticCount = built.mazeBodyCount;
        cachedWorld = kinematicBodies.length === 0 ? built.world : null;
        return built.world;
    }

    function readStepSettings(sourceWorld) {
        const step = sourceWorld?.m_contactSolver?.m_step ||
            sourceWorld?.m_step || null;
        const inverseDt = Number(sourceWorld?.m_inv_dt0);

        return {
            dt: inverseDt > 0 ? 1 / inverseDt : 1 / 125,
            velocityIterations: Number(
                step?.velocityIterations ?? step?.m_velocityIterations
            ) || 8,
            positionIterations: Number(
                step?.positionIterations ?? step?.m_positionIterations
            ) || 3
        };
    }

    function toScreenPoint(matrix, position) {
        const point = {
            x: position.x * PIXELS_PER_METER,
            y: position.y * PIXELS_PER_METER
        };
        return matrix ? api.transformPoint(matrix, point) : point;
    }

    function directionChange(before, after) {
        const beforeSpeed = Math.hypot(before.x, before.y);
        const afterSpeed = Math.hypot(after.x, after.y);
        if (beforeSpeed < 1e-6 || afterSpeed < 1e-6) return 0;

        return Math.atan2(
            Math.abs(before.x * after.y - before.y * after.x),
            before.x * after.x + before.y * after.y
        );
    }

    function simulateProjectiles(sourceWorld, projectiles) {
        if (!sourceWorld || typeof sourceWorld.Step !== 'function') {
            physicsStatus = 'Fallback · Box2D world unavailable';
            return null;
        }

        const eligible = projectiles.filter(projectile =>
            STANDARD_BULLET_TYPES.has(projectile.type) &&
            projectile.positionValid &&
            !projectile.stopped &&
            projectile.timeLeft > 0 &&
            projectile._physicsBody
        );

        if (!eligible.length) {
            physicsStatus = 'Box2D · no standard bullets';
            return {};
        }

        const sourceBodies = allBodies(sourceWorld);
        const dynamicCopies = [];
        const states = new Map();
        let worldCopy = null;

        try {
            worldCopy = getWorldCopy(sourceWorld, sourceBodies);
            const settings = readStepSettings(sourceWorld);

            for (const projectile of eligible) {
                const body = copyBody(projectile._physicsBody, worldCopy);
                dynamicCopies.push(body);

                const sourcePosition = bodyPosition(projectile._physicsBody);
                if (!sourcePosition) continue;

                const start = toScreenPoint(
                    projectile._transformMatrix,
                    sourcePosition
                );

                states.set(projectile.id, {
                    body,
                    projectile,
                    segmentStart: start,
                    segmentStartTime: 0,
                    previousVelocity: bodyVelocity(body),
                    segments: [],
                    bouncePoints: [],
                    bounceCount: 0,
                    maxBounces: Math.max(0, Math.min(
                        api.CONFIG.maxDrawBounces,
                        Number(projectile.bouncesLeft) || 0
                    )),
                    duration: Math.min(
                        api.CONFIG.dangerHorizonSeconds,
                        projectile.timeLeft
                    ),
                    done: false
                });
            }

            const totalDuration = Math.max(
                0,
                ...Array.from(states.values(), state => state.duration)
            );
            let elapsed = 0;

            while (elapsed < totalDuration - 1e-8) {
                const dt = Math.min(settings.dt, totalDuration - elapsed);
                worldCopy.Step(
                    dt,
                    settings.velocityIterations,
                    settings.positionIterations
                );
                worldCopy.ClearForces?.();
                elapsed += dt;

                for (const state of states.values()) {
                    if (state.done) continue;

                    const velocity = bodyVelocity(state.body);
                    const turn = directionChange(state.previousVelocity, velocity);
                    const beforeSpeed = Math.hypot(
                        state.previousVelocity.x,
                        state.previousVelocity.y
                    );
                    const afterSpeed = Math.hypot(velocity.x, velocity.y);
                    const speedDelta = Math.abs(afterSpeed - beforeSpeed);

                    // The live bullet fixture has zero friction and full
                    // restitution. A change in velocity identifies a contact;
                    // the cloned Box2D solver has already calculated its normal.
                    const bounced = turn > 0.001 ||
                        speedDelta > Math.max(0.01, beforeSpeed * 0.001);

                    if (bounced) {
                        const position = bodyPosition(state.body);
                        if (position) {
                            const point = toScreenPoint(
                                state.projectile._transformMatrix,
                                position
                            );
                            const bounceTime = Math.min(elapsed, state.duration);

                            state.segments.push({
                                x1: state.segmentStart.x,
                                y1: state.segmentStart.y,
                                x2: point.x,
                                y2: point.y,
                                startTime: state.segmentStartTime,
                                endTime: bounceTime,
                                bounceAtEnd: true
                            });
                            state.bouncePoints.push(point);
                            state.segmentStart = point;
                            state.segmentStartTime = bounceTime;
                            state.bounceCount++;

                            if (state.bounceCount >= state.maxBounces) {
                                state.done = true;
                            }
                        }
                    }

                    if (elapsed >= state.duration) state.done = true;
                    state.previousVelocity = velocity;
                }
            }

            const predictions = {};
            for (const state of states.values()) {
                if (!state.done) {
                    const position = bodyPosition(state.body);
                    if (position) {
                        const point = toScreenPoint(
                            state.projectile._transformMatrix,
                            position
                        );
                        if (Math.hypot(
                            point.x - state.segmentStart.x,
                            point.y - state.segmentStart.y
                        ) > 0.1) {
                            state.segments.push({
                                x1: state.segmentStart.x,
                                y1: state.segmentStart.y,
                                x2: point.x,
                                y2: point.y,
                                startTime: state.segmentStartTime,
                                endTime: state.duration,
                                bounceAtEnd: false
                            });
                        }
                    }
                }

                predictions[state.projectile.id] = {
                    segments: state.segments,
                    bouncePoints: state.bouncePoints,
                    source: 'box2d-clone'
                };
            }

            physicsStatus = 'Box2D simulation · ' + cachedStaticCount + ' maze bodies';
            lastError = '';
            return predictions;
        } catch (error) {
            lastError = error?.message || String(error);
            physicsStatus = 'Fallback · ' + lastError;
            console.warn('[TT World Reader] Box2D simulation unavailable:', error);
            return null;
        } finally {
            for (const body of dynamicCopies) {
                try { worldCopy?.DestroyBody?.(body); } catch (_) {}
            }
        }
    }

    api.modules.physics = {
        simulateProjectiles,
        getStatus: () => physicsStatus,
        getLastError: () => lastError
    };
})();