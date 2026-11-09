# Changelog

## 1.0.2 — 2026-11-09

- Added server-authoritative multiplayer: five pilots per room, ten live rooms, co-op missions and last-survivor arena matches.
- Added shared loadout lobbies, ready checks, AI takeover, private-session recovery, host migration, spectators, rematches and multiplayer results.
- Friendly fire and aircraft collisions use the shared damage model.
- Replaced the image-based cockpit with a vector cabin and native text instruments shared by single-player and multiplayer; mission objectives move to the pause/tactical map view.
- Optimized network scheduling, terrain preparation and cockpit updates; added bounded queues and local performance diagnostics.
- Hardened translated markup, terrain decoding and loadout configuration; updated dependencies.
- Fixed formation spawn collisions, canyon gate visibility, cockpit console flicker and HUD outline artifacts.
- Validation: 1,039 automated tests passed; Node 24/26 CI, dependency audits and CodeQL passed. A uniform-resolution five-client browser FPS comparison remains incomplete.

## 1.0.0 — 2026-10-25

First stable release of Operation Falcon: Redline.

- WebGPU rendering, metallic cockpit instruments, HUD, clouds and runway lighting.
- Hungarian and English interface, mission reports, replay highlights and optional menu music.
- Training, combat and flight-test missions, including six experimental aircraft and the Taiwan invasion scenario.
- Shared combat, collision, recovery and resupply systems, stationary carriers and navigating destroyers.
- Wind, gusts, turbulence, engine spool, angular inertia, ground effect and transonic drag, with flight-log measurements.
- Improved bomb-store drag and B-52 takeoff configuration; clearer cockpit text and corrected missile visuals.
- Taiwan now has low coasts and a 650 m central airfield plateau.
- Fixed a game-loop crash caused by treating a ballistic missile as an aircraft during collision handling.

Flight-model calibration and measured limitations are documented in [Flight model](docs/flight-model.md).
