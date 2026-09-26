# PoE2 Map Tracker

Path of Exile 2 endgame tracker: which waystone (tier + mods) and tablets went into each map, how long it took, deaths, and loot valued in Divine/Exalted via poe.ninja.

## How it gets data (GGG ToS-safe)

| Data | Source |
| --- | --- |
| Map enter/exit, area level, map time, deaths | Polls `Client.txt` (log reading is allowed by GGG's third-party policy) |
| Waystone / tablet mods | Clipboard: hover item in-game, press `Ctrl+Alt+C` (or `Ctrl+C`) |
| Loot | Quick buttons in the app; optional `Ctrl+C` on a currency stack |
| Prices | poe.ninja PoE2 exchange API (quoted in Divine), refreshed every 30 min |
| Screenshots | Global hotkey (default `Ctrl+Shift+S`), attached to the current/next map |

## Overlay

A small always-on-top panel (top-right by default, draggable, position remembered) shows the current map, timer, deaths, waystone/tablets and the first 4 loot buttons. Toggle with `Ctrl+Shift+O`. It never takes keyboard focus from the game. Requires the game in **Windowed Fullscreen**; exclusive fullscreen hides overlays.

No memory reading, no input automation, no game file access. The app never sends keys to the game.

## Windows

`release/PoE2-Map-Tracker-<version>-portable.exe` runs without install; `PoE2 Map Tracker Setup <version>.exe` installs.
Unsigned build, so SmartScreen will warn: "More info" → "Run anyway".

Data lives in `%APPDATA%\poe2-map-tracker\tracker-data.json` (+ `screenshots\`).

## Development

```bash
npm install
npm test          # parser + tracker tests
npm run typecheck
npm start         # build and run Electron
npm run dist:win  # Windows portable + NSIS installer into release/
```

Test hooks: `POE2T_DATA=<dir>` (data dir), `POE2T_LOG=<file>` (force log path), `POE2T_SMOKE=<png>` (capture window and quit).
