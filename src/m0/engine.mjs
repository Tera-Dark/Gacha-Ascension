import {STAGE_LIMIT,opponentStats,stageAt,packUnlocked,experienceNeeded} from "./catalog.mjs";
import {cloneM0Save,getHeroStats,effects,levelFromXp,levelCap} from "./state.mjs";
import {fight,damage,nextRandom} from "./combat.mjs";

const TYPES=new Set(["BATTLE","DRAW","BREAKTHROUGH","SET_MODE"]);
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function random(state){const r=nextRandom(state.seed);state.seed=r.seed;return r.value;}
function assertSpend(state,n){if(!Number.isSafeInteger(n)||n<0||state.run.stones<n)throw Error("灵石不足，先挑战或扫荡旧层积累资源");}

/** Pure reducer. Only the result state may be persisted; UI never writes combat rewards. */
export function executeM0(original,cmd,catalog){
 if(!cmd||!TYPES.has(cmd.type)||!/^tx:[1-9]\d*$/.test(cmd.txnId))throw Error("无效指令或交易号");
 const signature=JSON.stringify({type:cmd.type,mode:cmd.mode??null,packId:cmd.packId??null,count:cmd.count??null});
 const prior=original.receipts[cmd.txnId];
 if(prior){if(prior.signature!==signature)throw Error("相同交易号不得用于其他指令");return {state:original,result:structuredClone(prior.result),events:[],duplicate:true};}
 const seq=Number(cmd.txnId.slice(3));
 if(!Number.isSafeInteger(seq)||seq!==original.txSequence+1)throw Error("过期或跳号的交易无法重复执行");
 const state=cloneM0Save(original),events=[];
 let result;
 switch(cmd.type){
  case "BATTLE":result=battle(state,catalog,events);break;
  case "DRAW":result=draw(state,cmd,catalog,events);break;
  case "BREAKTHROUGH":result=breakthrough(state,catalog,events);break;
  case "SET_MODE":result=setMode(state,cmd,catalog,events);break;
 }
 state.txSequence=seq;
 state.receipts[cmd.txnId]={signature,result:structuredClone(result)};
 state.receiptOrder.push(cmd.txnId);
 if(state.receiptOrder.length>96)delete state.receipts[state.receiptOrder.shift()];
 return {state,result,events,duplicate:false};
}
function setMode(s,cmd,catalog,events){
 const e=s.run.exploration;
 if(!["push","farm","paused"].includes(cmd.mode))throw Error("无效的探索模式");
 if(cmd.mode==="push" && e.highestCleared>=STAGE_LIMIT)throw Error("当前地图已通关，请继续扫荡");
 if(cmd.mode==="farm"&&!e.highestCleared)throw Error("没有可以扫荡的关卡");
 if(cmd.mode==="push"&&e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended){
   throw Error("境界锁尚未解除：需要筑基丹与足够修为");
 }
 e.mode=cmd.mode;
 if(cmd.mode==="farm")e.farmFloor=Math.max(1,e.highestCleared);
 if(cmd.mode==="push")e.farmReason=null;
 events.push({type:"ModeChanged",mode:e.mode});
 return {mode:e.mode};
}
function battle(s,catalog,events){
 const e=s.run.exploration;
 if(e.mode==="paused")throw Error("当前暂停探索");
 const floor=e.mode==="farm"?e.farmFloor:e.highestCleared+1;
 if(floor<1||floor>STAGE_LIMIT)throw Error("关卡范围无效");
 if(e.mode==="push"&&floor>catalog.ascension.requiredCleared&&!e.ascended)throw Error("请先突破筑基");
 const stage=stageAt(catalog,floor),hero=getHeroStats(s,catalog),enemy=opponentStats(stage);
 const combat=fight({hero,enemy},s.seed);
 s.seed=combat.nextSeed;e.battleCount++;
 events.push({type:"BattleResolved",floor,won:combat.won,turns:combat.turns});
 let stones=0,xp=0,firstClear=false,levelUps=0;
 if(combat.won){
  e.winCount++;
  firstClear=!e.currentRunFirstClear[stage.id];
  const eff=effects(s,catalog);
  const stoneFactor=1+Math.min(12,eff.stoneGainPct/100);
  const xpFactor=1+Math.min(12,eff.xpGainPct/100);
  stones=Math.floor(stage.stones*(1+(firstClear?.5:0))*stoneFactor);
  xp=Math.floor(stage.cultivationXp*(1+(firstClear?.5:0))*xpFactor);
  e.currentRunFirstClear[stage.id]=true;
  s.meta.accountFirstClear[stage.id]=true;
  s.run.stones+=stones;s.run.cultivationXp+=xp;s.run.earnedXp+=xp;
  levelUps=levelFromXp(s,catalog);
  events.push({type:"Reward",stones,xp,firstClear});
  if(e.mode==="push"&&floor===e.highestCleared+1){
    e.highestCleared=floor;s.meta.bestDepth=Math.max(s.meta.bestDepth,floor);
    events.push({type:"NewDepth",depth:floor});
    for(const pack of Object.values(catalog.packs)){
      if(pack.unlockedAt===floor)events.push({type:"PackUnlocked",id:pack.id,name:pack.name});
    }
    if(floor===catalog.ascension.requiredCleared&&!e.ascended){
      e.mode="farm";e.farmFloor=floor;e.farmReason="gate";
      events.push({type:"RealmGate",requiredPill:"筑基丹",level:catalog.ascension.requiredLevel});
    }else if(floor===STAGE_LIMIT){
      e.mode="farm";e.farmFloor=floor;e.farmReason=null;
      events.push({type:"PrototypeComplete"});
    }
  }
 }else{
  e.lossCount++;
  if(e.highestCleared>0){e.mode="farm";e.farmFloor=e.highestCleared;e.farmReason="defeat";
    events.push({type:"AutoFarm",floor:e.farmFloor});}
  else e.mode="paused";
 }
 return {stageId:stage.id,floor,enemyName:stage.enemyName,won:combat.won,stones,xp,
  firstClear,levelUps,heroLevel:s.run.hero.level,combat,modeAfter:e.mode,depth:e.highestCleared};
}
function weightedCard(state,pack,catalog){
 const byTier={};
 for(const c of pack.cards)(byTier[c.rarity]??=[]).push(c);
 const r=random(state)*100;
 let progress=0,tier="huang";
 for(const [k,w] of Object.entries(catalog.weights)){
  progress+=w;if(r<progress){tier=k;break;}
 }
 const pool=byTier[tier]||pack.cards;
 return pool[Math.floor(random(state)*pool.length)];
}
function tryAutoResume(state,catalog,events){
 const e=state.run.exploration;
 if(e.mode!=="farm"||e.farmReason!=="defeat"||e.highestCleared>=STAGE_LIMIT)return;
 const p=previewForFloor(state,catalog,e.highestCleared+1);
 // The check happens only after drawing, never on every farming tick.
 if(p.hitsToKill<=p.hitsToFall){
   e.mode="push";e.farmReason=null;
   events.push({type:"AutoRetry",floor:e.highestCleared+1});
 }
}
function draw(s,cmd,catalog,events){
 const pack=catalog.packs[cmd.packId];
 if(!pack||!packUnlocked(s,pack))throw Error("卡包尚未解锁");
 if(![1,10].includes(cmd.count))throw Error("只支持单抽或十连");
 assertSpend(s,pack.cost*cmd.count);
 s.run.stones-=pack.cost*cmd.count;
 const g=s.run.gacha;
 const outcomes=[];
 for(let i=0;i<cmd.count;i++){
  let card;
  // A disclosed guaranteed starting weapon teaches that power comes from draws.
  if(pack.id==="battle"&&g.packDraws.battle===0){
    card=catalog.cards["B-01"];
  }else if(pack.pityTarget&&g.sinceKeyPill>=pack.pityAt-1){
    card=catalog.cards[pack.pityTarget];
  }else card=weightedCard(s,pack,catalog);
  if(!card||card.packId!==pack.id)throw Error("卡池配置异常");
  g.packDraws[pack.id]++;
  if(pack.pityTarget)g.sinceKeyPill=card.id===pack.pityTarget?0:g.sinceKeyPill+1;
  if(pack.id==="elixir"){
    if(card.effect==="realmPill")g.pills[card.id]=(g.pills[card.id]||0)+1;
    else if(card.effect==="instantXp"){
      s.run.cultivationXp+=card.value;
      s.run.earnedXp+=card.value;
    }else if(card.effect==="instantHp")s.run.hero.pillStats.hp+=card.value;
    else if(card.effect==="instantAttack")s.run.hero.pillStats.attack+=card.value;
    else if(card.effect==="instantAll")s.run.hero.pillAllPct+=card.value;
  }else g.cards[card.id]=(g.cards[card.id]||0)+1;
  const ups=levelFromXp(s,catalog);
  outcomes.push({id:card.id,name:card.name,rarity:card.rarity,description:card.description,
    copies:g.cards[card.id]||g.pills[card.id]||0,levelUps:ups});
 }
 tryAutoResume(s,catalog,events);
 events.push({type:"PackDrawn",packId:pack.id,count:cmd.count,items:outcomes,cost:pack.cost*cmd.count});
 return {packId:pack.id,count:cmd.count,cost:pack.cost*cmd.count,items:outcomes};
}
function breakthrough(s,catalog,events){
 const e=s.run.exploration,h=s.run.hero,req=catalog.ascension;
 if(e.ascended)throw Error("已完成筑基突破");
 if(e.highestCleared<req.requiredCleared)throw Error("必须先击败第20层守关者");
 if(h.level<req.requiredLevel)throw Error("修为等级不足，需要达到 Lv."+req.requiredLevel+"。抽修为包提高等级上限与修炼速度");
 if(!(s.run.gacha.pills[req.requiredPill]>0))throw Error("缺少筑基丹，请抽取丹道宝匣");
 s.run.gacha.pills[req.requiredPill]--;
 h.realm="zhuji";e.ascended=true;e.mode="push";e.farmReason=null;
 events.push({type:"RealmBreakthrough",realm:"筑基",consumedPill:req.requiredPill});
 return {realm:"zhuji",consumedPill:req.requiredPill,stats:getHeroStats(s,catalog)};
}
function previewForFloor(s,catalog,floor){
 const stage=stageAt(catalog,floor),hero=getHeroStats(s,catalog),enemy=opponentStats(stage);
 const heroHit=damage(hero.attack,enemy.defense),enemyHit=damage(enemy.attack,hero.defense);
 const hitsToKill=Math.ceil(enemy.hp/heroHit),hitsToFall=Math.ceil(hero.hp/enemyHit);
 return {stage,hero,enemy,heroHit,enemyHit,hitsToKill,hitsToFall,
   likelyOutcome:hitsToKill<=hitsToFall?"优势":"劣势"};
}
export function battlePreview(s,catalog){
 const e=s.run.exploration,p=previewForFloor(s,catalog,e.mode==="farm"?Math.max(1,e.farmFloor):Math.min(STAGE_LIMIT,e.highestCleared+1));
 const eff=effects(s,catalog);
 return {...p,cap:levelCap(s,catalog),xpRequired:experienceNeeded(s.run.hero.level),
   stoneBonusPct:Math.min(1200,eff.stoneGainPct),xpBonusPct:Math.min(1200,eff.xpGainPct),
   speedPct:Math.min(60,eff.speedPct),gateLocked:e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended,
   pillCount:s.run.gacha.pills[catalog.ascension.requiredPill]||0};
}
