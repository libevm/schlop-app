/**
 * quests.js — Quest system: parses Quest.wz data, tracks quest state,
 * determines quest availability per-NPC, loads quest icons, provides
 * quest-aware NPC dialogue from Say.img.
 *
 * Quest icon types (UIWindow.img → QuestIcon):
 *   0 = available (yellow lightbulb)    — NPC has a quest the player can start
 *   1 = in-progress (blue ! or similar) — NPC is involved in a quest the player is doing
 *   2 = completable (yellow !)          — NPC can complete a quest the player has done
 *
 * Quest states:
 *   0 = not started
 *   1 = in progress (started)
 *   2 = completed
 */
import {
  fn, runtime, ctx, metaCache, imageCache,
  gameViewWidth, gameViewHeight,
  playerInventory, playerEquipped,
} from "./state.js";
import {
  fetchJson, requestImageByKey, getImageByKey,
  canvasMetaFromNode, findNodeByPath,
} from "./util.js";
import { canvasToImageBitmap } from "./wz-canvas-decode.js";

// ─── Quest Data (parsed from WZ) ──────────────────────────────────────────────

/** questId → { startNpc, endNpc, lvmin, lvmax, jobs, questPrereqs, autoStart, endItems } */
const _questDefs = new Map();

/** npcId (string) → [questId, ...] — quests that START at this NPC */
const _npcStartQuests = new Map();

/** npcId (string) → [questId, ...] — quests that END at this NPC */
const _npcEndQuests = new Map();

/** questId → { 0: [...lines], 1: [...lines] } — dialogue from Say.img */
const _questSay = new Map();

/** questId → { 0: { npc, exp, meso, items, fame }, 1: { ... } } — rewards from Act.img */
const _questAct = new Map();

/** questId → { name, summary, demandSummary, rewardSummary } — from QuestInfo.img */
const _questInfo = new Map();

/** Player quest states: questId → 0|1|2 */
export const playerQuestStates = new Map();

let _questDataLoaded = false;

// ─── Quest Icon Animation ──────────────────────────────────────────────────────

/** iconType → [{ key, originX, originY, delay }] */
const _questIconFrames = new Map();
let _questIconTimer = 0;
let _questIconFrameIdx = 0;

// ─── Load & Parse ──────────────────────────────────────────────────────────────

