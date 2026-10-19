import {TUNING} from "./catalog.mjs";

/** Deterministic XorShift32 RNG; never use global Math.random for rewards. */
export function nextRandom(seed){
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error("Invalid RNG seed");
 let x=seed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;x>>>=0;
 return {seed:x||0x9e3779b9,value:(x>>>0)/4294967296};
}
export function damage(attack,defense,penetration=0,multiplier=1){
 for(const x of [attack,defense,penetration,multiplier])if(!Number.isFinite(x)||x<0)throw Error("Bad combat stat");
 return Math.max(1,Math.floor(attack*100/(100+Math.max(0,defense*(1-Math.min(.6,penetration))))*multiplier));
}
export function fight(snapshot,seed){
 const {hero,enemy}=snapshot;
 for(const unit of [hero,enemy]){
  if(!unit||!(unit.attack>0)||!(unit.hp>0)||!(unit.defense>=0)||
   !Number.isFinite(unit.attack)||!Number.isFinite(unit.hp)||!Number.isFinite(unit.defense))
    throw Error("Invalid combat snapshot");
 }
 const mechanic=snapshot.mechanic??null,traits=new Set(enemy.traitIds||[]);
 const n=mechanic?.stacks||0,id=mechanic?.id||null;
 if(mechanic&&(!["combo","pierce","ward","counter"].includes(id)||!Number.isInteger(n)||n<1))throw Error("Invalid mechanic");
 let heroHp=hero.hp,enemyHp=enemy.hp,rng=seed,turns=0,heroDamage=0,damageTaken=0;
 let heroAttackCount=0,procs=0,regenTotal=0;
 const shieldCap=id==="ward"?Math.floor(hero.hp*Math.min(.4,.10+.05*n)):0;
 let shield=shieldCap,absorbed=0;
 const log=[],addLog=event=>{if(log.length<18)log.push(event)};
 for(let t=0;t<TUNING.turnLimit;t++){
  turns=t+1;heroAttackCount++;
  let r=nextRandom(rng);rng=r.seed;
  const penetrate=id==="pierce"?Math.min(.5,.15+.05*n):0;
  const multiplier=.94+r.value*.12;
  const hit=damage(hero.attack,enemy.defense,penetrate,multiplier);
  enemyHp=Math.max(0,enemyHp-hit);heroDamage+=hit;
  addLog({turn:turns,actor:"hero",amount:hit,remaining:enemyHp});
  if(id==="combo"&&heroAttackCount%3===0&&enemyHp>0){
   const extra=damage(hero.attack,enemy.defense,0,Math.min(1.1,.30+.12*n));
   enemyHp=Math.max(0,enemyHp-extra);heroDamage+=extra;procs++;
   addLog({turn:turns,actor:"combo",amount:extra,remaining:enemyHp});
  }
  if(enemyHp===0)break;
  r=nextRandom(rng);rng=r.seed;
  const burst=traits.has("first_burst")&&t===0?2:1;
  const hitBack=damage(enemy.attack,hero.defense,0,(.94+r.value*.12)*burst);
  const blocking=Math.min(shield,hitBack);shield-=blocking;absorbed+=blocking;
  const suffered=hitBack-blocking;
  heroHp=Math.max(0,heroHp-suffered);damageTaken+=suffered;
  addLog({turn:turns,actor:"enemy",amount:suffered,blocked:blocking,remaining:heroHp});
  if(id==="counter"&&heroHp>0&&enemyHp>0){
   const retaliation=Math.max(1,Math.min(Math.floor(hero.attack*.6),
    Math.floor(hero.defense*(.18+.08*n))));
   enemyHp=Math.max(0,enemyHp-retaliation);heroDamage+=retaliation;procs++;
   addLog({turn:turns,actor:"counter",amount:retaliation,remaining:enemyHp});
  }
  if(heroHp===0||enemyHp===0)break;
  if(traits.has("regeneration")){
   const gain=Math.max(1,Math.floor(enemy.hp*.045));
   const healed=Math.min(enemy.hp-enemyHp,gain);
   enemyHp+=healed;regenTotal+=healed;
   if(healed)addLog({turn:turns,actor:"regen",amount:healed,remaining:enemyHp});
  }
 }
 return {
  won:enemyHp===0,turns,heroDamage,damageTaken,finalHeroHp:heroHp,finalEnemyHp:enemyHp,
  reason:enemyHp===0?"victory":heroHp===0?"defeat":"timeout",
  nextSeed:rng,mechanicId:id,mechanicProcs:procs,absorbed,regenTotal,
  log,logTruncated:heroAttackCount*2>18
 };
}
