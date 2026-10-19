import {STAGE_LIMIT,opponentStats,stageAt,encounterAt,packUnlocked,experienceNeeded} from "./catalog.mjs";
import {cloneM0Save,getHeroStats,effects,levelFromXp,levelCap} from "./state.mjs";
import {fight,damage,nextRandom} from "./combat.mjs";

const TYPES=new Set(["BATTLE","DRAW","BREAKTHROUGH","SET_MODE","EQUIP_TRAIT","SET_FARM_TARGET"]);
const random=state=>{const r=nextRandom(state.seed);state.seed=r.seed;return r.value};
function assertSpend(s,n){if(!Number.isSafeInteger(n)||n<0||s.run.stones<n)throw Error("灵石不足，请在已通关层继续扫荡");}
function snapshotAt(s,catalog,floor){
 const stage=stageAt(catalog,floor),hero=getHeroStats(s,catalog),enemy=opponentStats(stage,catalog);
 const selected=s.run.gacha.equippedTrait,card=selected?catalog.cards[selected]:null;
 const mechanic=card?{id:card.mechanicId,stacks:Math.min(6,s.run.gacha.cards[selected])}:null;
 return {stage,hero,enemy,mechanic};
}
function forecast(s,catalog,floor){
 const snapshot=snapshotAt(s,catalog,floor),result=fight(snapshot,s.seed);
 const defensePierce=snapshot.mechanic?.id==="pierce"?Math.min(.5,.15+.05*snapshot.mechanic.stacks):0;
 const heroHit=damage(snapshot.hero.attack,snapshot.enemy.defense,defensePierce);
 const enemyHit=damage(snapshot.enemy.attack,snapshot.hero.defense);
 return {...snapshot,heroHit,enemyHit,
  hitsToKill:Math.ceil(snapshot.enemy.hp/heroHit),hitsToFall:Math.ceil(snapshot.hero.hp/enemyHit),
  predicted:result,likelyOutcome:result.won?"优势":"劣势",
  special:encounterAt(catalog,floor)};
}
export function diagnose(s,catalog){
 const e=s.run.exploration,next=Math.min(STAGE_LIMIT,e.highestCleared+1),p=forecast(s,catalog,next);
 const pill=s.run.gacha.pills[catalog.ascension.requiredPill]||0,needed=catalog.ascension.requiredLevel;
 if(e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended)
   return {category:"gate",packId:pill?"cultivation":"elixir",heading:"境界锁：还未筑基",
     detail:!pill?"先抽丹道宝匣获取筑基丹（8抽内保底）":s.run.hero.level<needed?"筑基丹已备齐，缺少修为等级；可抽修为造化提高等级上限":"条件齐全，可以点击突破",targetFloor:next};
 if(e.highestCleared>=30)return {category:"completed",packId:null,heading:"青云30层已通关",detail:"可继续挑战个人纪录；正式轮回还未实装",targetFloor:30};
 if(levelCap(s,catalog)===s.run.hero.level && s.run.hero.level<needed&&e.highestCleared>=10)
   return {category:"cap",packId:"cultivation",heading:"修为已封顶",detail:"抽修为造化以提高等级上限，并立即兑换已储存的修为",targetFloor:next};
 if(p.predicted.won)return {category:"ready",packId:null,heading:"已具备冲关实力",detail:"按当前随机种子的战斗计算，下一层有望获胜",targetFloor:next};
 const traits=p.enemy.traitIds;
 if(traits.includes("first_burst"))
   return {category:"survival",packId:"battle",heading:"开场爆发导致生存不足",detail:"可尝试护体灵光或血量/防御卡；当前主战特性也可以免费切换",targetFloor:next};
 if(traits.includes("iron_shell"))
   return {category:"armor",packId:"battle",heading:"敌方玄甲使输出效率低",detail:"推荐战力秘藏中的裂甲真诀，也可通过普通攻击卡积累破局",targetFloor:next};
 return {category:"power",packId:"battle",heading:"当前伤害与生存不足",detail:"建议抽战力秘藏；可先刷已通关层积累灵石再重试",targetFloor:next};
}
export function battlePreview(s,catalog){
 const e=s.run.exploration,floor=e.mode==="farm"?Math.max(1,e.farmFloor):Math.min(STAGE_LIMIT,e.highestCleared+1);
 const p=forecast(s,catalog,floor),eff=effects(s,catalog);
 return {...p,cap:levelCap(s,catalog),xpRequired:experienceNeeded(s.run.hero.level),
  stoneBonusPct:Math.min(1200,eff.stoneGainPct),xpBonusPct:Math.min(1200,eff.xpGainPct),speedPct:Math.min(60,eff.speedPct),
  gateLocked:e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended,
  pillCount:s.run.gacha.pills[catalog.ascension.requiredPill]||0,
  diagnosis:diagnose(s,catalog)};
}
/** Deterministic, atomic reducer. The supplied save is never mutated. */
export function executeM0(original,cmd,catalog){
 if(!cmd||!TYPES.has(cmd.type)||!/^tx:[1-9]\d*$/.test(cmd.txnId))throw Error("无效指令或交易号");
 const signature=JSON.stringify({type:cmd.type,mode:cmd.mode??null,packId:cmd.packId??null,
  count:cmd.count??null,cardId:cmd.cardId??null,floor:cmd.floor??null});
 const prior=original.receipts[cmd.txnId];
 if(prior){
   if(prior.signature!==signature)throw Error("不能用相同交易号执行不同指令");
   return {state:original,result:structuredClone(prior.result),events:[],duplicate:true};
 }
 const seq=Number(cmd.txnId.slice(3));
 if(!Number.isSafeInteger(seq)||seq!==original.txSequence+1)throw Error("过期交易或交易号不连续");
 const s=cloneM0Save(original),events=[];
 let result;
 switch(cmd.type){
  case "BATTLE":result=runBattle(s,catalog,events);break;
  case "DRAW":result=draw(s,cmd,catalog,events);break;
  case "BREAKTHROUGH":result=breakthrough(s,catalog,events);break;
  case "SET_MODE":result=setMode(s,cmd,catalog,events);break;
  case "EQUIP_TRAIT":result=equipTrait(s,cmd,catalog,events);break;
  case "SET_FARM_TARGET":result=targetFarm(s,cmd,catalog,events);break;
 }
 s.txSequence=seq;
 s.receipts[cmd.txnId]={signature,result:structuredClone(result)};
 s.receiptOrder.push(cmd.txnId);
 if(s.receiptOrder.length>96)delete s.receipts[s.receiptOrder.shift()];
 return {state:s,result,events,duplicate:false};
}
function setMode(s,cmd,catalog,events){
 const e=s.run.exploration;
 if(!["push","farm","paused"].includes(cmd.mode))throw Error("无效探索模式");
 if(cmd.mode==="push"&&e.highestCleared>=STAGE_LIMIT)throw Error("青云地区已通关");
 if(cmd.mode==="farm"&&!e.highestCleared)throw Error("尚无可扫荡关卡");
 if(cmd.mode==="push"&&e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended)throw Error("境界锁尚未解除");
 e.mode=cmd.mode;
 if(cmd.mode==="farm")e.farmFloor=Math.max(1,e.farmFloor||e.highestCleared);
 if(cmd.mode==="push")e.farmReason=null;
 events.push({type:"ModeChanged",mode:e.mode});
 return {mode:e.mode};
}
function targetFarm(s,cmd,catalog,events){
 const e=s.run.exploration;
 if(!Number.isSafeInteger(cmd.floor)||cmd.floor<1||cmd.floor>e.highestCleared)throw Error("只能扫荡已经击败的关卡");
 e.mode="farm";e.farmFloor=cmd.floor;e.farmReason=null;
 events.push({type:"FarmTargetChanged",floor:cmd.floor});
 return {floor:cmd.floor};
}
function equipTrait(s,cmd,catalog,events){
 if(cmd.cardId!==null&&(!catalog.cards[cmd.cardId]||catalog.cards[cmd.cardId].effect!=="battleTrait"||
  !(s.run.gacha.cards[cmd.cardId]>0)))throw Error("没有拥有可装备的主战特性");
 s.run.gacha.equippedTrait=cmd.cardId;
 s.run.exploration.history.traitChanges++;
 events.push({type:"TraitEquipped",cardId:cmd.cardId,name:cmd.cardId?catalog.cards[cmd.cardId].name:"无"});
 autoRetry(s,catalog,events);
 return {cardId:cmd.cardId};
}
function runBattle(s,catalog,events){
 const e=s.run.exploration;
 if(e.mode==="paused")throw Error("探索已暂停");
 const floor=e.mode==="farm"?e.farmFloor:e.highestCleared+1;
 if(floor<1||floor>STAGE_LIMIT)throw Error("关卡越界");
 if(e.mode==="push"&&floor>catalog.ascension.requiredCleared&&!e.ascended)throw Error("需要先突破筑基");
 const {stage,...snap}=snapshotAt(s,catalog,floor),combat=fight(snap,s.seed);
 s.seed=combat.nextSeed;e.battleCount++;
 events.push({type:"BattleResolved",floor,won:combat.won,turns:combat.turns,procs:combat.mechanicProcs,
  absorbed:combat.absorbed,regen:combat.regenTotal});
 let stones=0,xp=0,firstClear=false,levelUps=0;
 if(combat.won){
  e.winCount++;
  firstClear=!e.currentRunFirstClear[stage.id];
  const eff=effects(s,catalog),economy=catalog.economy,elite=encounterAt(catalog,floor);
  const first=firstClear?1+economy.firstClearBonus:1;
  stones=Math.max(1,Math.floor(stage.stones*economy.stoneScale*(elite?.rewardScale||1)*first*(1+Math.min(4,eff.stoneGainPct/100))));
  xp=Math.max(1,Math.floor(stage.cultivationXp*economy.xpScale*first*(1+Math.min(4,eff.xpGainPct/100))));
  e.currentRunFirstClear[stage.id]=true;s.meta.accountFirstClear[stage.id]=true;
  s.run.stones+=stones;s.run.cultivationXp+=xp;s.run.earnedXp+=xp;
  e.history.totalStonesEarned+=stones;e.history.peakStones=Math.max(e.history.peakStones,s.run.stones);
  levelUps=levelFromXp(s,catalog);
  events.push({type:"Reward",stones,xp,firstClear});
  if(e.mode==="push"&&floor===e.highestCleared+1){
   e.highestCleared=floor;s.meta.bestDepth=Math.max(s.meta.bestDepth,floor);
   events.push({type:"NewDepth",depth:floor});
   for(const p of Object.values(catalog.packs))if(p.unlockedAt===floor)events.push({type:"PackUnlocked",id:p.id,name:p.name});
   if(floor===catalog.ascension.requiredCleared&&!e.ascended){
    e.mode="farm";e.farmFloor=floor;e.farmReason="gate";
    events.push({type:"RealmGate",requiredPill:"筑基丹",level:catalog.ascension.requiredLevel});
   }else if(floor===30){e.mode="farm";e.farmFloor=floor;e.farmReason=null;events.push({type:"PrototypeComplete"});}
  }
 }else{
  e.lossCount++;
  if(e.history.firstDefeatAt===null)e.history.firstDefeatAt=floor;
  if(e.highestCleared>0){e.mode="farm";e.farmFloor=e.highestCleared;e.farmReason="defeat";
   events.push({type:"AutoFarm",floor:e.farmFloor});}
  else e.mode="paused";
 }
 return {stageId:stage.id,floor,enemyName:stage.enemyName,won:combat.won,stones,xp,firstClear,levelUps,
  heroLevel:s.run.hero.level,combat,modeAfter:e.mode,depth:e.highestCleared};
}
function weightedCard(s,pack,catalog){
 const pools={};
 for(const card of pack.cards)(pools[card.rarity]??=[]).push(card);
 const roll=random(s)*100;let cumulative=0,rarity="huang";
 for(const [tier,probability] of Object.entries(catalog.weights)){cumulative+=probability;if(roll<cumulative){rarity=tier;break;}}
 const cards=pools[rarity]||pack.cards;
 return catalog.cards[cards[Math.floor(random(s)*cards.length)].id];
}
function autoRetry(s,catalog,events){
 const e=s.run.exploration;
 if(e.mode!=="farm"||e.farmReason!=="defeat"||e.highestCleared>=STAGE_LIMIT)return;
 if(forecast(s,catalog,e.highestCleared+1).predicted.won){
  e.mode="push";e.farmReason=null;
  events.push({type:"AutoRetry",floor:e.highestCleared+1});
 }
}
function draw(s,cmd,catalog,events){
 const pack=catalog.packs[cmd.packId];
 if(!pack||!packUnlocked(s,pack))throw Error("卡包尚未开放");
 if(![1,10].includes(cmd.count))throw Error("只支持单抽和十连");
 const cost=pack.cost*cmd.count;assertSpend(s,cost);s.run.stones-=cost;
 s.run.exploration.history.totalStonesSpent+=cost;
 const g=s.run.gacha,outcomes=[];
 for(let i=0;i<cmd.count;i++){
  let card;
  if(pack.id==="battle"&&g.packDraws.battle===0)card=catalog.cards["B-01"];
  else if(pack.pityTarget&&g.sinceKeyPill>=pack.pityAt-1)card=catalog.cards[pack.pityTarget];
  else card=weightedCard(s,pack,catalog);
  if(!card||card.packId!==pack.id)throw Error("卡包奖励所属分类错误");
  g.packDraws[pack.id]++;s.run.exploration.history.draws++;
  if(pack.pityTarget)g.sinceKeyPill=card.id===pack.pityTarget?0:g.sinceKeyPill+1;
  if(pack.id==="elixir"){
   if(card.effect==="realmPill")g.pills[card.id]=(g.pills[card.id]||0)+1;
   else if(card.effect==="instantXp"){s.run.cultivationXp+=card.value;s.run.earnedXp+=card.value;}
   else if(card.effect==="instantHp")s.run.hero.pillStats.hp+=card.value;
   else if(card.effect==="instantAttack")s.run.hero.pillStats.attack+=card.value;
   else if(card.effect==="instantAll")s.run.hero.pillAllPct+=card.value;
  }else {
   g.cards[card.id]=(g.cards[card.id]||0)+1;
   if(card.effect==="battleTrait"&&g.equippedTrait===null){
    g.equippedTrait=card.id;
    events.push({type:"TraitEquipped",cardId:card.id,name:card.name});
   }
  }
  const ups=levelFromXp(s,catalog);
  outcomes.push({id:card.id,name:card.name,rarity:card.rarity,description:card.description,
   copies:g.cards[card.id]||g.pills[card.id]||0,levelUps:ups,trait:card.effect==="battleTrait"});
 }
 autoRetry(s,catalog,events);
 events.push({type:"PackDrawn",packId:pack.id,count:cmd.count,items:outcomes,cost});
 return {packId:pack.id,count:cmd.count,cost,items:outcomes};
}
function breakthrough(s,catalog,events){
 const e=s.run.exploration,h=s.run.hero,req=catalog.ascension;
 if(e.ascended)throw Error("已经筑基");
 if(e.highestCleared<req.requiredCleared)throw Error("请先通关第20层守关");
 if(h.level<req.requiredLevel)throw Error("需要达到Lv."+req.requiredLevel+"（修为造化提升等级上限）");
 if(!(s.run.gacha.pills[req.requiredPill]>0))throw Error("缺少筑基丹");
 s.run.gacha.pills[req.requiredPill]--;h.realm="zhuji";e.ascended=true;e.mode="push";e.farmReason=null;
 events.push({type:"RealmBreakthrough",realm:"筑基",consumedPill:req.requiredPill});
 return {realm:"zhuji",consumedPill:req.requiredPill,stats:getHeroStats(s,catalog)};
}
