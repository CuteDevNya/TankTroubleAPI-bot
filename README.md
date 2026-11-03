# Tank Trouble World Reader

Version 0.8.8 — modular, read-only overlay for Tank Trouble.

## Install

1. Disable older monolithic World Reader userscripts and the previous module-loader script.
2. Open the [module loader](loader/TankTrouble-WorldReader-Loader.user.js).
3. Copy its contents into a new Tampermonkey userscript and save it.
4. Refresh Tank Trouble.

The loader uses Tampermonkey's `@require` metadata to retrieve the eight modules from this public repository in dependency order. The overlay is retried until the page body exists. The Phaser hook also discovers the main game from the live Game.update() instance, matching the working 0.6.0 discovery method. The old monolithic API script is not required. No GitHub login or token is required.

## Modules

- `src/core.js` — Phaser discovery, shared helpers and configuration.
- `src/identity.js` — account ID to active-player matching and tank snapshots.
- `src/geometry.js` — current Box2D tank hitboxes and collision geometry.
- `src/world.js` — walls, crates and mines.
- `src/physics.js` — isolated Box2D world copy for standard projectile predictions.
- `src/projectiles.js` — reads bullets, missiles and lasers and computes danger predictions. Standard bullets use the isolated Box2D simulation; the geometric predictor remains a fallback.
- `src/overlay.js` — canvas overlay, labels and HUD.
- `src/app.js` — frame hook and orchestration.

## Notes

- No keyboard hooks, key tests or input-state interception are used.
- Player identification uses account/active-player matching.
- Hitboxes are calculated from the live Box2D body and transformed with the current Phaser parent matrix.
- Missile paths are intentionally short and refreshed each game frame because a missile's direction can change while it is in flight.
- Laser trails are read from the game's own `laserGroup` line-point arrays.
- Standard bullet predictions are stepped in a private Box2D world copied from the live maze fixtures. The player's current Box2D body is also cloned, so imminent direct hits are detected by Box2D contacts rather than only by an approximate polygon-distance check. The live game world is never stepped or modified by the predictor.
- The script is read-only. It does not send controls or change game state.

## Repository

Public repository: https://github.com/CuteDevNya/TankTroubleAPI-bot
