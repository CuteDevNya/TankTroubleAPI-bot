# Tank Trouble World Reader

Version 0.8.0 — modular, read-only overlay for Tank Trouble.

## Install

1. Disable the older monolithic World Reader userscripts in Tampermonkey.
2. Open Tank Trouble and create a new Tampermonkey script.
3. Paste the contents of [the module loader](loader/TankTrouble-WorldReader-Loader.user.js).
4. Save the userscript and refresh Tank Trouble.

The loader downloads `loader/manifest.json`, then loads the seven modules in the order listed there. This repository is public, so no GitHub login or token is required.

## Modules

- `src/core.js` — Phaser discovery, shared helpers and configuration.
- `src/identity.js` — account ID to active-player matching and tank snapshots.
- `src/geometry.js` — current Box2D tank hitboxes and collision geometry.
- `src/world.js` — walls, crates and mines.
- `src/projectiles.js` — bullets, missiles, laser trail paths and danger prediction.
- `src/overlay.js` — canvas overlay, labels and HUD.
- `src/app.js` — frame hook and orchestration.

## Notes

- No keyboard hooks, key tests or input-state interception are used.
- Player identification uses the account/active-player matching method retained from version 0.6.0.
- Hitboxes are calculated from the live Box2D body and transformed with the current Phaser parent matrix.
- Missile paths are intentionally short and refreshed each game frame because a missile's direction can change while it is in flight.
- Laser trails are read from the game's own `laserGroup` line-point arrays.
- The script is read-only. It does not send controls or change game state.

## Repository

Public repository: https://github.com/CuteDevNya/TankTroubleAPI-bot
