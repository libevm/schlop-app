# AGENTS.md

## Source of Truth
- `.memory/` holds all project context, architecture, and progress.
- Treat it as authoritative. Don't duplicate specs in this file.

## Workflow
1. Read relevant `.memory/` files before starting work.
2. Implement the change.
3. **Update `.memory/` to reflect the new state.** Change is incomplete without this.
4. If setup/run steps change, update `README.md` in the same change.
5. **Before using browser-tools / Chromium for debugging**, read `.memory/agent-chromium-interaction.md` — it has critical setup steps and pitfall fixes.

## Documentation Map

| File | Scope | Update when changing... |
|------|-------|------------------------|
| `client.md` | Client architecture, modules, rendering, assets, caching, HUD, debug | Rendering pipeline, draw order, asset loading, preload, transitions, module structure |
| `server.md` | Server internals, file map, DB schema, reactors, room manager | Server architecture, DB tables, reactor system, room/map logic |
| `client-server.md` | Wire protocol, REST API, WS messages, session model, persistence | Endpoints, message types, session handling, save schema, resource paths |
| `items.md` | Inventory, equipment, weapons, drops, chairs, icons, drag-drop | Item data model, equip/unequip, drop mechanics, loot, weapon stances, icons |
| `physics.md` | Physics system, unit conventions, footholds, gravity, swimming, climbing, mob AI | Physics constants, movement logic, collision, mob behavior, unit conversions |
| `wz-structure.md` | WZ JSON format, folder structure, data types | WZ parsing, new asset types, folder conventions |
| `wzeditor.md` | WZ Editor tool: what it does, file map, keyboard shortcuts, design choices | WZ Editor features, modules, UI, export/import, save formats |
| `agent-chromium-interaction.md` | How to launch Chromium with debug port, use browser-tools, common pitfalls | Browser testing patterns, server lifecycle in bash |
