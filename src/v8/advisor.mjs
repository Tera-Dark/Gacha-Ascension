/**
 * Seeded, read-only owned-card build advisor. Samples use identical seeds
 * per alternative and are intentionally detached from the live save RNG.
 */
import {combatSnapshot,breakthroughRequirements,packCost} from "./engine.mjs";
import {simulateEncounter} from "./combat-depth.mjs";
function score(s,c,kind,seeds){
 const snap=combatSnapshot(s,c,kind);
 let wins=0,remaining=0,ms=0;
 for(const seed of seeds){
  const r=simulateEncounter(snap,seed);
  wins+=Number(r.won);remaining+=r.heroRemaining/r.hero.hp;ms+=r.timeMs;
 }
 return {wins,samples:seeds.length,rate:wins/seeds.length,
  avgRemaining:remaining/seeds.length,avgMs:Math.round(ms/seeds.length)};
}
function better(a,b){
 if(a.score.wins!==b.score.wins)return a.score.wins>b.score.wins;
 if(Math.abs(a.score.avgRemaining-b.score.avgRemaining)>.03)return a.score.avgRemaining>b.score.avgRemaining;
 return a.score.avgMs<b.score.avgMs*.92;
}
export function recommendLoadout(s,c,kind="guardian",sampleCount=16){
 if(!["mob","guardian","boss"].includes(kind)||!Number.isInteger(sampleCount)||
  sampleCount<8||sampleCount>32)throw Error("无效的构筑推演参数");
 const all=Object.values(c.cards);
 const techs=[null,...all.filter(x=>x.effect==="technique"&&(s.run.cards[x.id]||0)>0).map(x=>x.id)];
 const pets=[null,...all.filter(x=>x.effect==="pet"&&(s.run.cards[x.id]||0)>0).map(x=>x.id)];
 const base=123457+s.run.mapIndex*8719+s.run.checkpoint*1031+s.run.realmIndex*593;
 const seeds=Array.from({length:sampleCount},(_,i)=>(base+i*2654435761)>>>0||1);
 const current={technique:s.run.technique,pet:s.run.pet,score:score(s,c,kind,seeds)};
 let best=current;
 for(const technique of techs)for(const pet of pets){
  if(technique===current.technique&&pet===current.pet)continue;
  const trial={...s,run:{...s.run,technique,pet}};
  const choice={technique,pet,score:score(trial,c,kind,seeds)};
  if(better(choice,best))best=choice;
 }
 return {kind,current,best,improved:best!==current&&better(best,current),
  combinations:techs.length*pets.length,
  caution:best.score.rate<.75?"推荐组合仍有死亡风险；建议继续修炼后挑战。":""};
}
export function nextStep(s,c,forecast=null){
 const r=s.run,req=breakthroughRequirements(s,c);
 if(req.canBreak&&r.realmIndex<4)return {title:"突破条件已齐",description:"境界条件已满足。先突破可获得新的基础属性，再继续探索。",view:"cultivate",action:"前往突破"};
 if(r.bossCleared){
  if(r.realmIndex>=4)return {title:"本世圆满",description:"四图和筑基境界均已达成，可选择轮回取得永久天命。",view:"fate",action:"查看轮回"};
  if(req.needsPill&&!req.hasPill)return {title:"补齐筑基丹",description:"还缺筑基丹。丹道宝匣最多还需 "+Math.max(1,c.realmPillPity-r.pillPity)+" 抽保底。",view:"gacha",action:"抽丹道宝匣"};
  if(!req.hasInsight)return {title:"补足悟道",description:"距突破还缺 "+(req.insight-r.insight)+" 点悟道；每次修为造化至少获得1点。",view:"gacha",action:"抽修为造化"};
  if(!req.hasQi)return {title:"积累突破修为",description:"突破还需 "+(req.qi-r.qi)+" 修为。切换修为优先的小怪刷取。",view:"explore",action:"返回刷怪"};
  return {title:"选择下一世",description:"四图已通关，可选择继续积累或轮回。",view:"fate",action:"查看轮回"};
 }
 if(forecast?.winRate>=.83)return {title:"守关时机已到",description:"24场模拟胜率约 "+Math.round(forecast.winRate*100)+"%。可挑战"+(r.checkpoint===c.checkpointsPerMap-1?"地图Boss":"守卫")+"；死亡可能遗失穿戴装备。",view:"explore",action:"前往挑战"};
 if(!r.technique)return {title:"先取得功法",description:"未装备主修功法。功法秘卷能解锁流派克制，当前每抽 "+packCost(s,c,"technique")+" 灵石。",view:"gacha",action:"抽功法秘卷"};
 if(!r.pet)return {title:"灵宠协同作战",description:"已有功法，但尚无出战灵宠。御兽灵契可以增加独立攻击、护盾和共鸣组合。",view:"gacha",action:"抽御兽灵契"};
 if(!Object.keys(r.equipment||{}).length&&s.meta.bestCheckpoint>=c.features.unlockAtGlobalCheckpoint.equipment)
  return {title:"补齐基础装备",description:"器物秘匣能补充十槽攻防；小怪也有概率掉落基础装备箱。",view:"gacha",action:"查看器物秘匣"};
 return {title:"调整构筑后再战",description:"当前守关模拟胜率约 "+Math.round((forecast?.winRate||0)*100)+"%。试试战前推演，再定向抽卡补齐攻防。",view:"explore",action:"查看战前推演"};
}
