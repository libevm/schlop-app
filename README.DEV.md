# Developer Setup

## Prerequisites

- **Bun** ≥ 1.3 — `bun --version`
- Pre-extracted WZ JSON files in `resourcesv2/` (get them from https://github.com/Jeck-Sparrow-5/MapleWeb)

## WZ Files

The game reads pre-extracted MapleStory `.wz` archives as JSON (`.img.json` files).

Two directories are used:
- `resourcesv2/` — working copy used by the game (edits go here)

Both follow the same structure: `{Archive}.wz/{path}.img.json`  
(e.g. `resourcesv2/Map.wz/Map/Map1/100000001.img.json`)

These files are **not included in the repo** — obtain them from a WZ extraction tool and place them at the project root.

## Running

```bash
bun install

# Terminal 1 — Game server (port 5200)
bun run server

# Terminal 2 — Client with server proxy (port 5173)
bun run client:online

# Or offline only (no server needed)
bun run client:offline
```

## GM Privileges

Grant or revoke GM status for a character:

```bash
bun run make-gm <username>              # toggles GM flag (default DB: ./data/maple.db)
bun run make-gm <username> --db <path>  # specify DB path
```

GM characters can use slash commands in the chat box:

| Command | Description |
|---------|-------------|
| `/help` | List all commands |
| `/mousefly` | Toggle Ctrl+fly mode |
| `/overlay` | Toggle debug overlays (footholds, hitboxes, NPCs, etc.) |
| `/map <id>` | Warp to a map |
| `/teleport <user> <map_id>` | Teleport another player |

## Production

Caddy reverse proxy config

```
{
    email [email]@[domain]
}

website.domain {
    reverse_proxy localhost:5173 {
        header_up Authorization {http.request.header.Authorization}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        # WebSocket support (required for /ws game connection)
        header_up Connection {http.request.header.Connection}
        header_up Upgrade {http.request.header.Upgrade}
    }
}
```

> **Note:** Caddy handles WebSocket upgrades automatically when it sees the
> `Upgrade: websocket` header. The `Connection` and `Upgrade` header forwards
> are included for clarity but Caddy passes them by default. All traffic
> (static files, `/api/*`, and `/ws`) routes through the single reverse proxy
> to the client server on port 5173, which proxies API and WebSocket requests
> to the game server on port 5200.

## Tests

```bash
bun run test          # all workspace tests
cd server && bun test # server tests only
```

## Project Context

Architecture docs and progress snapshots live in `.memory/` — read those before making changes.
