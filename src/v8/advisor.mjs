/**
 * Seeded, read-only owned-card build advisor. Samples use identical seeds
 * per alternative and are intentionally detached from the live save RNG.
 */
import {combatSnapshot,breakthroughRequirements,packCost,pendingRealmGate} from "./engine.mjs";
import {simulateEncounter} from "./combat-depth.mjs";
function score(s,c,kind,seeds){
 const snap=combatSnapshot(s,c,kind);
 let wins=0,remaining=0,ms=0,winMs=0;
 for(const seed of seeds){
  const r=simulateEncounter(snap,seed);
  wins+=Number(r.won);remaining+=r.heroRemaining/r.hero.hp;ms+=r.timeMs;
  if(r.won)winMs+=r.timeMs;
 }
 return {wins,samples:seeds.length,rate:wins/seeds.length,
  avgRemaining:remaining/seeds.length,avgMs:Math.round(ms/seeds.length),
  avgWinMs:wins?Math.round(winMs/wins):null};
}
function better(a,b){
 if(a.score.wins!==b.score.wins)return a.score.wins>b.score.wins;
 // Never recommend a configuration merely because it dies faster.
 if(a.score.wins===0)return false;
 if(Math.abs(a.score.avgRemaining-b.score.avgRemaining)>.03)return a.score.avgRemaining>b.score.avgRemaining;
 return a.score.avgWinMs<b.score.avgWinMs*.9;
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
 const gate=pendingRealmGate(s,c);
 const pick=(packId,title,description,action)=>({title,description,view:"gacha",packId,action});
 // The first three decisions should teach the loop, not overwhelm players with builds.
 if(!s.meta.reincarnations&&!r.bossCleared&&!r.guardianWins){
  const anyDraw=Object.values(r.draws).some(n=>n>0);
  if(!anyDraw)return pick("battle","首次机缘 · 抽战力卡","先花48灵石抽一张战力秘藏，第一次必出攻击强化；再学习刷怪积累资源、挑战守卫。之后还会用到功法和其他卡包。","前往首次单抽");
  if(!r.mobKills)return {title:"体验自动刷怪",description:"已获得第一张机缘！开启自动刷怪，亲眼看看逐击伤害与灵石、修为收益；打一场后再冲关。",view:"explore",action:"前往自动刷怪"};
 }
 // Once a Boss has opened a new map, breakthrough is the next mainline objective.
 // Do not advertise an unwinnable, engine-blocked guardian challenge.
 if(gate){
  if(req.canBreak)return {title:"突破至"+gate.realm,description:"上一图Boss已击败，先突破至"+gate.realm+"才能推进"+gate.map+"的守卫。",view:"cultivate",action:"前往突破"};
  if(!req.hasInsight&&r.stones<packCost(s,c,"cultivation"))
   return {title:"先攒悟道抽卡灵石",description:"即将突破至"+gate.realm+"，修为造化单抽还差"+(packCost(s,c,"cultivation")-r.stones)+"灵石。先刷当前小怪，再去抽悟道。",view:"explore",action:"前往自动刷怪"};
  if(!req.hasInsight)return pick("cultivation","突破前补悟道","已抵达"+gate.map+"，进入下一关守卫需要"+gate.realm+"。悟道还差"+(req.insight-r.insight)+"点；修为造化每抽至少获得1点悟道。","抽修为造化");
  if(!req.hasQi)return {title:"突破前补修为",description:"已抵达"+gate.map+"，先刷小怪积累"+(req.qi-r.qi)+"修为，便可突破至"+gate.realm+"并挑战守卫。",view:"explore",action:"前往自动刷怪"};
  return {title:"境界突破在即",description:"已到达下一图的境界门槛，去修炼页面检查突破要求。",view:"cultivate",action:"前往突破"};
 }
 if(req.canBreak&&r.realmIndex<4)return {title:"突破条件已齐",description:"境界条件已满足。先突破可获得新的基础属性，再继续探索。",view:"cultivate",action:"前往突破"};
 if(r.bossCleared){
  if(r.realmIndex>=4)return {title:"本世圆满",description:"四图和筑基境界均已达成，可选择轮回取得永久天命。筑基完成比提前轮回多获得10因果。",view:"fate",action:"查看轮回"};
  if(req.needsPill&&!req.hasPill&&r.stones<packCost(s,c,"elixir"))
   return {title:"积累筑基丹灵石",description:"筑基丹尚未到手，丹道单抽还差"+(packCost(s,c,"elixir")-r.stones)+"灵石；可继续刷最终地图的小怪筹备。",view:"explore",action:"前往自动刷怪"};
  if(req.needsPill&&!req.hasPill)return pick("elixir","补齐筑基丹","还缺筑基丹。丹道宝匣最多还需 "+Math.max(1,c.realmPillPity-r.pillPity)+" 抽保底。","抽丹道宝匣");
  if(!req.hasInsight&&r.stones<packCost(s,c,"cultivation"))
   return {title:"积累悟道抽卡灵石",description:"突破还缺"+(req.insight-r.insight)+"点悟道，修为造化单抽还差"+(packCost(s,c,"cultivation")-r.stones)+"灵石。",view:"explore",action:"前往自动刷怪"};
  if(!req.hasInsight)return pick("cultivation","补足悟道","距突破还缺 "+(req.insight-r.insight)+" 点悟道；每次修为造化至少获得1点。","抽修为造化");
  if(!req.hasQi)return {title:"积累突破修为",description:"突破还需 "+(req.qi-r.qi)+" 修为。切换修为优先的小怪刷取。",view:"explore",action:"前往自动刷怪"};
  return {title:"选择下一世",description:"四图已通关，可选择继续积累或轮回。",view:"fate",action:"查看轮回"};
 }
 if(forecast?.winRate>=.83)return {title:"守关时机已到",description:"24场模拟胜率约 "+Math.round(forecast.winRate*100)+"%。可挑战"+(r.checkpoint===c.checkpointsPerMap-1?"地图Boss":"守卫")+"；死亡可能遗失穿戴装备。",view:"explore",action:"前往挑战"};
 if(!r.technique)return pick("technique","先取得功法","尚未装配主修功法。功法秘卷可以提高输出、护盾或灵宠协同能力；抽到后请进入功法页面装配。","抽功法秘卷");
 if(!r.pet)return pick("pet","灵宠协同作战","已有功法，但尚无出战灵宠。御兽灵契提供协战与护盾，搭配特定功法可产生共鸣。","抽御兽灵契");
 if(!Object.keys(r.equipment||{}).length&&s.meta.bestCheckpoint>=c.features.unlockAtGlobalCheckpoint.equipment)
  return pick("equipment","补齐基础装备","器物秘匣能补充十槽攻防；小怪也有概率掉落基础装备箱。","查看器物秘匣");
 return {title:"调整构筑后再战",description:"当前守关模拟胜率约 "+Math.round((forecast?.winRate||0)*100)+"%。先尝试已拥有功法和灵宠的战前推演；若数值不足，再补战力卡或投资聚财、洞府。",view:"explore",action:"查看战前推演"};
}
