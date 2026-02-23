# Shlop

A MapleStory web client and game server, **entirely vibe coded** with AI.

Vanilla JS canvas client, Bun game server, SQLite persistence. No frameworks, no bundler in dev.

## Running

Requires **Bun** ≥ 1.3 and pre-extracted WZ XML assets in `resourcesv3/`.

```bash
bun install

# Terminal 1 — game server (port 5200)
bun run server

# Terminal 2 — client dev server (port 5173)
bun run client
```

That's it. Open `http://localhost:5173`.

### Production

```bash
bun run client:prod   # minified + gzipped, no hot-reload
```

### Admin Dashboard

```bash
bun run create-gm <username> <password>   # create GM account first
bun run client:admin-ui                    # opens on port 5174
```

### WZ Editor

```bash
bun run client:wzeditor          # opens on port 5175
```

Browser-based WZ file editor — open `.wz` binaries or Harepacker XML, browse/edit the tree, export as XML or repack as `.wz`. Fully client-side, no server logic.

### GM Commands

In-game chat with a GM character:

- `/map <id>` — warp to map
- `/teleport <user> <map_id>` — teleport another player

## Layout

```
client/web/        Vanilla JS browser client (12 modules, canvas 2D)
server/src/        Bun game server (REST + WebSocket + SQLite)
client/admin-ui/   Admin dashboard (GM-only DB browser)
client/wzeditor/   Browser-based WZ file editor (open/edit/export/repack)
resourcesv3/       Extracted WZ XML game assets (Harepacker Classic XML format)
.memory/            Architecture docs (agent context)
```

## Tests

```bash
cd server && bun test src/
```

## Disclaimer

All graphics and sound assets are rights reserved to Nexon. This open source project is for research and educational purposes only, with no commercial intent.

## Acknowledgements

- [ryantpayton/MapleStory-Client](https://github.com/ryantpayton/MapleStory-Client) — C++ reference client used for physics, rendering, and protocol parity
- [Jeck-Sparrow-5/MapleWeb](https://github.com/Jeck-Sparrow-5/MapleWeb) — inspiration for a web-based MapleStory client
