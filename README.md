# Tank Trouble World Reader

Version 0.8.0 — modular, read-only overlay for Tank Trouble.

## Install

1. Disable the previous monolithic World Reader scripts in Tampermonkey.
2. Refresh Tank Trouble.
3. Install loader/TankTrouble-WorldReader-Loader.user.js as the only active userscript.
4. The loader reads loader/manifest.json and loads the modules in the listed order.

The repository must be public for raw GitHub module URLs to work without authentication.

## Modules

- src/core.js — Phaser discovery, shared helpers and configuration.
- src/identity.js — account ID to active-player matching and tank snapshots.
- src/geometry.js — current Box2D tank hitboxes and collision geometry.
- src/world.js — walls, crates and mines.
- src/projectiles.js — bullets, missiles, laser trail paths and danger prediction.
- src/overlay.js — canvas overlay, labels and HUD.
- src/app.js — frame hook and orchestration.

## Notes

- No keyboard hooks, key tests or input-state interception are used.
- Player identification retains the account/active-player matching method from 0.6.0.
- Hitboxes are calculated from the live Box2D body and transformed with the current Phaser parent matrix. Sprite-position calibration is avoided to reduce render-interpolation lag.
- Missile paths are intentionally short and refreshed each game frame because a missile's direction can change while it is in flight.
- Laser trails are read from the game's own laserGroup line-point arrays.
- The script is read-only. It does not send controls or change game state.

## Repository visibility warning

The previous repository contained large diagnostic captures. Removing files from the current tree does not remove them from old Git commits. Do not change this repository to public until its Git history has also been cleaned, or use a fresh repository with only this modular version.
