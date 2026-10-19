import {STAGE_TUNING} from "./catalog.mjs";

/** Small deterministic XorShift32 RNG: 0 is forbidden. */
export function nextRandom(seed) {
  if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error("Invalid RNG seed");
  let x=seed>>>0;
  x^=x<<13; x^=x>>>17; x^=x<<5;
  x=x>>>0;
  return {seed:x||0x9e3779b9,value:(x>>>0)/4294967296};
}

export function damage(attackerAttack, targetDefense, armorPenPct=0, multiplier=1) {
  for(const n of [attackerAttack,targetDefense,armorPenPct,multiplier]) if(!Number.isFinite(n)||n<0)throw Error("Invalid combat stat");
  const penetration=Math.min(0.6,armorPenPct);
  const effectiveDef=Math.max(0,targetDefense*(1-penetration));
  return Math.max(1,Math.floor(attackerAttack*100/(100+effectiveDef)*multiplier));
}

export function fight(snapshot, seed) {
  const {hero,enemy}=snapshot;
  for(const side of [hero,enemy]){
    if(!side||!(side.attack>0)||!(side.hp>0)||!(side.defense>=0)||
       !Number.isFinite(side.attack)||!Number.isFinite(side.hp)||!Number.isFinite(side.defense))
      throw Error("Invalid combat snapshot");
  }
  let hpHero=hero.hp,hpEnemy=enemy.hp,rng=seed,heroDamage=0,damageTaken=0,turns=0;
  const log=[];
  for(let i=0;i<STAGE_TUNING.encounterTurnLimit;i++){
    turns=i+1;
    let r=nextRandom(rng);rng=r.seed;
    const hit=damage(hero.attack,enemy.defense,0,0.94+r.value*0.12);
    hpEnemy=Math.max(0,hpEnemy-hit);heroDamage+=hit;
    log.push({turn:turns,actor:"hero",amount:hit,remaining:hpEnemy});
    if(hpEnemy===0)break;
    r=nextRandom(rng);rng=r.seed;
    const received=damage(enemy.attack,hero.defense,0,0.94+r.value*0.12);
    hpHero=Math.max(0,hpHero-received);damageTaken+=received;
    log.push({turn:turns,actor:"enemy",amount:received,remaining:hpHero});
    if(hpHero===0)break;
  }
  return Object.freeze({
    won:hpEnemy===0,turns,heroDamage,damageTaken,finalHeroHp:hpHero,finalEnemyHp:hpEnemy,
    reason:hpEnemy===0?"victory":hpHero===0?"defeat":"timeout",nextSeed:rng,
    log:Object.freeze(log)
  });
}
