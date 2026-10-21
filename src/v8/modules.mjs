/**
 * Extensible gameplay module contract.
 * A system must declare its state scope, reward source, allowed actions,
 * and whether its effects are present in the runnable slice.
 * Registry does not by itself unlock unfinished content.
 */
export const EFFECT_KEYS=Object.freeze([
 "attackPct","hpPct","defPct","allPct","stonePct","qiPct","speedPct",
 "insight","technique","cave","pet","pill","qiInstant","equipment","artifact"
]);
export const MODULES=Object.freeze([
 {id:"gather",name:"采药",scope:"run",source:"activity",status:"live",panel:"cave"},
 {id:"meditate",name:"闭关",scope:"run",source:"activity",status:"live",panel:"cultivate"},
 {id:"production",name:"洞府生产",scope:"run",source:"activity",status:"live",panel:"cave"},
 {id:"lineage",name:"见闻与道统",scope:"meta",source:"milestone",status:"live",panel:"fate"},
 {id:"battle",name:"战力",scope:"run",source:"gacha",status:"live",panel:"gacha"},
 {id:"wealth",name:"聚财",scope:"run",source:"gacha",status:"live",panel:"gacha"},
 {id:"cultivation",name:"修炼",scope:"run",source:"gacha",status:"live",panel:"cultivate"},
 {id:"technique",name:"功法",scope:"run",source:"gacha",status:"live",panel:"technique"},
 {id:"cave",name:"洞府",scope:"run",source:"gacha",status:"live",panel:"cave"},
 {id:"pet",name:"灵宠",scope:"run",source:"gacha",status:"live",panel:"pet"},
 {id:"elixir",name:"丹道",scope:"run",source:"gacha",status:"live",panel:"gacha"},
 {id:"equipment",name:"器物秘匣",scope:"run",source:"gacha",status:"live",panel:"explore"},
 {id:"artifact",name:"法器天机",scope:"run",source:"gacha",status:"live",panel:"explore"},
 {id:"fate",name:"轮回天命",scope:"meta",source:"reincarnation",status:"live",panel:"fate"},
 {id:"explore",name:"地图战斗",scope:"run",source:"combat",status:"live",panel:"explore"},
 {id:"idle",name:"离线刷怪",scope:"run",source:"combat",status:"live",panel:"explore"},
 {id:"artifact",name:"法宝",scope:"run",source:"gacha",status:"planned",panel:"artifact"},
 {id:"sect",name:"宗门",scope:"meta",source:"gacha",status:"planned",panel:"sect"},
 {id:"ascension",name:"飞升",scope:"meta",source:"boss",status:"planned",panel:"ascension"}
]);
const PACKS=new Set(MODULES.filter(m=>m.source==="gacha"&&m.status==="live").map(x=>x.id));
export function validateContentContract(config){
 if(!config||!Array.isArray(config.packs)||!config.features?.unlockAtGlobalCheckpoint)throw Error("缺少系统解锁注册表");
 const effects=new Set(EFFECT_KEYS);
 const management=config.management;
 if(!management||["offlineCapMs","gatherMs","meditateMs","fieldMs","brewMs","meditateQi","herbCap","potionCap","queueSlots","directedEvery","realmQiFactor"].some(k=>!Number.isSafeInteger(management[k])||management[k]<1)||management.offlineCapMs!==86400000||management.relearnFactor!==.6)
  throw Error("经营与跨世配置无效");
 if(!Array.isArray(management.talents)||management.talents.length!==6||new Set(management.talents.map(x=>x.id)).size!==6||management.talents.some(x=>x.cost!==1||x.requires&&!management.talents.some(n=>n.id===x.requires)))throw Error("道统节点配置无效");
 for(const pack of config.packs){
  if(!PACKS.has(pack.id))throw Error("未知正式卡包系统 "+pack.id);
  if(!Number.isSafeInteger(pack.cost)||pack.cost<1)throw Error("卡包价格无效 "+pack.id);
  const unlock=config.features.unlockAtGlobalCheckpoint[pack.id];
  if(!Number.isSafeInteger(unlock)||unlock<0)throw Error("未配置解锁里程碑 "+pack.id);
  for(const card of pack.cards){
   if(!effects.has(card.effect))throw Error("卡牌效果未注册 "+card.id+": "+card.effect);
   if(!Number.isFinite(card.value)||card.value<=0)throw Error("卡牌效果数值无效 "+card.id);
  }
 }
 return true;
}
export function unlockedPack(s,c,id){
 const threshold=c.features.unlockAtGlobalCheckpoint[id];
 if(!Number.isSafeInteger(threshold)||threshold<0)return false;
 const furthest=Math.max(s.meta.bestCheckpoint||1,
  s.run.mapIndex*c.checkpointsPerMap+s.run.checkpoint+1);
 return furthest>=threshold&&(id!=="artifact"||s.run.realmIndex>=4);
}
export function unimplementedModules(){return MODULES.filter(m=>m.status==="planned")}
