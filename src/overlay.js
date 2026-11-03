(() => {
    'use strict';
    const api = window.TTWR;
    if (!api) throw new Error('TTWR core must load before overlay.js');

    const IDS = {
        canvas: 'tt-world-reader-overlay',
        panel: 'tt-world-reader-panel',
        status: 'tt-world-reader-status',
        stats: 'tt-world-reader-stats'
    };

    let canvas = null;
    let context = null;
    let panel = null;

    function ensure() {
        if (!document.body) return false;
        if (!canvas) {
            document.getElementById(IDS.canvas)?.remove();
            canvas = document.createElement('canvas');
            canvas.id = IDS.canvas;
            Object.assign(canvas.style, {
                position: 'fixed',
                left: '0',
                top: '0',
                width: '1px',
                height: '1px',
                pointerEvents: 'none',
                zIndex: '2147483000'
            });
            document.body.appendChild(canvas);
            context = canvas.getContext('2d', { alpha: true });
        }
        if (!panel) createPanel();
        return true;
    }

    function createPanel() {
        document.getElementById(IDS.panel)?.remove();
        panel = document.createElement('div');
        panel.id = IDS.panel;
        Object.assign(panel.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            width: '310px',
            padding: '10px 12px',
            color: '#e8edf5',
            background: 'rgba(12,16,24,.92)',
            border: '1px solid rgba(150,170,200,.35)',
            borderRadius: '9px',
            boxShadow: '0 6px 24px rgba(0,0,0,.35)',
            zIndex: '2147483001',
            font: '12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace',
            backdropFilter: 'blur(8px)'
        });

        const title = document.createElement('div');
        title.textContent = 'TANK TROUBLE / WORLD READER 0.8.6';
        Object.assign(title.style, {
            fontWeight: '700',
            fontSize: '11px',
            letterSpacing: '.3px',
            color: '#8bd5ff',
            marginBottom: '6px'
        });

        const statusLine = document.createElement('div');
        statusLine.id = IDS.status;
        statusLine.textContent = 'Searching for main game…';
        statusLine.style.color = '#ffd166';
        statusLine.style.marginBottom = '7px';

        const stats = document.createElement('div');
        stats.id = IDS.stats;
        stats.textContent = 'No data yet';
        stats.style.whiteSpace = 'pre-line';
        stats.style.color = '#d6deeb';

        const controls = document.createElement('div');
        Object.assign(controls.style, {
            display: 'flex',
            gap: '6px',
            marginTop: '9px',
            flexWrap: 'wrap'
        });

        function makeButton(label, action) {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = label;
            Object.assign(element.style, {
                border: '1px solid #526174',
                borderRadius: '5px',
                padding: '4px 7px',
                color: '#edf4ff',
                background: '#263447',
                cursor: 'pointer',
                font: '11px ui-monospace, monospace'
            });
            element.addEventListener('click', action);
            return element;
        }

        controls.append(
            makeButton('Overlay ON', event => {
                api.CONFIG.showWalls = !api.CONFIG.showWalls;
                api.CONFIG.showTanks = !api.CONFIG.showTanks;
                api.CONFIG.showItems = !api.CONFIG.showItems;
                api.CONFIG.showProjectiles = !api.CONFIG.showProjectiles;
                event.currentTarget.textContent =
                    api.CONFIG.showWalls ? 'Overlay ON' : 'Overlay OFF';
            }),
            makeButton('Paths ON', event => {
                api.CONFIG.showTrajectories = !api.CONFIG.showTrajectories;
                event.currentTarget.textContent =
                    api.CONFIG.showTrajectories ? 'Paths ON' : 'Paths OFF';
            }),
            makeButton('Hide HUD', () => { panel.style.display = 'none'; })
        );

        panel.append(title, statusLine, stats, controls);
        document.body.appendChild(panel);
    }

    function status(message, warning = false) {
        const element = document.getElementById(IDS.status);
        if (!element) return;
        element.textContent = message;
        element.style.color = warning ? '#ffb86b' : '#8ee6a8';
    }

    function updateHud(snapshot) {
        if (!panel || !snapshot) return;
        const stats = document.getElementById(IDS.stats);
        if (!stats) return;

        const own = snapshot.tanks.find(tank => tank.isMe);
        const enemyCount = snapshot.tanks.filter(tank => !tank.isMe).length;
        const nearestDanger = snapshot.dangers[0] || null;
        const missiles = snapshot.projectiles.filter(p => p.type === 3).length;

        const lines = [
            'PLAYER:      ' + (snapshot.myPlayerId || 'not identified'),
            'ID SOURCE:   ' + snapshot.playerDetectionMethod,
            'YOU:         ' + (own ? 'alive' : snapshot.myPlayerId ? 'inactive / dead' : 'unknown'),
            'ENEMIES:     ' + (snapshot.myPlayerId ? enemyCount : '?'),
            'PROJECTILES: ' + snapshot.projectiles.length,
            'LASERS:      ' + snapshot.lasers.length,
            'MISSILES:    ' + missiles,
            'WALLS:       ' + snapshot.walls.length,
            'CRATES:      ' + snapshot.crates.length,
            'MINES:       ' + snapshot.mines.length,
            'UPDATE:      ' + snapshot.readMs.toFixed(1) + ' ms',
            'PHYSICS:     ' + (api.modules.physics?.getStatus?.() || 'not loaded'),
            'DANGER:      ' + (nearestDanger
                ? nearestDanger.kind.toUpperCase() + ' IN ' +
                    nearestDanger.impactSeconds.toFixed(2) + 's'
                : 'NO HIT PREDICTED')
        ];
        stats.textContent = lines.join('\n');

        let message = 'Connected · read-only';
        let warning = false;
        if (!snapshot.myPlayerId) {
            message = 'Connected · waiting for account match';
            warning = true;
        }
        if (nearestDanger &&
            nearestDanger.impactSeconds <= api.CONFIG.dangerWarningSeconds) {
            message = 'DANGER · ' + nearestDanger.kind +
                ' in ' + nearestDanger.impactSeconds.toFixed(2) + 's';
            warning = true;
        }
        status(message, warning);
    }

    function syncCanvas(game, gameCanvas) {
        if (!canvas || !context || !game || !gameCanvas) return false;
        const rect = gameCanvas.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
            canvas.style.display = 'none';
            return false;
        }

        canvas.style.display = 'block';
        canvas.style.left = rect.left + 'px';
        canvas.style.top = rect.top + 'px';
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        const dpr = Math.max(1, Number(window.devicePixelRatio) || 1);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        context.setTransform(
            dpr * rect.width / Number(game.width),
            0,
            0,
            dpr * rect.height / Number(game.height),
            0,
            0
        );
        return true;
    }

    function drawWalls(walls) {
        context.save();
        context.fillStyle = 'rgba(145,160,180,.10)';
        context.strokeStyle = 'rgba(160,180,205,.50)';
        context.lineWidth = 1.5;
        for (const wall of walls) {
            context.fillRect(wall.x, wall.y, wall.w, wall.h);
            context.strokeRect(wall.x, wall.y, wall.w, wall.h);
        }
        context.restore();
    }

    function drawItems(crates, mines) {
        context.save();
        for (const crate of crates) {
            const b = crate.bounds;
            context.strokeStyle = '#ffd166';
            context.lineWidth = 2;
            context.setLineDash([5, 3]);
            context.strokeRect(b.x, b.y, b.w, b.h);
            context.setLineDash([]);
            context.fillStyle = '#ffd166';
            context.font = '10px monospace';
            context.fillText('CRATE', b.x, b.y - 4);
        }
        for (const mine of mines) {
            context.strokeStyle = '#ff9955';
            context.lineWidth = 2;
            context.beginPath();
            context.arc(mine.x, mine.y, Math.max(7, Math.min(
                mine.bounds.w, mine.bounds.h
            ) / 2), 0, Math.PI * 2);
            context.stroke();
        }
        context.restore();
    }

    function drawTanks(tanks, dangers) {
        context.save();
        const ownDanger = dangers.some(danger =>
            danger.impactSeconds <= api.CONFIG.dangerWarningSeconds
        );

        for (const tank of tanks) {
            const color = tank.isMe
                ? (ownDanger ? '#ff304b' : '#39e6b0')
                : '#ff6482';

            for (const hitbox of tank.hitboxes || []) {
                if (hitbox.type !== 'polygon' || hitbox.points.length < 3) continue;
                context.beginPath();
                context.moveTo(hitbox.points[0].x, hitbox.points[0].y);
                for (let i = 1; i < hitbox.points.length; i++) {
                    context.lineTo(hitbox.points[i].x, hitbox.points[i].y);
                }
                context.closePath();
                context.fillStyle = tank.isMe
                    ? 'rgba(57,230,176,.16)'
                    : 'rgba(255,100,130,.14)';
                context.strokeStyle = color;
                context.lineWidth = 2;
                context.fill();
                context.stroke();
            }

            if (!tank.hitboxes?.length && tank.bounds) {
                context.strokeStyle = '#ffcc66';
                context.lineWidth = 1;
                context.setLineDash([4, 4]);
                context.strokeRect(
                    tank.bounds.x, tank.bounds.y,
                    tank.bounds.w, tank.bounds.h
                );
                context.setLineDash([]);
            }

            context.font = 'bold 13px monospace';
            context.fillStyle = color;
            context.fillText(tank.isMe ? 'YOU' : 'ENEMY', tank.x + 12, tank.y - 30);
        }
        context.restore();
    }

    function drawProjectiles(projectiles, walls, dangers) {
        context.save();
        const dangerousIds = new Set(dangers.map(item => item.projectileId));

        for (const projectile of projectiles) {
            if (!projectile.positionValid) continue;
            const dangerous = dangerousIds.has(projectile.id);
            const color = dangerous
                ? '#ff4055'
                : projectile.type === 3
                    ? '#d18cff'
                    : projectile.type === 0
                        ? '#72e6c5'
                        : projectile.isMine
                            ? '#62d6ff'
                            : '#ffb454';

            const prediction = projectile.prediction ||
                api.modules.projectiles.traceProjectile(projectile, walls);

            if (api.CONFIG.showTrajectories && prediction.segments.length) {
                context.strokeStyle = color;
                context.lineWidth = dangerous ? 3 : 2;
                context.globalAlpha = .85;
                context.setLineDash([7, 5]);
                context.beginPath();
                prediction.segments.forEach((segment, index) => {
                    if (index === 0) context.moveTo(segment.x1, segment.y1);
                    context.lineTo(segment.x2, segment.y2);
                });
                context.stroke();
                context.setLineDash([]);
                context.globalAlpha = 1;

                for (const point of prediction.bouncePoints) {
                    context.beginPath();
                    context.arc(point.x, point.y, 4, 0, Math.PI * 2);
                    context.stroke();
                }
            }

            context.strokeStyle = color;
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(projectile.x, projectile.y,
                projectile.type === 3 ? 7 : 5.5, 0, Math.PI * 2);
            context.stroke();
            context.fillStyle = color;
            context.beginPath();
            context.arc(projectile.x, projectile.y, 1.8, 0, Math.PI * 2);
            context.fill();
        }

        for (const danger of dangers) {
            context.strokeStyle = '#ff304b';
            context.lineWidth = 3;
            context.beginPath();
            context.arc(danger.x, danger.y, 10, 0, Math.PI * 2);
            context.stroke();
            context.beginPath();
            context.moveTo(danger.x - 6, danger.y - 6);
            context.lineTo(danger.x + 6, danger.y + 6);
            context.moveTo(danger.x + 6, danger.y - 6);
            context.lineTo(danger.x - 6, danger.y + 6);
            context.stroke();
        }
        context.restore();
    }

    function drawLasers(lasers) {
        context.save();
        for (const laser of lasers) {
            if (laser.points.length < 2) continue;
            context.beginPath();
            context.moveTo(laser.points[0].x, laser.points[0].y);
            for (let i = 1; i < laser.points.length; i++) {
                context.lineTo(laser.points[i].x, laser.points[i].y);
            }
            context.strokeStyle = laser.color;
            context.lineWidth = Math.max(1, laser.width);
            context.lineCap = 'round';
            context.lineJoin = 'round';
            context.globalAlpha = Math.max(0, Math.min(1, laser.alpha));
            context.setLineDash([]);
            context.stroke();
        }
        context.restore();
    }

    function render(snapshot) {
        if (!ensure() || !syncCanvas(api.game, api.gameCanvas)) return;
        context.clearRect(0, 0, snapshot.game.width, snapshot.game.height);
        if (api.CONFIG.showWalls) drawWalls(snapshot.walls);
        if (api.CONFIG.showItems) drawItems(snapshot.crates, snapshot.mines);
        if (api.CONFIG.showTanks) drawTanks(snapshot.tanks, snapshot.dangers);
        if (api.CONFIG.showProjectiles) {
            drawProjectiles(snapshot.projectiles, snapshot.walls, snapshot.dangers);
            drawLasers(snapshot.lasers);
        }
        updateHud(snapshot);
    }

    function dispose() {
        canvas?.remove();
        panel?.remove();
        canvas = null;
        panel = null;
        context = null;
    }

    api.modules.overlay = { ensure, status, render, dispose };
})();