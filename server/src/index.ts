export const SERVER_PACKAGE_NAME = "@maple/server";

export function getServerStatus() {
  return "server-workspace-ready";
}

export { createServer, DEFAULT_CONFIG } from "./server.ts";
export type { ServerConfig, ServerMetrics, DataProvider, RequestContext } from "./server.ts";

export { InMemoryDataProvider } from "./data-provider.ts";

export { initDatabase, saveCharacterData, loadCharacterData, reserveName, createDefaultCharacter, isAccountClaimed, claimAccount, loginAccount } from "./db.ts";
export { handleCharacterRequest } from "./character-api.ts";
export { RoomManager, handleClientMessage } from "./ws.ts";
export type { WSClient, WSClientData, PlayerLook } from "./ws.ts";
