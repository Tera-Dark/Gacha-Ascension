import {M0_SCHEMA, M0_SAVE_KEY, heroBase, TRAINING, trainingCost, experienceNeeded} from "./catalog.mjs";

export function createM0Save(seed=123456789) {
  if (!Number.isSafeInteger(seed)||seed<=0||seed>0xffffffff) throw Error("Seed must be uint32 > 0");
  return {
    schemaVersion:M0_SCHEMA,
    dataVersion:"0.5-M0",
    seed,
    meta:{bestDepth:0,featureUnlocks:{exploration:true},accountFirstClear:{},reincarnations:0,
      fatePoints:0,relicCopies:{},freeDraws:{},legacyPity:{heaven:0,immortal:0}},
    run:{
      runId:"m0-run-"+seed,
      stones:0,cultivationXp:0,earnedXp:0,
      hero:{level:1,training:{attack:0,hp:0,defense:0},realmId:"RM-001"},
      exploration:{highestCleared:0,targetIndex:1,mode:"push",farmingIndex:0,
        currentRunFirstClear:{},battleCount:0,winCount:0,lossCount:0},
    },
    txSequence:0,receipts:{},receiptOrder:[],
    settings:{autoBattle:false,reducedMotion:false}
  };
}
export function getHeroStats(save) {
  const {level,training}=save.run.hero;
  return Object.freeze({
    attack:heroBase.attack+(level-1)*7+training.attack*TRAINING.attack.amount,
    hp:heroBase.hp+(level-1)*32+training.hp*TRAINING.hp.amount,
    defense:heroBase.defense+(level-1)*3+training.defense*TRAINING.defense.amount
  });
}
export function getTrainingPreview(save,stat) {
  const level=save.run.hero.training[stat];
  return {level,cost:trainingCost(stat,level),...TRAINING[stat]};
}
export function levelFromXp(save) {
  let ups=0;
  while(save.run.cultivationXp>=experienceNeeded(save.run.hero.level) && save.run.hero.level<500){
    save.run.cultivationXp-=experienceNeeded(save.run.hero.level);
    save.run.hero.level++;
    ups++;
  }
  return ups;
}
function isDict(x) {return x && typeof x==="object"&&!Array.isArray(x)}
function checkInt(n) {return Number.isSafeInteger(n)&&n>=0}
export function validateM0Save(save) {
  if(!isDict(save)||save.schemaVersion!==M0_SCHEMA||save.dataVersion!=="0.5-M0")throw Error("Unsupported save version");
  if(!checkInt(save.seed)||save.seed===0||save.seed>0xffffffff)throw Error("Invalid saved seed");
  if(!isDict(save.meta)||!isDict(save.run)||!isDict(save.receipts)||!Array.isArray(save.receiptOrder))throw Error("Malformed save objects");
  if(!checkInt(save.txSequence)||save.txSequence>Number.MAX_SAFE_INTEGER-1)throw Error("Invalid transaction sequence");
  if(!isDict(save.meta.featureUnlocks)||!save.meta.featureUnlocks.exploration)throw Error("Exploration must be available");
  if(!checkInt(save.run.stones)||!checkInt(save.run.cultivationXp)||!checkInt(save.run.earnedXp))throw Error("Negative resources");
  const h=save.run.hero, e=save.run.exploration;
  if(!h||!e||!checkInt(h.level)||h.level<1||h.level>500||!isDict(h.training))throw Error("Invalid hero");
  if(["attack","hp","defense"].some(k=>!checkInt(h.training[k])||h.training[k]>300))throw Error("Invalid training");
  if(!checkInt(e.highestCleared)||e.highestCleared>30||!checkInt(e.targetIndex)||e.targetIndex<1||e.targetIndex>30)throw Error("Invalid stage");
  if(!["push","farm","paused"].includes(e.mode)||!checkInt(e.farmingIndex)||e.farmingIndex>e.highestCleared)throw Error("Invalid exploration mode");
  if(!checkInt(e.battleCount)||!checkInt(e.winCount)||!checkInt(e.lossCount))throw Error("Invalid battle counts");
  if(e.winCount+e.lossCount!==e.battleCount)throw Error("Battle counts mismatched");
  if(e.targetIndex!==Math.min(30,e.highestCleared+1))throw Error("Stage target inconsistent");
  if(!checkInt(save.meta.bestDepth)||save.meta.bestDepth<e.highestCleared)throw Error("Invalid permanent record");
  if(save.receiptOrder.length>96)throw Error("Excess receipts");
  if(save.receiptOrder.length!==Object.keys(save.receipts).length ||
    save.receiptOrder.some(id=>!Object.hasOwn(save.receipts,id)))throw Error("Receipts/receipt order mismatch");
  return save;
}
export function cloneM0Save(save) {
  return structuredClone(validateM0Save(save));
}
export {M0_SAVE_KEY};
