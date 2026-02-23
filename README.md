# Shlop

MapleStory web client + game server.

## Prerequisites

- **Bun** ≥ 1.3 — `bun --version`
- Pre-extracted WZ JSON files in `resourcesv2/` (from a WZ extraction tool)
- Unix-like shell (Linux/macOS)

## Setup

```bash
git clone <repo-url>
cd shlop-app
bun install

# If using Git LFS for resource files:
git lfs install
git lfs pull
```

## Running

```bash
# Terminal 1 — Game server (port 5200)
bun run server

# Terminal 2 — Client with server proxy (port 5173)
bun run client:online

# Admin dashboard (port 5174, requires GM account)
bun run client:admin-ui
```

### Hot reload (dev mode)

`bun run client:online` watches `client/web/` for `.js`, `.css`, and `.html` changes:
- **CSS changes** → hot-swapped without page reload (stylesheet link cache-bust)
- **JS / HTML changes** → full page reload

Hot reload is automatic in dev mode. Disabled in `--prod`.

### Production mode

```bash
bun run client:online:prod   # minified JS + gzipped assets (no hot-reload)
```

### Caddy reverse proxy

```
website.domain {
    reverse_proxy localhost:5173 {
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

## GM Accounts

```bash
# Create or update a GM account
bun run create-gm <username> <password>
bun run create-gm <username> <password> --db ./server/data/maple.db

# Toggle GM flag on an existing character
bun run make-gm <username>
```

GM characters can use slash commands in chat:

| Command | Description |
|---------|-------------|
| `/map <id>` | Warp to a map |
| `/teleport <user> <map_id>` | Teleport another player |

## Repository Layout

```
client/
  web/           # Browser client (app.js, index.html, styles)
  admin-ui/      # Admin dashboard UI
  src/styles/    # Tailwind CSS source
server/
  src/           # Game server (Bun + SQLite)
tools/
  dev/           # Dev servers (online client, admin UI)
resourcesv2/    # Extracted WZ JSON game assets
.memory/         # Project context and architecture snapshots
```

## Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `CLIENT_WEB_HOST` | `127.0.0.1` | client:online |
| `CLIENT_WEB_PORT` | `5173` | client:online |
| `GAME_SERVER_URL` | `http://127.0.0.1:5200` | client:online, admin-ui |
| `ALLOWED_ORIGIN` | *(reflect request)* | client:online |
| `PROXY_TIMEOUT_MS` | `10000` | client:online, admin-ui |
| `ADMIN_UI_HOST` | `127.0.0.1` | admin-ui |
| `ADMIN_UI_PORT` | `5174` | admin-ui |
| `POW_DIFFICULTY` | `20` | server |

## Tests

```bash
cd server && bun test src/
```

## Architecture

- **Client**: Standalone vanilla JS (`client/web/app.js`) served as static files.
  The online dev server injects `window.__MAPLE_ONLINE__` config and proxies `/api/*` and `/ws` to the game server.
- **Server**: Bun HTTP + WebSocket server with SQLite persistence.
  Handles character CRUD, proof-of-work sessions, room-based multiplayer, server-authoritative portals/reactors/loot.
- **Admin UI**: Single HTML page that proxies to `/api/admin/*` endpoints for database browsing (GM-only).

## Contributor Notes

- Read `AGENTS.md` for agent workflow rules
- `.memory/` contains architecture snapshots — treat as authoritative
