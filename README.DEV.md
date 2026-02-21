# Developer Setup

## Prerequisites

- **Bun** ≥ 1.3 — `bun --version`
- Pre-extracted WZ JSON files in `resources/` and `resourcesv2/`

## WZ Files

The game reads pre-extracted MapleStory `.wz` archives as JSON (`.img.json` files).

Two directories are used:
- `resources/` — original v1 extraction (read-only reference)
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

## Tests

```bash
bun run test          # all workspace tests
cd server && bun test # server tests only
```

## Project Context

Architecture docs and progress snapshots live in `.memory/` — read those before making changes.