export async function loadQuestData() {
  if (_questDataLoaded) return;
  _questDataLoaded = true;

  const [checkJson, sayJson, actJson, infoJson] = await Promise.all([
    fetchJson("/resourcesv3/Quest.wz/Check.img.xml"),
    fetchJson("/resourcesv3/Quest.wz/Say.img.xml"),
    fetchJson("/resourcesv3/Quest.wz/Act.img.xml"),
    fetchJson("/resourcesv3/Quest.wz/QuestInfo.img.xml"),
  ]);

  // ── Parse Check.img (quest requirements) ──
  for (const quest of checkJson?.$$ || []) {
    const qid = quest.$imgdir;
    const startReq = quest.$$.find(n => n.$imgdir === "0");
    const endReq = quest.$$.find(n => n.$imgdir === "1");

    const def = {
      startNpc: null, endNpc: null,
      lvmin: 0, lvmax: 999,
      jobs: null,         // null = any job
      questPrereqs: [],   // [{id, state}]
      autoStart: false,
      endItems: [],       // [{id, count}] — items required to complete
    };

    if (startReq?.$$) {
      for (const c of startReq.$$) {
        if (c.$int === "npc") def.startNpc = String(c.value);
        if (c.$int === "lvmin") def.lvmin = Number(c.value) || 0;
        if (c.$int === "lvmax") def.lvmax = Number(c.value) || 999;
        if (c.$int === "normalAutoStart") def.autoStart = c.value === "1" || c.value === 1;
        if (c.$imgdir === "job") {
          def.jobs = (c.$$ || []).map(cc => Number(cc.value));
        }
        if (c.$imgdir === "quest") {
          for (const cc of c.$$ || []) {
            let id = 0, state = 0;
            for (const ccc of cc.$$ || []) {
              if (ccc.$int === "id") id = Number(ccc.value);
              if (ccc.$int === "state") state = Number(ccc.value);
            }
            if (id) def.questPrereqs.push({ id, state });
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

    // Build NPC→quest lookup
    if (def.startNpc && !def.autoStart) {
      if (!_npcStartQuests.has(def.startNpc)) _npcStartQuests.set(def.startNpc, []);
      _npcStartQuests.get(def.startNpc).push(qid);
    }
    if (def.endNpc) {
      if (!_npcEndQuests.has(def.endNpc)) _npcEndQuests.set(def.endNpc, []);
      _npcEndQuests.get(def.endNpc).push(qid);
    }
  }

  // ── Parse Say.img (dialogue lines) ──
  for (const quest of sayJson?.$$ || []) {
    const qid = quest.$imgdir;
    const phases = {};
    for (const phase of quest.$$ || []) {
      const phaseId = phase.$imgdir; // "0" = start, "1" = end
      const lines = [];
      for (const c of phase.$$ || []) {
        // Lines are numbered strings: "0", "1", ...
        if (c.$string !== undefined && /^\d+$/.test(c.$string)) {
          lines.push(String(c.value));
        }
      }
      if (lines.length) phases[phaseId] = lines;
    }
    if (Object.keys(phases).length) _questSay.set(qid, phases);
  }

  // ── Parse Act.img (rewards) ──
  for (const quest of actJson?.$$ || []) {
    const qid = quest.$imgdir;
    const phases = {};
    for (const phase of quest.$$ || []) {
      const phaseId = phase.$imgdir;
      const reward = { exp: 0, meso: 0, fame: 0, items: [] };
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
    _questAct.set(qid, phases);
  }

  // ── Parse QuestInfo.img (metadata) ──
  for (const quest of infoJson?.$$ || []) {
    const qid = quest.$imgdir;
    const info = { name: "", parent: "", summary: "", demandSummary: "", rewardSummary: "", desc: {} };
    for (const c of quest.$$ || []) {
      if (c.$string === "name") info.name = String(c.value);
      if (c.$string === "parent") info.parent = String(c.value);
      if (c.$string === "summary") info.summary = String(c.value);
      if (c.$string === "demandSummary") info.demandSummary = String(c.value);
      if (c.$string === "rewardSummary") info.rewardSummary = String(c.value);
      // Numbered descriptions: "0" = not started, "1" = in progress, "2" = completed
      if (c.$string !== undefined && /^\d+$/.test(c.$string)) {
        info.desc[c.$string] = formatQuestText(String(c.value));
      }
    }
    _questInfo.set(qid, info);
  }

  console.log(`[quests] Loaded ${_questDefs.size} quests, ${_npcStartQuests.size} start NPCs, ${_npcEndQuests.size} end NPCs`);
}

// ─── Quest Icon Loading ────────────────────────────────────────────────────────

export async function loadQuestIcons() {
  const uiJson = await fetchJson("/resourcesv3/UI.wz/UIWindow.img.xml");
  if (!uiJson) return;

  const qiNode = (uiJson.$$ || []).find(n => n.$imgdir === "QuestIcon");
  if (!qiNode) return;

  // Load icon types 0 (available), 1 (in-progress), 2 (completable)
  for (const typeIdx of [0, 1, 2]) {
    const typeNode = qiNode.$$.find(n => n.$imgdir === String(typeIdx));
    if (!typeNode?.$$) continue;

    const frames = [];
    for (const frameNode of typeNode.$$) {
      if (frameNode.$canvas === undefined) continue;
      const key = `QuestIcon/${typeIdx}/${frameNode.$canvas}`;
      const meta = canvasMetaFromNode(frameNode);
      if (!meta) continue;

      const origin = (frameNode.$$ || []).find(c => c.$vector === "origin");
      const delayNode = (frameNode.$$ || []).find(c => c.$int === "delay");

      frames.push({
        key,
        originX: origin ? Number(origin.x) : 0,
        originY: origin ? Number(origin.y) : 0,
        delay: delayNode ? Number(delayNode.value) || 150 : 150,
      });

      metaCache.set(key, meta);
      requestImageByKey(key);
    }
    _questIconFrames.set(typeIdx, frames);
  }
}

// ─── Quest Availability ────────────────────────────────────────────────────────

/**
 * Check if a quest is available to start for the current player.
 * Mirrors server-side quest eligibility (C++ QuestLog + Cosmic AbstractPlayerInteraction).
 */
function isQuestAvailable(qid) {
  const def = _questDefs.get(qid);
  if (!def) return false;

  // Skip Korean-only quests
  const info = _questInfo.get(qid);
  if (info?.name && isKorean(info.name)) return false;

  // Already started or completed?
  const state = playerQuestStates.get(qid) || 0;
  if (state > 0) return false;

  // Level check
  const level = runtime.player.level || 1;
  if (level < def.lvmin || level > def.lvmax) return false;

  // Job check
  if (def.jobs && def.jobs.length > 0) {
    const playerJob = runtime.player.job ?? 0;
    const jobId = typeof playerJob === "string"
      ? JOB_NAME_TO_ID[playerJob] ?? 0
      : playerJob;
    if (!def.jobs.includes(jobId)) return false;
  }

  // Prerequisite quests
  for (const prereq of def.questPrereqs) {
    const pState = playerQuestStates.get(String(prereq.id)) || 0;
    if (pState < prereq.state) return false;
  }

  return true;
}

/**
 * Check if a quest is in-progress and completable (player has required items).
 */
function isQuestCompletable(qid) {
  const state = playerQuestStates.get(qid) || 0;
  if (state !== 1) return false;

  const def = _questDefs.get(qid);
  if (!def) return false;

  // Check all required end items are in inventory
  for (const req of def.endItems) {
    if (countItemInInventory(req.id) < req.count) return false;
  }
  return true;
}

/**
 * Check if a quest is in-progress but NOT completable (missing items).
 */
function isQuestInProgress(qid) {
  const state = playerQuestStates.get(qid) || 0;
  return state === 1;
}

/**
 * Get quest icon type for an NPC, or null if no icon should be shown.
 * Priority: completable (2) > available (0) > in-progress at start NPC (1)
 */
export function getNpcQuestIconType(npcId) {
  const npcIdStr = String(npcId);

  // Check if any quest is completable at this NPC
  const endQuests = _npcEndQuests.get(npcIdStr) || [];
  for (const qid of endQuests) {
    if (isQuestCompletable(qid)) return 2; // completable — yellow !
  }

  // Check if any quest is available to start at this NPC
  const startQuests = _npcStartQuests.get(npcIdStr) || [];
  for (const qid of startQuests) {
    if (isQuestAvailable(qid)) return 0; // available — lightbulb
  }

  // Check if any quest is in-progress where this NPC is the start or end NPC
  for (const qid of startQuests) {
    if (isQuestInProgress(qid)) return 1; // in progress
  }
  for (const qid of endQuests) {
    if (isQuestInProgress(qid) && !isQuestCompletable(qid)) return 1; // in progress but missing items
  }

  return null;
}

// ─── Quest-Aware NPC Dialogue ──────────────────────────────────────────────────

/**
 * Build quest dialogue lines for an NPC click.
 * Returns array of line objects or null if no quest dialogue applies.
 *
 * Priority:
 *   1. Completable quest → end dialogue (Say phase 1)
 *   2. Available quest → start dialogue (Say phase 0) + accept/decline
 *   3. In-progress quest → reminder text
 */
export function getQuestDialogueForNpc(npcId) {
  const npcIdStr = String(npcId);
  const endQuests = _npcEndQuests.get(npcIdStr) || [];
  const startQuests = _npcStartQuests.get(npcIdStr) || [];

  // Collect completable quests
  const completable = [];
  for (const qid of endQuests) {
    if (isQuestCompletable(qid)) completable.push(qid);
  }

  // Collect available quests
  const available = [];
  for (const qid of startQuests) {
    if (isQuestAvailable(qid)) available.push(qid);
  }

  // Collect in-progress quests
  const inProgress = [];
  for (const qid of [...endQuests, ...startQuests]) {
    if (isQuestInProgress(qid) && !completable.includes(qid) && !inProgress.includes(qid)) {
      inProgress.push(qid);
    }
  }

  // If nothing, return null
  if (completable.length === 0 && available.length === 0 && inProgress.length === 0) {
    return null;
  }

  // Build quest menu — shows all available/completable/in-progress at once
  // This is the "quest list" view matching the MapleStory reference
  const questOptions = [];

  for (const qid of completable) {
    const def = _questDefs.get(qid);
    const info = _questInfo.get(qid);
    questOptions.push({
      questId: qid,
      label: `(Lv.${def?.lvmin || 1}) ${info?.name || "Quest " + qid}`,
      category: "completable",
    });
  }

  for (const qid of available) {
    const def = _questDefs.get(qid);
    const info = _questInfo.get(qid);
    questOptions.push({
      questId: qid,
      label: `(Lv.${def?.lvmin || 1}) ${info?.name || "Quest " + qid}`,
      category: "available",
    });
  }

  for (const qid of inProgress) {
    const def = _questDefs.get(qid);
    const info = _questInfo.get(qid);
    questOptions.push({
      questId: qid,
      label: `(Lv.${def?.lvmin || 1}) ${info?.name || "Quest " + qid}`,
      category: "in-progress",
    });
  }

  return {
    phase: "quest_list",
    questOptions,
    // lines[0] is the quest list view (special rendering)
    lines: [{
      type: "quest_list",
      questOptions,
    }],
  };
}

/**
 * Build dialogue lines for a specific quest once selected from the list.
 * Returns array of line objects for the NPC dialogue.
 */
export function getQuestSpecificDialogue(qid, category) {
  qid = String(qid);
  const say = _questSay.get(qid);
  const info = _questInfo.get(qid);
  const def = _questDefs.get(qid);
  const act = _questAct.get(qid);

  if (category === "completable") {
    const endReward = act?.["1"];
    const lines = [];
    const endLines = say?.["1"] || [];
    for (const line of endLines) {
      lines.push(formatQuestText(line));
    }
    if (lines.length === 0) {
      lines.push(info?.name ? `You've done it! "${info.name}" is complete!` : "Quest complete!");
    }
    // Reward summary
    const rewards = [];
    if (endReward?.exp) rewards.push(`${endReward.exp} EXP`);
    if (endReward?.meso) rewards.push(`${endReward.meso} meso`);
    if (rewards.length) {
      lines[lines.length - 1] += `\nRewards: ${rewards.join(", ")}`;
    }
    // Mark last line with quest_complete action (rendered as footer buttons)
    const lastText = lines.pop();
    lines.push({ type: "quest_complete", questId: qid, text: lastText });
    return lines;
  }

  if (category === "available") {
    const lines = [];
    const startLines = say?.["0"] || [];
    for (const line of startLines) {
      lines.push(formatQuestText(line));
    }
    if (lines.length === 0 && info?.name) {
      lines.push(`I have a task for you: "${info.name}".`);
    }
    if (lines.length === 0) {
      lines.push("I have a quest for you.");
    }
    // Mark last line with quest_accept action (rendered as footer buttons)
    const lastText = lines.pop();
    lines.push({ type: "quest_accept", questId: qid, text: lastText });
    return lines;
  }

  if (category === "in-progress") {
    const lines = [];
    if (def?.endItems?.length) {
      lines.push(info?.demandSummary || "You still need to collect the required items.");
      for (const req of def.endItems) {
        const have = countItemInInventory(req.id);
        const status = have >= req.count ? "✓" : `${have}/${req.count}`;
        lines.push(`  Item ${req.id}: ${status}`);
      }
    } else {
      lines.push(info?.summary || "You're still working on that quest...");
    }
    return lines;
  }

  return ["..."];
}

/**
 * Accept a quest — set state to 1 (in-progress).
 * Grants start rewards from Act.img phase 0 (e.g. quest items to carry).
 */
export function acceptQuest(qid) {
  qid = String(qid);
  playerQuestStates.set(qid, 1);
  const info = _questInfo.get(qid);
  const act = _questAct.get(qid);
  const startReward = act?.["0"];

  // Apply start rewards (phase 0)
  if (startReward) {
    applyRewards(startReward, "start");
  }

  fn.addSystemChatMessage?.(`[Quest] Accepted: ${info?.name || "Quest " + qid}`);
  fn.saveCharacter?.();
  console.log(`[quests] Accepted quest ${qid}: ${info?.name || "unknown"}`);
}

/**
 * Complete a quest — verify items, remove required items, grant rewards, set state to 2.
 * Returns true if successful, false if requirements not met.
 */
export function completeQuest(qid) {
  qid = String(qid);
  const def = _questDefs.get(qid);
  const info = _questInfo.get(qid);
  const act = _questAct.get(qid);

  // Verify player has all required items
  if (def?.endItems?.length) {
    for (const req of def.endItems) {
      if (countItemInInventory(req.id) < req.count) {
        fn.addSystemChatMessage?.(`[Quest] You don't have all the required items.`);
        return false;
      }
    }
    // Remove required items
    for (const req of def.endItems) {
      removeItemFromInventory(req.id, req.count);
    }
  }

  // Apply end rewards (phase 1)
  const endReward = act?.["1"];
  if (endReward) {
    applyRewards(endReward, "end");
  }

  // Mark completed
  playerQuestStates.set(qid, 2);

  // Build reward message
  const parts = [];
  if (endReward?.exp) parts.push(`${endReward.exp} EXP`);
  if (endReward?.meso) parts.push(`${endReward.meso} meso`);
  const itemsGained = (endReward?.items || []).filter(i => i.count > 0);
  if (itemsGained.length) parts.push(`${itemsGained.length} item(s)`);

  fn.addSystemChatMessage?.(`[Quest] Completed: ${info?.name || "Quest " + qid}${parts.length ? " — Rewards: " + parts.join(", ") : ""}`);
  fn.saveCharacter?.();
  fn.refreshUIWindows?.();
  console.log(`[quests] Completed quest ${qid}: ${info?.name || "unknown"}`);
  return true;
}

/**
 * Apply reward items/exp/meso from Act.img.
 * Items with positive count are added; items with negative count are removed.
 */
function applyRewards(reward, phase) {
  if (reward.exp) {
    runtime.player.exp = (runtime.player.exp || 0) + reward.exp;
    // Check level up
    while (runtime.player.exp >= runtime.player.maxExp && runtime.player.level < 200) {
      runtime.player.exp -= runtime.player.maxExp;
      runtime.player.level++;
      runtime.player.maxExp = Math.floor(runtime.player.maxExp * 1.2 + 5);
      runtime.player.maxHp += 20 + Math.floor(Math.random() * 5);
      runtime.player.maxMp += 10 + Math.floor(Math.random() * 3);
      runtime.player.hp = runtime.player.maxHp;
      runtime.player.mp = runtime.player.maxMp;
      fn.addSystemChatMessage?.(`[Level Up] You are now level ${runtime.player.level}!`);
    }
  }
  if (reward.meso) {
    runtime.player.meso = (runtime.player.meso || 0) + reward.meso;
  }
  if (reward.fame) {
    // Fame not tracked yet, ignore
  }
  for (const item of (reward.items || [])) {
    if (item.count > 0) {
      addItemToInventory(item.id, item.count);
    } else if (item.count < 0) {
      removeItemFromInventory(item.id, -item.count);
    }
  }
}

// ─── Quest Icon Rendering ──────────────────────────────────────────────────────

/**
 * Update quest icon animation timer.
 */
export function updateQuestIconAnimation(dtMs) {
  _questIconTimer += dtMs;
  // Use type-0 frames as the animation reference (all types share same timing)
  const frames = _questIconFrames.get(0);
  if (!frames || frames.length === 0) return;

  const delay = frames[_questIconFrameIdx % frames.length]?.delay || 150;
  if (_questIconTimer >= delay) {
    _questIconTimer -= delay;
    _questIconFrameIdx = (_questIconFrameIdx + 1) % frames.length;
  }
}

/**
 * Draw quest icon above an NPC at screen position (screenX, topY).
 * iconType: 0=available, 1=in-progress, 2=completable
 */
export function drawQuestIcon(screenX, topY, iconType) {
  const frames = _questIconFrames.get(iconType);
  if (!frames || frames.length === 0) return;

  const frameIdx = _questIconFrameIdx % frames.length;
  const frame = frames[frameIdx];
  const img = getImageByKey(frame.key);
  if (!img) return;

  const dx = screenX - frame.originX;
  const dy = topY - img.height - 8; // position icon fully above NPC head with 8px gap
  ctx.drawImage(img, dx, dy);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Format quest text — strip simple # codes (subset of C++ format_text). */
function formatQuestText(text) {
  if (!text) return "";
  return text
    .replace(/#b/g, "")  // blue color start
    .replace(/#k/g, "")  // color end
    .replace(/#e/g, "")  // bold start
    .replace(/#n/g, "")  // bold end
    .replace(/#r/g, "")  // red
    .replace(/#d/g, "")  // purple
    .replace(/#g/g, "")  // green
    .replace(/#h\s*#/g, runtime.player.name || "Player") // player name
    .replace(/#p(\d+)#/g, (_, id) => `NPC`) // NPC name (simplified)
    .replace(/#t(\d+)#/g, (_, id) => `item`) // item name (simplified)
    .replace(/#c(\d+)#/g, "")  // item count
    .replace(/#i(\d+):#/g, "") // item icon
    .replace(/#m(\d+)#/g, "map") // map name
    .replace(/#W\w*#/g, "")  // misc tags
    .replace(/#l/g, "")  // selection start
    .replace(/#/g, "");  // stray #
}

/** Job name→ID mapping (beginner only for now). */
const JOB_NAME_TO_ID = {
  "Beginner": 0,
  "Warrior": 100, "Fighter": 110, "Page": 120, "Spearman": 130,
  "Magician": 200, "F/P Wizard": 210, "I/L Wizard": 220, "Cleric": 230,
  "Bowman": 300, "Hunter": 310, "Crossbowman": 320,
  "Thief": 400, "Assassin": 410, "Bandit": 420,
  "Pirate": 500, "Brawler": 510, "Gunslinger": 520,
};

/** Returns true if text contains Korean characters. */
function isKorean(text) {
  return /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/.test(text);
}

// ─── Inventory Helpers ─────────────────────────────────────────────────────────

/** Count how many of an item the player has across all inventory slots. */
function countItemInInventory(itemId) {
  let total = 0;
  for (const it of playerInventory) {
    if (it.id === itemId) total += it.qty;
  }
  return total;
}

/**
 * Remove `count` of an item from inventory. Returns amount actually removed.
 * Removes from highest-slot first (LIFO).
 */
function removeItemFromInventory(itemId, count) {
  let remaining = count;
  // Iterate backwards so splicing doesn't skip entries
  for (let i = playerInventory.length - 1; i >= 0 && remaining > 0; i--) {
    if (playerInventory[i].id !== itemId) continue;
    const it = playerInventory[i];
    if (it.qty <= remaining) {
      remaining -= it.qty;
      playerInventory.splice(i, 1);
    } else {
      it.qty -= remaining;
      remaining = 0;
    }
  }
  return count - remaining;
}

/**
 * Add item(s) to inventory. Uses fn.inventoryTypeById, fn.findFreeSlot, fn.loadItemIcon.
 */
function addItemToInventory(itemId, count) {
  if (count <= 0) return;
  const invType = fn.inventoryTypeById?.(itemId) || "ETC";
  const isEquip = invType === "EQUIP";

  // For stackable items, try to stack first
  if (!isEquip) {
    for (const it of playerInventory) {
      if (it.id === itemId && it.invType === invType) {
        it.qty += count;
        fn.refreshUIWindows?.();
        return;
      }
    }
  }

  const freeSlot = fn.findFreeSlot?.(invType) ?? 0;
  const iconKey = isEquip
    ? fn.loadEquipIcon?.(itemId, fn.equipWzCategoryFromId?.(itemId) || "")
    : fn.loadItemIcon?.(itemId);
  playerInventory.push({
    id: itemId, name: "...", qty: count,
    iconKey: iconKey || null, invType,
    category: null, slot: freeSlot,
  });
  // Async load name
  fn.loadItemName?.(itemId)?.then?.(name => {
    const entry = playerInventory.find(e => e.id === itemId);
    if (entry && name) { entry.name = name; fn.refreshUIWindows?.(); }
  });
  fn.refreshUIWindows?.();
}

// ─── Save / Load Quest States ──────────────────────────────────────────────────

/** Serialize quest states for save data. Returns { questId: state } object. */
export function serializeQuestStates() {
  const obj = {};
  for (const [qid, state] of playerQuestStates) {
    if (state > 0) obj[qid] = state; // only save started/completed
  }
  return obj;
}

/** Restore quest states from save data. */
export function deserializeQuestStates(obj) {
  playerQuestStates.clear();
  if (!obj || typeof obj !== "object") return;
  for (const [qid, state] of Object.entries(obj)) {
    const s = Number(state);
    if (s > 0) playerQuestStates.set(String(qid), s);
  }
}

/**
 * Forfeit/give up a quest — reset state to 0 (not started).
 */
export function forfeitQuest(qid) {
  qid = String(qid);
  const info = _questInfo.get(qid);
  playerQuestStates.delete(qid);
  fn.addSystemChatMessage?.(`[Quest] Forfeited: ${info?.name || "Quest " + qid}`);
  fn.saveCharacter?.();
  console.log(`[quests] Forfeited quest ${qid}: ${info?.name || "unknown"}`);
}

/**
 * Get all quests with a specific state. Returns array of { qid, info, def }.
 */
export function getQuestsByState(state) {
  const results = [];
  for (const [qid, s] of playerQuestStates) {
    if (s !== state) continue;
    const info = _questInfo.get(qid);
    const def = _questDefs.get(qid);
    if (info?.name && isKorean(info.name)) continue;
    results.push({ qid, info, def });
  }
  return results;
}

/**
 * Get all available quests for the player. Returns array of { qid, info, def }.
 */
export function getAvailableQuests() {
  const results = [];
  for (const [qid, def] of _questDefs) {
    if (!isQuestAvailable(qid)) continue;
    const info = _questInfo.get(qid);
    results.push({ qid, info, def });
  }
  return results;
}

export function getQuestAct(qid) { return _questAct.get(String(qid)); }
export function getQuestInfo(qid) { return _questInfo.get(String(qid)); }
export function getQuestDef(qid) { return _questDefs.get(String(qid)); }
export function isDataLoaded() { return _questDataLoaded; }
export { countItemInInventory };
