/**
 * Server-side quest data — parsed from Quest.wz for server-authoritative
 * quest accept/complete/forfeit validation and reward application.
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────

export interface QuestDef {
  startNpc: string | null;
  endNpc: string | null;
  lvmin: number;
  lvmax: number;
  jobs: number[] | null;   // null = any job
  questPrereqs: { id: string; state: number }[];
  autoStart: boolean;
  endItems: { id: number; count: number }[];  // items required to complete
}

export interface QuestReward {
  exp: number;
  meso: number;
  fame: number;
  items: { id: number; count: number }[];  // positive = give, negative = remove
}

export interface QuestAct {
  "0"?: QuestReward;  // accept (start) rewards
  "1"?: QuestReward;  // complete (end) rewards
}

// ─── Caches ─────────────────────────────────────────────────────────

const _questDefs = new Map<string, QuestDef>();
const _questActs = new Map<string, QuestAct>();
let _loaded = false;

// ─── Loading ────────────────────────────────────────────────────────

function wzPath(rel: string): string {
  // Use __dirname-relative path so it works regardless of CWD
  // server/src/quest-data.ts → ../../resourcesv3
  return resolve(__dirname, "../../resourcesv3", rel);
}

function loadWzXml(relPath: string): any {
  const filePath = wzPath(relPath);
  if (!existsSync(filePath)) return null;
  const { parseWzXml } = require("./wz-xml.ts");
  return parseWzXml(readFileSync(filePath, "utf-8"));
}

export function loadQuestData(): void {
  if (_loaded) return;
  _loaded = true;

  const checkJson = loadWzXml("Quest.wz/Check.img.xml");
  const actJson = loadWzXml("Quest.wz/Act.img.xml");

  // ── Parse Check.img (quest requirements) ──
  for (const quest of checkJson?.$$ || []) {
    const qid = quest.$imgdir;
    const startReq = quest.$$.find((n: any) => n.$imgdir === "0");
    const endReq = quest.$$.find((n: any) => n.$imgdir === "1");

    const def: QuestDef = {
      startNpc: null, endNpc: null,
      lvmin: 0, lvmax: 999,
      jobs: null,
      questPrereqs: [],
      autoStart: false,
      endItems: [],
    };

    if (startReq?.$$) {
      for (const c of startReq.$$) {
        if (c.$int === "npc") def.startNpc = String(c.value);
        if (c.$int === "lvmin") def.lvmin = Number(c.value) || 0;
        if (c.$int === "lvmax") def.lvmax = Number(c.value) || 999;
        if (c.$int === "normalAutoStart") def.autoStart = c.value === "1" || c.value === 1;
        if (c.$imgdir === "job") {
          def.jobs = (c.$$ || []).map((cc: any) => Number(cc.value));
        }
        if (c.$imgdir === "quest") {
          for (const cc of c.$$ || []) {
            let id = 0, state = 0;
            for (const ccc of cc.$$ || []) {
              if (ccc.$int === "id") id = Number(ccc.value);
              if (ccc.$int === "state") state = Number(ccc.value);
            }
            if (id) def.questPrereqs.push({ id: String(id), state });
          }
        }
      }
    }
    if (endReq?.$$) {
      for (const c of endReq.$$) {
        if (c.$int === "npc") def.endNpc = String(c.value);
        if (c.$imgdir === "item") {
          for (const it of c.$$ || []) {
            let id = 0, count = 0;
            for (const cc of it.$$ || []) {
              if (cc.$int === "id") id = Number(cc.value);
              if (cc.$int === "count") count = Number(cc.value);
            }
            if (id && count > 0) def.endItems.push({ id, count });
          }
        }
      }
    }

    _questDefs.set(qid, def);
  }

  // ── Parse Act.img (rewards) ──
  for (const quest of actJson?.$$ || []) {
    const qid = quest.$imgdir;
    const phases: QuestAct = {};
    for (const phase of quest.$$ || []) {
      const phaseId = phase.$imgdir as "0" | "1";
      const reward: QuestReward = { exp: 0, meso: 0, fame: 0, items: [] };
      for (const c of phase.$$ || []) {
        if (c.$int === "exp") reward.exp = Number(c.value) || 0;
        if (c.$int === "money") reward.meso = Number(c.value) || 0;
        if (c.$int === "pop") reward.fame = Number(c.value) || 0;
        if (c.$imgdir === "item") {
          for (const it of c.$$ || []) {
            let id = 0, count = 0;
            for (const cc of it.$$ || []) {
              if (cc.$int === "id") id = Number(cc.value);
              if (cc.$int === "count") count = Number(cc.value);
            }
            if (id) reward.items.push({ id, count });
          }
        }
      }
      phases[phaseId] = reward;
    }
    _questActs.set(qid, phases);
  }

  console.log(`[quest-data] Loaded ${_questDefs.size} quest defs, ${_questActs.size} quest acts`);
}

// ─── Accessors ──────────────────────────────────────────────────────

export function getQuestDef(qid: string): QuestDef | undefined {
  return _questDefs.get(qid);
}

export function getQuestAct(qid: string): QuestAct | undefined {
  return _questActs.get(qid);
}

// ─── Validation Helpers ─────────────────────────────────────────────

export function canAcceptQuest(
  qid: string,
  playerLevel: number,
  playerJob: number,
  playerQuests: Record<string, number>,
): { ok: boolean; reason?: string } {
  const def = _questDefs.get(qid);
  if (!def) return { ok: false, reason: "Quest not found" };

  const currentState = playerQuests[qid] || 0;
  if (currentState !== 0) return { ok: false, reason: "Quest already started or completed" };

  if (playerLevel < def.lvmin) return { ok: false, reason: `Requires level ${def.lvmin}` };
  if (playerLevel > def.lvmax) return { ok: false, reason: `Exceeds max level ${def.lvmax}` };

  if (def.jobs && def.jobs.length > 0 && !def.jobs.includes(playerJob)) {
    return { ok: false, reason: "Job requirement not met" };
  }

  for (const prereq of def.questPrereqs) {
    const pState = playerQuests[prereq.id] || 0;
    if (pState < prereq.state) {
      return { ok: false, reason: `Prerequisite quest ${prereq.id} not met` };
    }
  }

  return { ok: true };
}

export function canCompleteQuest(
  qid: string,
  playerQuests: Record<string, number>,
  countItemFn: (itemId: number) => number,
): { ok: boolean; reason?: string } {
  const def = _questDefs.get(qid);
  if (!def) return { ok: false, reason: "Quest not found" };

  const currentState = playerQuests[qid] || 0;
  if (currentState !== 1) return { ok: false, reason: "Quest not in progress" };

  for (const req of def.endItems) {
    if (countItemFn(req.id) < req.count) {
      return { ok: false, reason: `Missing required item ${req.id}` };
    }
  }

  return { ok: true };
}
