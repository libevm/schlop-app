import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { createServer } from "./server.ts";
import { InMemoryDataProvider } from "./data-provider.ts";
import { createDefaultCharacter, initDatabase } from "./db.ts";
import { setDebugMode } from "./ws.ts";
import { loadDropPools } from "./reactor-system.ts";
import * as path from "path";

/** Solve a PoW challenge locally (for tests). */
function solveChallenge(challenge: string, difficulty: number): string {
  const fullBytes = Math.floor(difficulty / 8);
  const remainBits = difficulty % 8;
  const mask = remainBits > 0 ? (0xff << (8 - remainBits)) & 0xff : 0;
  let nonce = 0;
  while (true) {
    const nonceStr = nonce.toString(16);
    const hash = createHash("sha256").update(challenge + nonceStr).digest();
    let valid = true;
    for (let b = 0; b < fullBytes; b++) { if (hash[b] !== 0) { valid = false; break; } }
    if (valid && remainBits > 0 && (hash[fullBytes] & mask) !== 0) valid = false;
    if (valid) return nonceStr;
    nonce++;
  }
}

/** Obtain a valid session from the server via PoW. */
async function getValidSession(baseUrl: string): Promise<string> {
  const chResp = await fetch(`${baseUrl}/api/pow/challenge`);
  const chData = await chResp.json() as { ok: boolean; challenge: string; difficulty: number };
  const nonce = solveChallenge(chData.challenge, chData.difficulty);
  const vResp = await fetch(`${baseUrl}/api/pow/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: chData.challenge, nonce }),
  });
  const vData = await vResp.json() as { ok: boolean; session_id: string };
  return vData.session_id;
}

// Load drop pools from WZ data for tests
loadDropPools(path.resolve(__dirname, "../../resourcesv3"));

/**
 * Helper: open a WebSocket and return a promise-based interface.
 */
function openWS(url: string): Promise<{
  ws: WebSocket;
  messages: Array<{ type: string; [key: string]: unknown }>;
  waitForMessage: (type: string, timeoutMs?: number) => Promise<{ type: string; [key: string]: unknown }>;
  send: (msg: unknown) => void;
  close: () => void;
}> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const waiters: Array<{ type: string; resolve: (msg: unknown) => void; timer: ReturnType<typeof setTimeout> }> = [];

    ws.onopen = () => {
      resolve({
        ws,
        messages,
        waitForMessage(type: string, timeoutMs = 2000) {
          // Check if already received
          const idx = messages.findIndex(m => m.type === type);
          if (idx >= 0) {
            const msg = messages[idx];
            messages.splice(idx, 1);
            return Promise.resolve(msg);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`Timeout waiting for "${type}"`)), timeoutMs);
            waiters.push({ type, resolve: res as (msg: unknown) => void, timer });
          });
        },
        send(msg: unknown) { ws.send(JSON.stringify(msg)); },
        close() { ws.close(); },
      });
    };
    ws.onerror = () => reject(new Error("WebSocket connection failed"));

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data));
        // Check waiters first
        const waiterIdx = waiters.findIndex(w => w.type === msg.type);
        if (waiterIdx >= 0) {
          const waiter = waiters[waiterIdx];
          waiters.splice(waiterIdx, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        } else {
          messages.push(msg);
        }
      } catch {}
    };
  });
}

/**
 * Helper: authenticate a client and complete the map change handshake.
 * Returns after the client is fully in a room (map_state received).
 */
async function authAndJoin(client: Awaited<ReturnType<typeof openWS>>, sessionId: string) {
  client.send({ type: "auth", session_id: sessionId });
  // Server sends change_map first (server-authoritative map assignment)
  const changeMap = await client.waitForMessage("change_map");
  expect(changeMap.type).toBe("change_map");
  expect(typeof changeMap.map_id).toBe("string");
  // Client signals it loaded the map
  client.send({ type: "map_loaded" });
  // Server then sends map_state once client is in the room
  const mapState = await client.waitForMessage("map_state");
  expect(mapState.type).toBe("map_state");
  return { changeMap, mapState };
}

/**
 * Helper: warp a joined client to a different map using admin_warp.
 * Requires debug mode to be enabled.
 */
async function warpTo(client: Awaited<ReturnType<typeof openWS>>, mapId: string) {
  client.send({ type: "admin_warp", map_id: mapId });
  const cm = await client.waitForMessage("change_map");
  expect(cm.map_id).toBe(mapId);
  client.send({ type: "map_loaded" });
  const ms = await client.waitForMessage("map_state");
  expect(ms.type).toBe("map_state");
  return ms;
}

describe("WebSocket server", () => {
  let server: ReturnType<typeof import("bun")["serve"]> & { roomManager?: unknown };
  let baseUrl: string;
  let wsUrl: string;
  let sessionA: string;
  let sessionB: string;

  beforeAll(async () => {
    process.env.POW_DIFFICULTY = "1"; // minimal difficulty for fast tests
    const provider = new InMemoryDataProvider();

    const { start } = createServer(provider, {
      port: 0,
      debug: false,
      dbPath: ":memory:",
    });
    server = start();
    baseUrl = `http://localhost:${server.port}`;
    wsUrl = `ws://localhost:${server.port}/ws`;

    // Obtain valid sessions via PoW
    sessionA = await getValidSession(baseUrl);
    sessionB = await getValidSession(baseUrl);
  });

  afterAll(() => {
    delete process.env.POW_DIFFICULTY;
    server?.stop();
  });

  // Helper: create character via REST API with a PoW-issued session.
  // Returns the valid session ID (ignores the `session` param — kept for call-site compat).
  async function createCharacter(_session: string, name: string): Promise<string> {
    const validSession = await getValidSession(baseUrl);
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${validSession}` },
      body: JSON.stringify({ name, gender: false }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`createCharacter failed (${res.status}): ${body}`);
    }
    return validSession;
  }

  test("rejects non-auth first message", async () => {
    const _s1 = await createCharacter(sessionA, "Alice");

    const client = await openWS(wsUrl);
    client.send({ type: "move", x: 0, y: 0 });

    // Server should close with 4001
    await new Promise<void>((resolve) => {
      client.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4001);
        resolve();
      };
    });
  });

  test("rejects auth with invalid/non-PoW session", async () => {
    const client = await openWS(wsUrl);
    client.send({ type: "auth", session_id: "nonexistent-session-xyz" });

    await new Promise<void>((resolve) => {
      client.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4007); // invalid/expired session
        resolve();
      };
    });
  });

  test("authenticates: receives change_map then map_state after map_loaded", async () => {
    const _s2 = await createCharacter("auth-test-a", "Alice2");

    const client = await openWS(wsUrl);
    const { changeMap, mapState } = await authAndJoin(client, _s2);

    expect(changeMap.map_id).toBe("100000002"); // default start map
    expect(Array.isArray(mapState.players)).toBe(true);

    client.close();
  });

  test("two clients see each other", async () => {
    // Ensure characters exist with unique names
    const _s3 = await createCharacter("multi-a", "MultiA");
    const _s4 = await createCharacter("multi-b", "MultiB");

    // Connect client A
    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s3);

    // Connect client B (same default map)
    const clientB = await openWS(wsUrl);
    const { mapState: bMapState } = await authAndJoin(clientB, _s4);

    // Client B should get map_state with client A in it
    const players = bMapState.players as Array<{ id: string; name: string }>;
    expect(players.some(p => p.id === _s3)).toBe(true);

    // Client A should receive player_enter for client B
    const enterMsg = await clientA.waitForMessage("player_enter");
    expect(enterMsg.id).toBe(_s4);
    expect(enterMsg.name).toBe("MultiB");

    clientA.close();
    clientB.close();
  });

  test("move broadcasts to room", async () => {
    const _s5 = await createCharacter("move-a", "MoverA");
    const _s6 = await createCharacter("move-b", "MoverB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s5);

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, _s6);

    // Drain player_enter messages
    await clientA.waitForMessage("player_enter");

    // Client A moves
    clientA.send({ type: "move", x: 100, y: 200, action: "walk1", facing: 1 });

    // Client B should receive player_move
    const moveMsg = await clientB.waitForMessage("player_move");
    expect(moveMsg.id).toBe(_s5);
    expect(moveMsg.x).toBe(100);
    expect(moveMsg.y).toBe(200);
    expect(moveMsg.action).toBe("walk1");
    expect(moveMsg.facing).toBe(1);

    clientA.close();
    clientB.close();
  });

  test("chat broadcasts to room", async () => {
    const _s7 = await createCharacter("chat-a", "ChatterA");
    const _s8 = await createCharacter("chat-b", "ChatterB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s7);

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, _s8);

    // Drain player_enter
    await clientA.waitForMessage("player_enter");

    clientA.send({ type: "chat", text: "Hello world!" });

    // Chat includes sender (broadcast to all in room)
    const chatB = await clientB.waitForMessage("player_chat");
    expect(chatB.name).toBe("ChatterA");
    expect(chatB.text).toBe("Hello world!");

    // Sender also gets it (chat is not excluded)
    const chatA = await clientA.waitForMessage("player_chat");
    expect(chatA.text).toBe("Hello world!");

    clientA.close();
    clientB.close();
  });

  test("disconnect broadcasts player_leave", async () => {
    const _s9 = await createCharacter("leave-a", "LeaverA");
    const _s10 = await createCharacter("leave-b", "LeaverB");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s9);

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, _s10);
    await clientA.waitForMessage("player_enter");

    // Client A disconnects
    clientA.close();

    // Client B should receive player_leave
    const leaveMsg = await clientB.waitForMessage("player_leave");
    expect(leaveMsg.id).toBe(_s9);

    clientB.close();
  });

  test("ping responds with pong", async () => {
    const _s11 = await createCharacter("ping-a", "PingerA");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s11);

    client.send({ type: "ping" });
    const pong = await client.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    client.close();
  });

  test("admin_warp works when debug mode is enabled", async () => {
    const _s12 = await createCharacter("room-a", "RoomA");
    const _s13 = await createCharacter("room-b", "RoomB");

    // Enable debug mode for this test
    setDebugMode(true);

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s12);

    const clientB = await openWS(wsUrl);
    await authAndJoin(clientB, _s13);
    await clientA.waitForMessage("player_enter");

    // Client A warps to a different map via admin_warp
    clientA.send({ type: "admin_warp", map_id: "101000100" });

    // Client A should get change_map from server
    const changeMap = await clientA.waitForMessage("change_map");
    expect(changeMap.map_id).toBe("101000100");

    // Client A completes loading
    clientA.send({ type: "map_loaded" });

    // Client A should get map_state for the new map
    const newMapState = await clientA.waitForMessage("map_state");
    expect(newMapState.type).toBe("map_state");

    // Client B should get player_leave
    const leaveMsg = await clientB.waitForMessage("player_leave");
    expect(leaveMsg.id).toBe(_s12);

    clientA.close();
    clientB.close();
    setDebugMode(false);
  });

  test("admin_warp is denied when debug mode is off", async () => {
    const _s14 = await createCharacter("nodebug-a", "NoDebugA");

    setDebugMode(false);
    const client = await openWS(wsUrl);
    await authAndJoin(client, _s14);

    client.send({ type: "admin_warp", map_id: "100000000" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.reason).toContain("disabled");

    client.close();
  });

  test("enter_map and leave_map are silently ignored", async () => {
    const _s15 = await createCharacter("compat-a", "CompatA");

    const clientA = await openWS(wsUrl);
    await authAndJoin(clientA, _s15);

    // Send deprecated messages — should be silently ignored, no crash
    clientA.send({ type: "enter_map", map_id: "100000000" });
    clientA.send({ type: "leave_map" });

    // Verify client is still alive
    clientA.send({ type: "ping" });
    const pong = await clientA.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    clientA.close();
  });

  test("rejects duplicate session (already logged in)", async () => {
    const _s16 = await createCharacter("dup-a", "DupA");

    // First connection succeeds
    const client1 = await openWS(wsUrl);
    await authAndJoin(client1, _s16);

    // Second connection with same session should be rejected
    const client2 = await openWS(wsUrl);
    client2.send({ type: "auth", session_id: _s16 });

    await new Promise<void>((resolve) => {
      client2.ws.onclose = (e: CloseEvent) => {
        expect(e.code).toBe(4006);
        resolve();
      };
    });

    // First connection should still be alive
    client1.send({ type: "ping" });
    const pong = await client1.waitForMessage("pong");
    expect(pong.type).toBe("pong");

    client1.close();
  });

  test("cannot steal unclaimed name from online player", async () => {
    const onlineSession = "online-holder-session";

    // Create a character with an unclaimed name
    const _s17 = await createCharacter(onlineSession, "OnlineHero");

    // Connect via WebSocket (player is now online)
    const client = await openWS(wsUrl);
    await authAndJoin(client, _s17);

    // Another session tries to create a character with the same name
    const thiefSession = await getValidSession(baseUrl);
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${thiefSession}` },
      body: JSON.stringify({ name: "OnlineHero", gender: false }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NAME_TAKEN");

    client.close();
  });

  test("can take unclaimed name from offline player", async () => {
    const offlineSession = "offline-holder-session";

    // Create a character with an unclaimed name (no WS connection = offline)
    const _s18 = await createCharacter(offlineSession, "OfflineHero");

    // Another session takes the name — should succeed (unclaimed + offline)
    const takerSession = await getValidSession(baseUrl);
    const res = await fetch(`${baseUrl}/api/character/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${takerSession}` },
      body: JSON.stringify({ name: "OfflineHero", gender: true }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.name).toBe("OfflineHero");
  });

  test("use_portal validates portal proximity", async () => {
    const _s19 = await createCharacter("portal-a", "PortalA");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s19);

    // Move client to a known position far from any portal (confirms position)
    client.send({ type: "move", x: 9999, y: 9999, action: "stand1", facing: 1 });
    // Small delay to let server process the move
    await new Promise(r => setTimeout(r, 50));

    // Try to use a portal — should be denied (too far)
    client.send({ type: "use_portal", portal_name: "out02" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");

    client.close();
  });

  test("use_portal requires position confirmation", async () => {
    const _s20 = await createCharacter("portal-nopos", "PortalNoPos");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s20);

    // Try to use portal WITHOUT sending any move first
    client.send({ type: "use_portal", portal_name: "out02" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");
    expect(denied.reason).toContain("Position not confirmed");

    client.close();
  });

  test("use_portal with nonexistent portal is denied", async () => {
    const _s21 = await createCharacter("portal-b", "PortalB");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s21);

    // Must confirm position first
    client.send({ type: "move", x: 100, y: 200, action: "stand1", facing: 1 });
    await new Promise(r => setTimeout(r, 50));

    client.send({ type: "use_portal", portal_name: "nonexistent_portal_xyz" });
    const denied = await client.waitForMessage("portal_denied");
    expect(denied.type).toBe("portal_denied");
    expect(denied.reason).toContain("not found");

    client.close();
  });

  test("save_state is server-authoritative — client cannot set inventory/stats/meso", async () => {
    const _s24 = await createCharacter("save-test", "SaveTester");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s24);

    // Attempt to send save_state with custom inventory, equipment, and stats
    // Server should IGNORE inventory, equipment, and stats — only accept achievements
    client.send({
      type: "save_state",
      inventory: [
        { item_id: 2000000, qty: 50, inv_type: "USE", slot: 0, category: null },
      ],
      equipment: [
        { slot_type: "Weapon", item_id: 1302000 },
      ],
      stats: { level: 99, job: "Warrior", hp: 9999, meso: 999999 },
      achievements: {
        jq_quests: {
          "Shumi's Lost Coin": 1,  // valid quest name, +1 increment
          "fake-quest": 5,           // invalid quest name — should be rejected
        },
      },
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    client.close();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Load character from REST API and verify state was NOT overwritten
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: { Authorization: `Bearer ${_s24}` },
    });
    const body = await loadRes.json();
    const data = body.data ?? body;

    // Inventory should be the server's default — NOT what the client sent
    // Default character has HP/MP potions + possibly other starter items
    const hasClientItem = data.inventory.some((it: any) => it.item_id === 2000000 && it.qty === 50);
    expect(hasClientItem).toBe(false); // client cannot inject items

    // Stats should be server defaults — NOT level 99 or meso 999999
    expect(data.stats.level).toBe(1); // default level
    expect(data.stats.meso).toBe(0); // default meso

    // Valid JQ quest with +1 increment should be accepted
    expect(data.achievements?.jq_quests?.["Shumi's Lost Coin"]).toBe(1);
    // Fake quest name should be rejected
    expect(data.achievements?.jq_quests?.["fake-quest"]).toBeUndefined();
  });

  test("disconnect persists server-authoritative state to DB", async () => {
    const _s25 = await createCharacter("dc-test", "DcTester");

    const client = await openWS(wsUrl);
    await authAndJoin(client, _s25);

    // Move to update position (server tracks x, y, mapId)
    client.send({ type: "move", x: 300, y: 200, action: "walk1", facing: 1 });
    await new Promise(resolve => setTimeout(resolve, 50));

    // Disconnect (server should persist its tracked state on close)
    client.close();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Load and verify disconnect save captured server-authoritative state
    const loadRes = await fetch(`${baseUrl}/api/character/load`, {
      headers: { Authorization: `Bearer ${_s25}` },
    });
    const body = await loadRes.json();
    const data = body.data ?? body;

    // Server should have persisted the default inventory (from character creation)
    expect(data.inventory.length).toBeGreaterThan(0);
    // Stats should be defaults (server-authoritative, no client override)
    expect(data.stats.level).toBe(1);
    // Location should reflect the map they were on
    expect(data.location.map_id).toBe("100000002");
  });

  // Reactor tests removed — reactor placements now come from WZ data (MAP_REACTORS is empty by default).
  // TODO: Re-add reactor tests once WZ-driven reactor placements are implemented.

  test("quest_accept: server validates and rejects re-accept", async () => {
    const session = await createCharacter("", "QuestTester");
    const client = await openWS(wsUrl);
    await authAndJoin(client, session);
    // Drain stats_update and quests_update from map join
    await client.waitForMessage("stats_update");
    await client.waitForMessage("quests_update");

    // Quest 1000 starts at NPC 2101 — may or may not be on spawn map
    client.send({ type: "quest_accept", questId: "1000" });
    const result = await client.waitForMessage("quest_result");
    expect(result.action).toBe("accept");
    expect(result.questId).toBe("1000");
    expect(typeof result.ok).toBe("boolean");
    if (result.ok) {
      // Should also receive state updates
      await client.waitForMessage("stats_update");
      await client.waitForMessage("inventory_update");
      const qu = await client.waitForMessage("quests_update");
      expect(qu.quests["1000"]).toBe(1);

      // Try re-accept — should fail
      client.send({ type: "quest_accept", questId: "1000" });
      const result2 = await client.waitForMessage("quest_result");
      expect(result2.ok).toBe(false);
      expect(result2.reason).toContain("already started");
    }
    client.close();
  });

  test("quest_forfeit: rejects if quest not in progress", async () => {
    const session = await createCharacter("", "ForfeitTest");
    const client = await openWS(wsUrl);
    await authAndJoin(client, session);
    await client.waitForMessage("stats_update");
    await client.waitForMessage("quests_update");

    // Forfeit a quest that's not in progress — should fail
    client.send({ type: "quest_forfeit", questId: "1000" });
    const r1 = await client.waitForMessage("quest_result");
    expect(r1.ok).toBe(false);
    expect(r1.reason).toContain("not in progress");

    client.close();
  });
});
