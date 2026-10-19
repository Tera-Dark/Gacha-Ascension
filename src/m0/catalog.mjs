/**
 * M0 content adapter: v0.5 codex is the ONE source of encounter numbers.
 * Unsupported P1/P2 content is not silently made playable.
 */
export const M0_SCHEMA = 1;
export const M0_SAVE_KEY = "gacha-ascension-m0-v1";
export const M0_ZONE = "ZN-001";
export const STAGE_LIMIT = 30;
export const STAGE_TUNING = Object.freeze({
  // Temporary M0 encounter balance, not final GDD numbers.
  enemyAttack: 0.40,
  enemyHp: 0.25,
  enemyDefense: 0.70,
  encounterTurnLimit: 80,
});
const integer = x => Number.isSafeInteger(x) && x >= 0;

export function loadM0Catalog(source) {
  if (!source || source.schemaVersion !== "0.5") throw Error("M0 requires v0.5 content");
  const zone = source.zones?.find(z => z.id === M0_ZONE && z.normalAvailableInSlice);
  if (!zone) throw Error("M0 initial zone missing");
  const stages = (source.stages || []).filter(s => s.zoneId === M0_ZONE && s.difficultyId === "normal")
    .sort((a,b) => a.mainlineIndex - b.mainlineIndex);
  const enemyIds = new Set((source.enemies || []).map(e => e.id));
  if (stages.length !== STAGE_LIMIT) throw Error("M0 requires 30 actual stage samples");
  for (let i=0; i<stages.length; i++) {
    const s = stages[i];
    if (s.mainlineIndex !== i+1 || s.floor !== i+1 || !enemyIds.has(s.enemyId)) {
      throw Error("Invalid M0 stage reference/sequence: " + s.id);
    }
    for (const key of ["baseAttack","baseHp","baseDefense","stones","cultivationXp"]) {
      if (!integer(s[key]) || s[key] === 0) throw Error("Invalid M0 stage " + key + " at " + s.id);
    }
  }
  const index = Object.fromEntries(stages.map(s => [s.id, Object.freeze({...s})]));
  return Object.freeze({version:"0.5-M0",zone:Object.freeze({...zone}),stages:Object.freeze(stages),
    byId:Object.freeze(index),unlocks:source.unlocks || []});
}

export function currentStage(catalog, cleared = 0) {
  return catalog.stages[Math.min(Math.max(0,cleared),STAGE_LIMIT-1)];
}

export function getStage(catalog, stageId) {
  const stage = catalog.byId[stageId];
  if (!stage) throw Error("Unknown / unavailable stage: " + stageId);
  return stage;
}

export function opponentStats(stage) {
  return Object.freeze({
    attack:Math.max(1,Math.round(stage.baseAttack * STAGE_TUNING.enemyAttack)),
    hp:Math.max(1,Math.round(stage.baseHp * STAGE_TUNING.enemyHp)),
    defense:Math.max(0,Math.round(stage.baseDefense * STAGE_TUNING.enemyDefense))
  });
}

export function experienceNeeded(level) {
  if (!Number.isSafeInteger(level) || level < 1) throw Error("Invalid level");
  return 25 + level*13 + Math.floor(level*level*1.75);
}

export const heroBase = Object.freeze({attack:39,hp:225,defense:16});
export const TRAINING = Object.freeze({
  attack: Object.freeze({label:"淬锋",baseCost:35,growth:1.21,amount:10}),
  hp: Object.freeze({label:"锻体",baseCost:29,growth:1.20,amount:46}),
  defense: Object.freeze({label:"护脉",baseCost:29,growth:1.20,amount:6})
});

export function trainingCost(stat, level) {
  const config = TRAINING[stat];
  if (!config || !integer(level) || level>300) throw Error("Invalid training");
  return Math.max(1,Math.floor(config.baseCost*Math.pow(config.growth,level)));
}
