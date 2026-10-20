import {simulateEncounter,assessEncounter,encounterWaves,MAP_STYLES,STYLE_LABELS,combatStyle} from "./combat-depth.mjs";
import {pullFate,permanentEffect,ownedApex} from "./relic-pool.mjs";
import {startIdle,claimIdle,stopIdle,battleIntervalMs} from "./idle.mjs";
import {validateContentContract,unlockedPack} from "./modules.mjs";
import {EQUIPMENT_SLOTS,validateEquipmentCards,verifyEquipment,equipmentStats,equipItem} from "./equipment.mjs";
import {ARTIFACT_SLOTS,validateArtifacts,verifyArtifacts,equipArtifact,artifactBonuses} from "./artifacts.mjs";
import {inventory,validateInventory,rollBoxDrop,openBox,brew,prepareItem,unlockAutoPotion,setAutoPotion} from "./treasure.mjs";
/** v0.8 preview. All battle, gacha and progression mutations live here, never in the UI. */
export const SAVE_KEY="gacha-ascension-v8-slice-v1";
export const SCHEMA=8;
const deep=x=>structuredClone(x), clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const nat=n=>Number.isSafeInteger(n)&&n>=0;
export function loadCatalog(world,slice){
 if(world?.maps?.length!==24||world?.cultivation?.length!==20||slice?.version!=="0.8-playable-slice-1")throw Error("版本化地图/卡池配置缺失");
 if(slice.playableMaps!==4||slice.packs.length!==9||!nat(slice.checkpointsPerMap)||!finite(slice.balance.mapHpFactor))throw Error("可玩切片配置有误");
 validateContentContract(slice);
 if(!Array.isArray(slice.farmTargets)||slice.farmTargets.length!==3||
  new Set(slice.farmTargets.map(x=>x.id)).size!==3||
  slice.farmTargets.some(x=>!["balanced","stones","cultivation"].includes(x.id)||
    ["hpFactor","attackFactor","stoneFactor","qiFactor"].some(k=>!finite(x[k])||x[k]<=0)))throw Error("刷怪目标配置错误");
 validateEquipmentCards(slice.packs.flatMap(p=>p.cards));
 validateArtifacts(slice.packs.flatMap(p=>p.cards));
 for(const kind of ["mob","guardian","boss"])for(const type of ["gear","herb"]){const p=slice.dropRates?.[kind]?.[type];if(!finite(p)||p<0||p>1)throw Error("怪物宝箱概率配置异常")}
 const ids=new Set(),cards={};
 for(const p of slice.packs)for(const c of p.cards){
  if(ids.has(c.id))throw Error("重复卡牌 "+c.id);ids.add(c.id);cards[c.id]={...c,pack:p.id};
 }
 return {...slice,maps:world.maps.slice(0,slice.playableMaps),allMaps:world.maps,
  realms:world.cultivation,packById:Object.fromEntries(slice.packs.map(x=>[x.id,x])),cards};
}
export function createSave(seed=20261020){
 if(!nat(seed)||seed===0||seed>0xffffffff)throw Error("随机种子错误");
 return {schemaVersion:SCHEMA,seed,seq:0,receipts:{},receiptOrder:[],
  meta:{fate:0,reincarnations:0,bestMap:1,bestCheckpoint:1,relics:{},ultras:{},apex:{},pity:0,pityXian:0,totalFateChests:0},
  run:createRun()};
}
function createRun(){return {mapIndex:0,checkpoint:0,bossCleared:false,realmIndex:0,qi:0,insight:0,
 stones:110,farmFocus:"balanced",equipment:{},artifacts:{},boxes:{gear:0,herb:0},herbs:{},consumables:{},prepared:{},cards:{},pills:{"D004":0},pillPity:0,draws:{},technique:null,pet:null,
 victories:0,mobKills:0,guardianWins:0,bossWins:0,losses:0,
 totalEarned:0,totalSpent:0,lastBattle:null};}
