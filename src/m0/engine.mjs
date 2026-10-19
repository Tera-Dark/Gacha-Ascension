import {
  STAGE_LIMIT, TRAINING, trainingCost, getStage, currentStage,
  opponentStats, experienceNeeded
} from "./catalog.mjs";
import {cloneM0Save, getHeroStats, levelFromXp} from "./state.mjs";
import {fight,damage} from "./combat.mjs";

const validId = value => typeof value==="string" && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const allowedTypes = new Set(["BATTLE","TRAIN_HERO","SET_MODE"]);

/** Pure, deterministic reducer: no DOM, localStorage, clock, random globals, or network. */
export function executeM0(original, command, catalog) {
  if(!command || !allowedTypes.has(command.type) || !validId(command.txnId)){
    throw Error("Invalid M0 command or transaction id");
  }
  const signature = JSON.stringify({type:command.type,stageId:command.stageId??null,
    stat:command.stat??null,mode:command.mode??null});
  const found=original.receipts[command.txnId];
  if(found){
    if(found.signature!==signature)throw Error("Transaction id reused for a different operation");
    return {state:original,result:structuredClone(found.result),events:[],duplicate:true};
  }
  const txmatch=/^tx:([1-9][0-9]*)$/.exec(command.txnId);
  const sequence=txmatch?Number(txmatch[1]):NaN;
  if(!Number.isSafeInteger(sequence) || sequence!==original.txSequence+1)
    throw Error("Stale, skipped, or invalid transaction sequence");
  if(!catalog || !catalog.byId)throw Error("M0 catalog missing");
  const state=cloneM0Save(original);
  const events=[];
  let result;
  switch(command.type) {
    case "BATTLE":
      result=resolveBattle(state,command,catalog,events);break;
    case "TRAIN_HERO":
      result=resolveTraining(state,command,events);break;
    case "SET_MODE":
      result=resolveMode(state,command,catalog,events);break;
    default:throw Error("Unsupported command");
  }
  // Commit receipt after every validation, mutation and reward succeeded.
  state.txSequence=sequence;
  state.receipts[command.txnId]={signature,result:structuredClone(result)};
  state.receiptOrder.push(command.txnId);
  // Keep detail logs small. Old sequence numbers remain permanently rejected
  // even after their receipt bodies are pruned.
  if(state.receiptOrder.length>96){
    const expired=state.receiptOrder.shift();
    delete state.receipts[expired];
  }
  return {state,result,events,duplicate:false};
}

function resolveMode(save,cmd,catalog,events) {
  const e=save.run.exploration;
  if(!["push","farm","paused"].includes(cmd.mode))throw Error("Unknown exploration mode");
  if(cmd.mode==="push" && e.highestCleared===STAGE_LIMIT)throw Error("All M0 stages cleared");
  if(cmd.mode==="farm" && !e.highestCleared)throw Error("No defeated enemies available to farm");
  e.mode=cmd.mode;
  if(cmd.mode==="farm")e.farmingIndex=e.highestCleared;
  events.push({type:"ModeChanged",mode:e.mode});
  return {mode:e.mode};
}

function resolveTraining(save,cmd,events) {
  if(!Object.hasOwn(TRAINING,cmd.stat))throw Error("Unknown training stat");
  if(!save.meta.featureUnlocks.hero_training)throw Error("Training unlocks at mainline stage 3");
  const level=save.run.hero.training[cmd.stat];
  const cost=trainingCost(cmd.stat,level);
  if(save.run.stones<cost)throw Error("Insufficient spirit stones");
  save.run.stones-=cost;
  save.run.hero.training[cmd.stat]+=1;
  const after=getHeroStats(save);
  const result={stat:cmd.stat,cost,level:level+1,stats:after};
  events.push({type:"HeroTrained",...result});
  return result;
}

