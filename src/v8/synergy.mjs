/** Optional owned-and-equipped card pair bonuses; no extra RNG or save fields. */
export const PAIR_SYNERGIES=Object.freeze([
 {id:"fox-blade",technique:"T001",pet:"P001",name:"狐影随剑",description:"普通攻击伤害 +12%",strike:.12},
 {id:"turtle-guard",technique:"T002",pet:"P002",name:"玄甲同心",description:"入场护盾额外增加最大气血的 12%",shieldHp:.12},
 {id:"hawk-spirit",technique:"T003",pet:"P003",name:"雷灵合击",description:"灵宠独立伤害 +18%",petDamage:.18},
 {id:"deer-burst",technique:"T004",pet:"P004",name:"鹿鸣破军",description:"第三次攻击的爆发伤害额外 +25%",burst:.25}
]);
export function activeSynergy(s){
 const r=s.run||{};
 return PAIR_SYNERGIES.find(x=>x.technique===r.technique&&x.pet===r.pet&&
  (r.cards?.[x.technique]||0)>0&&(r.cards?.[x.pet]||0)>0)||null;
}