export function validateSave(s,c){
 if(s?.schemaVersion!==SCHEMA||!nat(s.seq)||!nat(s.seed)||!s.seed||!s.meta||!s.run)throw Error("不支持的存档版本");
 const r=s.run,m=s.meta;
 if(!nat(r.mapIndex)||r.mapIndex>=c.playableMaps||!nat(r.checkpoint)||r.checkpoint>=c.checkpointsPerMap)throw Error("地图位置损坏");
 if(!nat(r.realmIndex)||r.realmIndex>4||!nat(r.stones)||!nat(r.qi)||!nat(r.insight)||!nat(m.fate)||!nat(m.reincarnations)||!nat(m.bestMap))throw Error("资源数据损坏");
 if(!r.cards||!r.draws||!r.pills||!m.relics||!m.ultras||!nat(r.victories)||!nat(r.totalEarned)||!nat(r.totalSpent)||!nat(r.losses))throw Error("存档字段错误");
 if(r.farmFocus!==undefined&&!c.farmTargets.some(x=>x.id===r.farmFocus))throw Error("刷怪目标异常");
 if(r.totalEarned+110!==r.stones+r.totalSpent)throw Error("灵石流水账不一致");
 for(const [id,count] of Object.entries(r.cards))if(!c.cards[id]||!nat(count))throw Error("未知卡牌或数量损坏");
 verifyEquipment(s,c);
 verifyArtifacts(s,c);validateInventory(s);
 for(const k of ["technique","pet"])if(r[k]!==null&&(!r.cards[r[k]]||c.cards[r[k]].effect!==k))throw Error("未持有的装备");
 for(const [id,count] of Object.entries(m.relics))if(!c.relics.some(x=>x.id===id)||!nat(count))throw Error("遗物记录损坏");
 if(m.apex&&Object.keys(m.apex).some(id=>!c.apex.some(x=>x.id===id)))throw Error("未知太古异宝");
 if(m.pityXian!==undefined&&!nat(m.pityXian))throw Error("仙阶保底进度损坏");
 if(Object.keys(m.ultras).some(id=>!c.ultras.some(x=>x.id===id)))throw Error("未知鸿蒙遗物");
 return s;
}
function roll(s){let x=s.seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.seed=(x>>>0)||0x9e3779b9;return s.seed/4294967296}
function relicCount(s,key){return s.meta.relics[key]||0}
function metaPct(s,c,stat){return permanentEffect(s,c,stat)}
function cardCount(s,id){return s.run.cards[id]||0}
function sumEffect(s,c,key){return Object.values(c.cards).reduce((a,card)=>a+(card.effect===key?cardCount(s,card.id)*card.value:0),0)}
function cave(s,c,style){return Object.values(c.cards).reduce((n,x)=>n+(x.effect==="cave"&&x.style===style?cardCount(s,x.id)*x.value:0),0)}
const hasUltra=(s,id)=>!!s.meta.ultras[id];
const applyPct=(x,pct)=>x*(1+clamp(pct,0,1500)/100);
export function heroStats(s,c){
 const r=s.run,b=c.balance;
 const realm=c.realms[r.realmIndex];
 const realmFactor=Math.pow(c.realm.breakStatSmall,r.realmIndex)*(r.realmIndex>=4?c.realm.breakStatMajor:1);
 const all=sumEffect(s,c,"allPct");
 const gear=equipmentStats(s,c);
 const attack=Math.max(1,Math.round(applyPct(29*realmFactor+metaPct(s,c,"flatAttack")+gear.attack,all+sumEffect(s,c,"attackPct")+metaPct(s,c,"attackPct"))));
 const hp=Math.max(1,Math.round(applyPct(260*realmFactor+metaPct(s,c,"flatHp")+gear.hp,all+sumEffect(s,c,"hpPct")+metaPct(s,c,"hpPct"))));
 const defense=Math.max(1,Math.round(applyPct(12*realmFactor+gear.defense,all+sumEffect(s,c,"defPct"))));
 return {name:realm.name,attack,hp,defense,realmFactor};
}
export function yields(s,c){
 const caveMult=hasUltra(s,"U003")?3:1;
 const stonePct=clamp(sumEffect(s,c,"stonePct")+cave(s,c,"stone")*caveMult,0,600)+metaPct(s,c,"stonePct");
 const qiPct=clamp(sumEffect(s,c,"qiPct")+cave(s,c,"qi")*caveMult,0,600)+metaPct(s,c,"qiPct");
 const speedPct=clamp(sumEffect(s,c,"speedPct")+cave(s,c,"speed")+equipmentStats(s,c).speedPct,0,60);
 return {stonePct,qiPct,speedPct,petPct:cave(s,c,"pet")+metaPct(s,c,"petPct")};
}
export function progress(s,c){
 const r=s.run,m=c.maps[r.mapIndex];
 return {map:m,stage:r.checkpoint+1,of:c.checkpointsPerMap,
  finalGuardian:r.checkpoint===c.checkpointsPerMap-1,bossCleared:r.bossCleared,
  realm:c.realms[r.realmIndex],nextRealm:c.realms[Math.min(r.realmIndex+1,19)]};
}
export function breakthroughRequirements(s,c){
 const i=s.run.realmIndex,r=c.realms[i],qi=r.nextQiCost,insight=r.nextInsightCost;
 const needsPill=i===3,needBoss=needsPill&&!s.run.bossCleared;
 const needMapMilestone=i<3&&s.run.mapIndex<=i;
 return {qi,insight,needsPill,needBoss,needMapMilestone,pillName:needsPill?"筑基丹":null,
  hasQi:s.run.qi>=qi,hasInsight:s.run.insight>=insight,hasPill:!needsPill||!!s.run.pills.D004,
  canBreak:i<4&&!needMapMilestone&&s.run.qi>=qi&&s.run.insight>=insight&&(!needsPill||(s.run.bossCleared&&s.run.pills.D004>0))};
}
export function farmTarget(s,c){
 return c.farmTargets.find(x=>x.id===(s.run.farmFocus||"balanced"))||c.farmTargets[0];
}
function enemy(s,c,kind){
 const {mapIndex,checkpoint}=s.run,k=checkpoint,m=mapIndex,b=c.balance;
 const boss=kind==="boss",guard=kind==="guardian";
 const mh=Math.pow(b.mapHpFactor,m)*Math.pow(b.checkpointHpFactor,k);
 const ma=Math.pow(b.mapAttackFactor,m)*Math.pow(b.checkpointAtkFactor,k);
 const md=Math.pow(b.mapDefenseFactor,m)*Math.pow(b.checkpointDefenseFactor,k);
 const target=kind==="mob"?farmTarget(s,c):null;
 const hp=Math.round(b.mobHp*mh*(boss?b.bossHp:guard?b.guardianHp:target.hpFactor));
 const atk=Math.round(b.mobAttack*ma*(boss?b.bossAttack:guard?b.guardianAttack:target.attackFactor));
 const def=Math.round(b.mobDefense*md*(boss?1.8:guard?1.35:1));
 const map=c.maps[m];
 const tags=m===1?["evasion"]:m===2?["regen"]:m===3?["counter"]:["thick_hide"];
 return {hp,attack:atk,defense:def,name:boss?map.boss.name:guard?map.name+"守卫":map.name+"·"+target.name,
  traits:boss?tags:["mob"],type:kind};
}
export function enemyPreview(s,c,kind="mob"){return enemy(s,c,kind)}
function technique(s,c){
 const id=s.run.technique,card=id?c.cards[id]:null;
 if(!card)return {style:"none",power:0};
 const level=cardCount(s,id);
 return {style:card.style,power:card.value*level*(hasUltra(s,"U004")?2.5:1)};
}
function pet(s,c){
 const id=s.run.pet,card=id?c.cards[id]:null;
 if(!card)return {style:"none",power:0};
 const base=card.value*cardCount(s,id)*(1+yields(s,c).petPct/100)*(ownedApex(s,"A002")?1.8:1);
 return {style:card.style,power:base*(hasUltra(s,"U002")?4:1)};
}
/** Preview is a seeded *sample* disconnected from the actual next battle RNG.
 * Live battle explicitly supplies state.seed and advances that seed once.
 */