function resolveBattle(save,cmd,catalog,events) {
  const e=save.run.exploration;
  if(e.mode==="paused")throw Error("Exploration is paused; select push or farm");
  let stage;
  if(e.mode==="push"){
    if(e.highestCleared===STAGE_LIMIT)throw Error("M0 demo area cleared");
    stage=catalog.stages[e.highestCleared];
    if(cmd.stageId && cmd.stageId!==stage.id)throw Error("Stage does not match current push target");
  } else {
    if(e.farmingIndex<1 || e.farmingIndex>e.highestCleared)throw Error("Invalid farming target");
    stage=catalog.stages[e.farmingIndex-1];
    if(cmd.stageId && cmd.stageId!==stage.id)throw Error("Stage does not match current farming target");
  }
  const snapshot={hero:getHeroStats(save),enemy:opponentStats(stage)};
  const combat=fight(snapshot,save.seed);
  save.seed=combat.nextSeed;
  e.battleCount++;
  events.push({type:"BattleResolved",stageId:stage.id,won:combat.won,turns:combat.turns,reason:combat.reason});
  let stones=0,cultivationXp=0,firstClear=false,levelUps=0;
  if(combat.won){
    e.winCount++;
    firstClear=!e.currentRunFirstClear[stage.id];
    // The separate first-clear payment can never be repeated by farming this stage.
    stones=stage.stones+(firstClear?Math.floor(stage.stones*0.55):0);
    cultivationXp=stage.cultivationXp+(firstClear?Math.floor(stage.cultivationXp*0.55):0);
    e.currentRunFirstClear[stage.id]=true;
    save.meta.accountFirstClear[stage.id]=true;
    save.run.stones+=stones;
    save.run.cultivationXp+=cultivationXp;
    save.run.earnedXp+=cultivationXp;
    levelUps=levelFromXp(save);
    events.push({type:"ResourceAwarded",stageId:stage.id,stones,cultivationXp,firstClear});
    if(firstClear && stage.mainlineIndex===e.highestCleared+1){
      e.highestCleared=stage.mainlineIndex;
      e.targetIndex=Math.min(STAGE_LIMIT,e.highestCleared+1);
      save.meta.bestDepth=Math.max(save.meta.bestDepth,e.highestCleared);
      events.push({type:"StageFirstCleared",stageId:stage.id,depth:e.highestCleared});
      if(e.highestCleared>=3 && !save.meta.featureUnlocks.hero_training){
        save.meta.featureUnlocks.hero_training=true;
        events.push({type:"FeatureUnlocked",featureId:"hero_training",name:"灵石淬炼"});
      }
      if(e.highestCleared===STAGE_LIMIT){
        e.mode="paused";
        events.push({type:"PrototypeStageLimitReached",depth:STAGE_LIMIT});
      }
    }
    if(levelUps)events.push({type:"HeroLeveled",count:levelUps,level:save.run.hero.level});
  } else {
    e.lossCount++;
    if(e.highestCleared>0){
      e.mode="farm";
      e.farmingIndex=e.highestCleared;
      events.push({type:"AutoFarmSelected",depth:e.highestCleared});
    } else e.mode="paused";
  }
  const result={
    stageId:stage.id,stageFloor:stage.floor,enemyName:stage.enemyName,won:combat.won,
    firstClear,stones,cultivationXp,levelUps,level:save.run.hero.level,
    combat,modeAfter:e.mode,highestCleared:e.highestCleared
  };
  return result;
}

/** Non-authoritative UI summary; NEVER used to decide victory. */
export function battlePreview(save,catalog) {
  const e=save.run.exploration;
  const stage=e.mode==="farm" && e.farmingIndex>0
    ? catalog.stages[e.farmingIndex-1]
    : currentStage(catalog,e.highestCleared);
  const hero=getHeroStats(save),enemy=opponentStats(stage);
  const heroPerHit=damage(hero.attack,enemy.defense);
  const enemyPerHit=damage(enemy.attack,hero.defense);
  const hitsToKill=Math.ceil(enemy.hp/heroPerHit);
  const hitsToFall=Math.ceil(hero.hp/enemyPerHit);
  return {stage,hero,enemy,heroPerHit,enemyPerHit,hitsToKill,hitsToFall,
    likelyOutcome:hitsToKill<=hitsToFall?"优势":"劣势",nextXp:experienceNeeded(save.run.hero.level)};
}
