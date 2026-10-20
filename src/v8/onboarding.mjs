/**
 * Optional newcomer route. Derived from existing saved gameplay facts, so
 * it needs no new Schema 8 fields and older saves can still be loaded.
 */
export function noviceStep(s){
 const r=s?.run;
 if(!r||s.meta?.reincarnations>0||r.guardianWins>0||r.bossWins>0||r.mapIndex!==0)return null;
 if(!Object.values(r.draws||{}).some(n=>n>0))
  return {index:1,title:"先抽一张机缘",description:"你拥有110灵石。第一张战力秘藏固定获得攻击强化，先抽一张，感受卡牌怎样直接改变战力。",view:"gacha",packId:"battle",action:"前往战力首抽"};
 if(!r.mobKills)
  return {index:2,title:"打一场小怪，获得资源",description:"战力会自动生效。开启自动刷怪，看每次命中扣血，并获得灵石和修为；这些资源会用于后续抽卡和突破。",view:"explore",target:"autoFarm",action:"开始自动刷怪"};
 return {index:3,title:"第一次挑战守卫",description:"小怪提供资源，但不会推进地图；击败守卫才能进入下一关。点击守卫挑战，失败不退关（真正死亡时穿戴装备有遗失风险）。",view:"explore",target:"challenge",action:"前往挑战守卫"};
}