export function combatSnapshot(s,c,kind){
 const h=heroStats(s,c),f=enemy(s,c,kind),t=technique(s,c),p=pet(s,c),index=s.run.mapIndex;
 const a=artifactBonuses(s,c),prepared=s.run.prepared||{},auto=s.meta.autoPotion;
 h.attack=Math.max(1,Math.round(h.attack*(1+(a.strike+(prepared.MED003?15:0))/100)));
 h.defense=Math.max(0,Math.round(h.defense*(1+(a.ward+(prepared.MED002?15:0))/100)));
 f.attack=Math.max(1,Math.round(f.attack*(1-a.curse/100)));
 const healing={auto:!!auto?.unlocked&&!!auto.enabled,threshold:auto?.threshold??.35,
  available:s.run.consumables?.MED001||0,prepared:prepared.MED001||0};
 return {hero:h,enemy:f,tech:t,pet:p,heroUltra:hasUltra(s,"U001"),
  kind,mapIndex:index,heroSpeedPct:Math.min(60,yields(s,c).speedPct+a.blessing),
  apexDamageMultiplier:ownedApex(s,"A001")?1.4:1,healing,
  waves:encounterWaves(f,kind,index)};
}
export function combatAssessment(s,c,kind,samples=24){
 return assessEncounter(combatSnapshot(s,c,kind),samples);
}
export function combatLabels(s,c,kind){
 const data=combatSnapshot(s,c,kind);
 return {heroStyle:STYLE_LABELS[combatStyle(data.tech)],enemyStyle:STYLE_LABELS[MAP_STYLES[data.mapIndex]],
  waveCount:data.waves.length,special:data.waves.at(-1).special};
}
export function fight(s,c,kind,options={}){
 const snap=combatSnapshot(s,c,kind);
 return simulateEncounter(snap,options.seed??0x10b0ca13);
}
export function packCost(s,c,packId){
 const pack=c.packById[packId];if(!pack)throw Error("未知卡包");
 return Math.max(1,Math.round(pack.cost*Math.pow(1.9,s.run.mapIndex)));
}
function weightedCard(s,c,pack){
 const weights=c.rarityWeights,order=Object.keys(weights);
 let r=roll(s)*100,tier=order.at(-1);
 for(const k of order){r-=weights[k];if(r<0){tier=k;break}}
 let pool=pack.cards.filter(x=>x.rarity===tier);
 if(!pool.length){const available=new Set(pack.cards.map(x=>x.rarity));
  const total=Object.entries(weights).reduce((a,[name,w])=>a+(available.has(name)?w:0),0);
  let pick=roll(s)*total;
  for(const [name,w] of Object.entries(weights)){if(!available.has(name))continue;pick-=w;if(pick<0){tier=name;break}}
  pool=pack.cards.filter(x=>x.rarity===tier);
 }
 return pool[Math.floor(roll(s)*pool.length)];
}
function gainCard(s,c,card){
 const run=s.run;
 if(card.effect==="pill"){run.pills[card.id]=(run.pills[card.id]||0)+1;return}
 if(card.effect==="qiInstant"){run.qi+=card.value;return}
 if(card.effect==="insight"){run.insight+=card.value;return}
 run.cards[card.id]=(run.cards[card.id]||0)+1;
 if(card.effect==="technique"&&!run.technique)run.technique=card.id;
 if(card.effect==="pet"&&!run.pet)run.pet=card.id;
 if(card.effect==="equipment"){
  const free=EQUIPMENT_SLOTS.find(slot=>slot.type===card.equipmentSlot&&!(run.equipment||{})[slot.id]);
  if(free)equipItem(s,c,free.id,card.id);
 }
 if(card.effect==="artifact"){
  const free=ARTIFACT_SLOTS.find(slot=>run.realmIndex>=slot.realmIndex&&!(run.artifacts||{})[slot.id]);
  if(free)equipArtifact(s,c,free.id,card.id);
 }
}
function draw(s,c,{packId,count}){
 const pack=c.packById[packId];
 if(!pack||!(count===1||count===10))throw Error("不支持的卡包/抽数");
 if(!unlockedPack(s,c,packId))throw Error("该卡包尚未解锁，请继续探索里程碑");
 const price=packCost(s,c,packId)*count;
 if(s.run.stones<price)throw Error("灵石不足，先刷当前关小怪");
 s.run.stones-=price;s.run.totalSpent+=price;
 const items=[];
 for(let i=0;i<count;i++){
  let card;
  if(packId==="battle"&&!(s.run.draws.battle||0))card=c.cards.B001;
  else if(packId==="elixir"&&s.run.pillPity>=c.realmPillPity-1)card=c.cards.D004;
  else card=weightedCard(s,c,pack);
  if(packId==="elixir")s.run.pillPity=card.id==="D004"?0:s.run.pillPity+1;
  if(packId==="cultivation")s.run.insight+=1; // Every cultivation draw provides deterministic enlightenment.
  s.run.draws[packId]=(s.run.draws[packId]||0)+1;
  gainCard(s,c,card);
  items.push({...card,copies:s.run.cards[card.id]??s.run.pills[card.id]??1});
 }
 return {kind:"draw",items,cost:price,packId};
}
function battle(s,c,kind){
 if(!["mob","guardian","boss"].includes(kind))throw Error("无效战斗类型");
 const r=s.run;
 if(r.bossCleared&&kind!=="mob")throw Error("四张地图Boss已通关，可以继续刷当前小怪、轮回或突破筑基");
 const isLast=r.checkpoint===c.checkpointsPerMap-1;
 if(kind==="boss"&&!isLast)throw Error("需要先击败该图全部关卡守卫");
 if(kind==="guardian"&&isLast)throw Error("此关需要挑战地图Boss");
 const result=fight(s,c,kind,{seed:s.seed}),k=r.checkpoint,m=r.mapIndex;
 s.seed=result.nextSeed;
 const items=inventory(s);
 items.consumables.MED001=Math.max(0,(items.consumables.MED001||0)-(result.usedAuto||0));
 items.prepared.MED001=Math.max(0,(items.prepared.MED001||0)-(result.usedPrepared||0));
 // Non-healing combat consumables are spent once at encounter start.
 for(const id of ["MED002","MED003"])if(items.prepared[id])items.prepared[id]--;
 const potionUses={auto:result.usedAuto||0,prepared:result.usedPrepared||0};
 if(result.won){
  r.victories++;
  const economic=yields(s,c),b=c.balance;
  const rewardFactor=Math.pow(b.mapRewardFactor,m)*Math.pow(b.checkpointRewardFactor,k);
  let stones=Math.max(1,Math.round(b.stonesPerKill*rewardFactor*(1+economic.stonePct/100)*(kind==="mob"?1:kind==="guardian"?1.8:4)));
  let qi=Math.max(1,Math.round(b.qiPerKill*Math.pow(1.67,m)*Math.pow(1.07,k)*(1+economic.qiPct/100)*(kind==="mob"?1:kind==="guardian"?1.6:3)));
  if(kind==="mob"){
   const target=farmTarget(s,c);
   stones=Math.max(1,Math.round(stones*target.stoneFactor));
   qi=Math.max(1,Math.round(qi*target.qiFactor));
  }
  if(s.run.pet&&c.cards[s.run.pet]?.style==="qi")qi=Math.round(qi*(1+pet(s,c).power/100));
  if(ownedApex(s,"A004"))stones=Math.max(1,Math.round(stones*1.5));
  if(ownedApex(s,"A003"))qi=Math.max(1,Math.round(qi*1.5));
  if(!Number.isSafeInteger(stones)||!Number.isSafeInteger(qi)||!Number.isSafeInteger(r.stones+stones)||!Number.isSafeInteger(r.qi+qi))throw Error("资源即将超出安全整数范围；待升级大数模块");
  r.stones+=stones;r.qi+=qi;r.totalEarned+=stones;
  const boxes=rollBoxDrop(s,c,kind,()=>roll(s));
  if(kind==="mob"){r.mobKills++}
  else if(kind==="guardian"){r.guardianWins++;r.checkpoint++;
   s.meta.bestCheckpoint=Math.max(s.meta.bestCheckpoint,r.mapIndex*c.checkpointsPerMap+r.checkpoint+1);
  }else{
   r.bossWins++;
   if(m+1<c.playableMaps){r.mapIndex++;r.checkpoint=0;s.meta.bestMap=Math.max(s.meta.bestMap,r.mapIndex+1)}
   else {r.bossCleared=true;s.meta.bestMap=4}
  }
  return {kind:"battle",type:kind,won:true,combat:result,stones,qi,mapBefore:m,checkpointBefore:k,
   mapAfter:r.mapIndex,checkpointAfter:r.checkpoint,bossCleared:r.bossCleared,boxes,potionUses};
 }
 r.losses++;
 let lostGear=null;
 const slots=Object.entries(r.equipment||{}).filter(([,id])=>!!id);
 if(slots.length&&roll(s)<.5){
  const [slot,id]=slots[Math.floor(roll(s)*slots.length)];
  lostGear={slot,id,name:c.cards[id].name};
  delete r.equipment[slot];
  r.cards[id]--;
  if(!r.cards[id])delete r.cards[id];
 }
 return {kind:"battle",type:kind,won:false,combat:result,stones:0,qi:0,mapBefore:m,checkpointBefore:k,
  mapAfter:r.mapIndex,checkpointAfter:r.checkpoint,bossCleared:r.bossCleared,
  lostGear,potionUses,boxes:[]};
}
function breakthrough(s,c){
 const r=s.run,needs=breakthroughRequirements(s,c);
 if(r.realmIndex>=4)throw Error("本次可玩切片最高至筑基初期");
 if(!needs.canBreak){
  if(needs.needMapMilestone)throw Error("先击败当前地图Boss，取得下一小境界的突破资格");
  if(!needs.hasQi)throw Error("修为不足，还需积累 "+(needs.qi-r.qi));
  if(!needs.hasInsight)throw Error("悟道不足，抽取修为造化卡包");
  if(needs.needBoss)throw Error("请先击败雾隐剑冢地图Boss");
  if(!needs.hasPill)throw Error("缺少筑基丹，请抽丹道宝匣");
  throw Error("突破条件未满足");
 }
 r.qi-=needs.qi;r.insight-=needs.insight;
 if(needs.needsPill)r.pills.D004--;
 r.realmIndex++;
 return {kind:"breakthrough",name:c.realms[r.realmIndex].name,spentQi:needs.qi,spentInsight:needs.insight,spentPill:needs.needsPill};
}
function reincarnate(s,c){
 if(!s.run.bossCleared)throw Error("击败第四张地图Boss后才能首次轮回");
 const old=s.run,earned=55+Math.max(0,old.realmIndex-3)*10;
 s.meta.fate+=earned;s.meta.reincarnations++;
 s.run=createRun();return {kind:"reincarnate",earned,fate:s.meta.fate,round:s.meta.reincarnations};
}
function openRelic(s,c){return pullFate(s,c,()=>roll(s))}
export function dispatch(current,c,cmd){
 if(!cmd||cmd.seq!==current.seq+1||typeof cmd.type!=="string")throw Error("交易序号异常");
 const s=deep(current),r=s.run;let result;
 const idleCombat=(st,cat)=>battle(st,cat,"mob");
 const interval=(st,cat)=>battleIntervalMs(st,cat,yields,(x,y)=>fight(x,y,"mob",{seed:x.seed}));
 // Resolve any past idle period before equipment, card or realm mutations.
 if(r.idle?.active&&Number.isSafeInteger(cmd.now)&&!["START_IDLE","CLAIM_IDLE","STOP_IDLE"].includes(cmd.type))
  claimIdle(s,c,cmd.now,idleCombat,interval);
 switch(cmd.type){
 case "DRAW":result=draw(s,c,cmd);break;
 case "BATTLE":{
  if(cmd.enemyType==="mob"&&Number.isSafeInteger(cmd.now)){
   if(r.idle?.active)throw Error("当前正在自动挂机，无需手动重复结算小怪");
   if(cmd.now<(r.nextManualMobAt||0))throw Error("普通小怪尚未刷新，请等待下一次战斗");
   r.nextManualMobAt=cmd.now+interval(s,c);
  }
  if(cmd.enemyType!=="mob"&&Number.isSafeInteger(cmd.now)){
   if(cmd.now<(r.nextChallengeAt||0))throw Error("挑战尚在冷却中，请等待战斗结束");
   r.nextChallengeAt=cmd.now+Math.ceil(fight(s,c,cmd.enemyType,{seed:s.seed}).timeMs);
  }
  result=battle(s,c,cmd.enemyType);break;
 }
 case "BREAKTHROUGH":result=breakthrough(s,c);break;
 case "EQUIP_TECH":{
  const id=cmd.id;if(id!==null&&(c.cards[id]?.effect!=="technique"||!r.cards[id]))throw Error("功法未拥有");
  r.technique=id;result={kind:"equip",slot:"technique",id};break}
 case "EQUIP_ITEM":result=equipItem(s,c,cmd.slot,cmd.id);break;
 case "EQUIP_ARTIFACT":result=equipArtifact(s,c,cmd.slot,cmd.id);break;
 case "OPEN_BOX":result=openBox(s,c,cmd.id,()=>roll(s));break;
 case "BREW":result=brew(s,cmd.id,cmd.count||1);break;
 case "PREPARE_ITEM":result=prepareItem(s,cmd.id);break;
 case "UNLOCK_AUTO_POTION":result=unlockAutoPotion(s);break;
 case "SET_AUTO_POTION":result=setAutoPotion(s,cmd.enabled,cmd.threshold);break;
 case "EQUIP_PET":{
  const id=cmd.id;if(id!==null&&(c.cards[id]?.effect!=="pet"||!r.cards[id]))throw Error("灵宠未拥有");
  r.pet=id;result={kind:"equip",slot:"pet",id};break}
 case "REINCARNATE":result=reincarnate(s,c);break;
 case "OPEN_RELIC":result=openRelic(s,c);break;
 case "START_IDLE":result=startIdle(s,cmd.now);break;
 case "CLAIM_IDLE":result=claimIdle(s,c,cmd.now,idleCombat,interval);break;
 case "STOP_IDLE":result=stopIdle(s,c,cmd.now,idleCombat,interval);break;
 case "SET_FARM_FOCUS":{
  if(!c.farmTargets.some(x=>x.id===cmd.id))throw Error("不支持的刷怪目标");
  r.farmFocus=cmd.id;result={kind:"farmFocus",id:cmd.id};break;
 }
 default:throw Error("未定义的玩法指令 "+cmd.type);
 }
 s.seq=cmd.seq;
 if(result.kind==="battle"){s.run.lastBattle={type:result.type,won:result.won,turns:result.combat.turns,stones:result.stones,qi:result.qi,boxes:result.boxes,lostGear:result.lostGear||null,potionUses:result.potionUses}}
 validateSave(s,c);
 return {state:s,result};
}
