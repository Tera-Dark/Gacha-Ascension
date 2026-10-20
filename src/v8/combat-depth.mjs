/**
 * v0.8 Melvor-inspired, not Melvor-cloned combat.
 * All numbers are intentionally original tuning choices and adjustable.
 * A pure seeded fight: combat never creates rewards or mutates saves.
 */
export const COMBAT_REVISION="v0.8.2";
const cap=(n,a,b)=>Math.min(b,Math.max(a,n));
const STYLE_ADVANTAGE={blade:"spirit",spirit:"ward",ward:"blade"};
export const STYLE_LABELS=Object.freeze({blade:"剑势",ward:"守势",spirit:"灵势",none:"无流派"});
export const MAP_STYLES=["blade","spirit","ward","blade"];
export const MAP_SPECIALS=["howl","veil","regeneration","swordstorm"];
export const RULES=Object.freeze({
 minHitChance:.32,maxHitChance:.93,advantageDamage:1.12,weakDamage:.89,
 advantageTaken:.90,weakTaken:1.11,minHitRoll:.72,
 heroIntervalMs:2450,enemyIntervalMs:2650,maxActionsPerWave:100,
 // Boss requires two independent minion encounters and a final target.
 guardianWaves:[.26,1.0],bossWaves:[.22,.32,1.0]
});
function rand(x){x=x>>>0;if(!x)x=1;x^=x<<13;x^=x>>>17;x^=x<<5;x>>>=0;return {seed:x,value:x/4294967296}}
export function hitChance(accuracy,evasion){
 if(!(accuracy>0)||!(evasion>0))throw Error("invalid accuracy/evasion ratings");
 const p=accuracy<=evasion?.5*accuracy/evasion:1-.5*evasion/accuracy;
 return cap(p,RULES.minHitChance,RULES.maxHitChance);
}
export function styleMatchup(player,opponent){
 if(player==="none"||player===opponent)return {label:"均势",damage:1,taken:1,advantage:0};
 if(STYLE_ADVANTAGE[player]===opponent)return {label:"克制",damage:RULES.advantageDamage,taken:RULES.advantageTaken,advantage:1};
 if(STYLE_ADVANTAGE[opponent]===player)return {label:"被克",damage:RULES.weakDamage,taken:RULES.weakTaken,advantage:-1};
 return {label:"均势",damage:1,taken:1,advantage:0};
}
export function combatStyle(tech){
 if(tech.style==="sword"||tech.style==="burst")return "blade";
 if(tech.style==="guard")return "ward";
 if(tech.style==="spirit")return "spirit";
 return "none";
}
function unitRatings(hero,foe,mode){
 const hAcc=96+hero.attack*2.7+hero.defense*.25;
 const hEva=110+hero.defense*2.45+hero.attack*.68;
 const eAcc=96+foe.attack*2.7+foe.defense*.25;
 const eEva=110+foe.defense*2.45+foe.attack*.68+
    (mode==="veil"?12+foe.defense*.14:0);
 return {heroAccuracy:Math.round(hAcc),heroEvasion:Math.round(hEva),
  enemyAccuracy:Math.round(eAcc),enemyEvasion:Math.round(eEva),
  heroHitChance:hitChance(hAcc,eEva),enemyHitChance:hitChance(eAcc,hEva)};
}
export function encounterWaves(enemy,kind,mapIndex){
 const ratios=kind==="boss"?RULES.bossWaves:kind==="guardian"?RULES.guardianWaves:[1];
 const mapStyle=MAP_STYLES[mapIndex]||"blade";
 const alternate=["ward","blade","spirit"][(mapIndex+1)%3];
 return ratios.map((ratio,i)=>{
  const last=i===ratios.length-1;
  return {
   ...enemy, hp:Math.max(1,Math.round(enemy.hp*ratio)),
   attack:Math.max(1,Math.round(enemy.attack*(last?1:.58+(i*.07)))),
   defense:Math.max(0,Math.round(enemy.defense*(last?1:.65))),
   style:last?mapStyle:alternate,stage:i+1,name:last?enemy.name:(kind==="boss"?"阵前守卫":"前哨妖卫")+" "+(i+1),
   special:last&&(kind==="boss"||kind==="guardian")?MAP_SPECIALS[mapIndex]:"none"
  };
 });
}
function mitigation(defense,guardPower){
 const armorDr=cap(defense/(defense+230),0,.48);
 const manual=guardPower>0?cap(guardPower/(125+guardPower),0,.36):0;
 // Two terms are kept explicit to avoid double-counting one bonus.
 return cap(armorDr+manual,0,.68);
}
export function assessEncounter(snapshot,samples=24){
 if(!Number.isInteger(samples)||samples<4||samples>80)throw Error("Invalid combat samples");
 let wins=0,turns=0,highest=0,fastest=Infinity,lowestRemaining=Infinity;
 const budgetSeed=(snapshot.hero.attack*21+snapshot.hero.defense*7+
  snapshot.enemy.hp*3+snapshot.enemy.attack*5+snapshot.mapIndex*919+
  snapshot.waves.length*367)>>>0;
 for(let i=0;i<samples;i++){
  const seed=(budgetSeed+2654435761*(i+1))>>>0||1;
  const result=simulateEncounter(snapshot,seed);
  if(result.won){wins++;fastest=Math.min(fastest,result.turns)}
  turns+=result.turns;highest=Math.max(highest,result.maxEnemyHit);
  lowestRemaining=Math.min(lowestRemaining,result.heroRemaining);
 }
 const winRate=wins/samples;
 const boss=snapshot.waves.at(-1);
 const ratings=unitRatings(snapshot.hero,boss,boss.special);
 const encounterStyle=styleMatchup(combatStyle(snapshot.tech),boss.style);
 const heroDr=mitigation(snapshot.hero.defense,snapshot.tech.style==="guard"?snapshot.tech.power:0);
 const safeToAuto=winRate>=.83&&snapshot.hero.hp>=highest*1.5;
 return {samples,wins,winRate,averageTurns:Math.round(turns/samples),
  maxThreatHit:highest,minHeroRemaining:lowestRemaining,
  heroHitChance:ratings.heroHitChance,enemyHitChance:ratings.enemyHitChance,
  damageReduction:heroDr,matchup:encounterStyle.label,heroStyle:STYLE_LABELS[combatStyle(snapshot.tech)],
  enemyStyle:STYLE_LABELS[boss.style],waveCount:snapshot.waves.length,
  safeToAuto, risk:winRate>=.85?"稳健":winRate>=.6?"可尝试":"危险",
  opportunity:winRate>=.83?"适合冲关":winRate>=.6?"有风险，可手动挑战":"建议刷怪改善构筑"};
}
export function simulateEncounter(input,startSeed){
 const {hero,enemy,tech,pet,heroUltra=false,kind,mapIndex,
  heroSpeedPct=0}=input;
 if(!Number.isSafeInteger(startSeed)||startSeed<1||startSeed>0xffffffff)throw Error("Invalid combat seed");
 const waves=input.waves||encounterWaves(enemy,kind,mapIndex);
 const heroStyle=combatStyle(tech),heroInterval=RULES.heroIntervalMs/(1+cap(heroSpeedPct,0,60)/100);
 const enemyInterval=RULES.enemyIntervalMs/(1+mapIndex*.025);
 let rng=startSeed,heroHp=hero.hp,shield=pet.style==="ward"?
  Math.round(hero.hp*cap(pet.power/200,0,.50)):0;
 let heroDealt=0,petDealt=0,blocked=0,turns=0,maxEnemyHit=0,misses=0,
  enemyRemaining=waves[0].hp,timeMs=0,completedWaves=0;
 const head=[],tail=[],maxEvents=22;
 const log=event=>{if(head.length<11)head.push(event);else{tail.push(event);if(tail.length>11)tail.shift()}};
 const random=()=>{const p=rand(rng);rng=p.seed;return p.value};
 for(let idx=0;idx<waves.length;idx++){
  const foe=waves[idx],ratings=unitRatings(hero,foe,foe.special);
  const matchup=styleMatchup(heroStyle,foe.style);
  const dr=mitigation(hero.defense,tech.style==="guard"?tech.power:0);
  let enemyHp=foe.hp,heroAt=heroInterval,enemyAt=enemyInterval;
  let heroAttacks=0,enemyAttacks=0;
  log({actor:"wave",stage:idx+1,total:waves.length,name:foe.name,max:foe.hp,hp:foe.hp,style:foe.style});
  for(let steps=0;steps<RULES.maxActionsPerWave&&enemyHp>0&&heroHp>0;steps++){
   if(heroAt<=enemyAt){
    timeMs+=0;heroAttacks++;turns++;
    const hit=random()<ratings.heroHitChance;
    let amount=0;
    if(hit){
     const rolled=RULES.minHitRoll+(1-RULES.minHitRoll)*random();
     const armor=100/(100+foe.defense);
     let raw=hero.attack*rolled*armor*matchup.damage;
     if(tech.style==="sword")raw*=1+cap(tech.power/100,0,5);
     if(tech.style==="burst"&&heroAttacks%3===0)raw*=1+cap(tech.power/100,0,5);
     if(heroUltra)raw*=2.5;
     amount=Math.max(1,Math.round(raw));
     enemyHp=Math.max(0,enemyHp-amount);heroDealt+=amount;
    }else misses++;
    log({actor:hit?"hero":"miss",owner:"hero",stage:idx+1,turn:heroAttacks,
     amount,hp:enemyHp,max:foe.hp});
    heroAt+=heroInterval;
    if(enemyHp<=0)break;
    if(pet.style!=="none"&&pet.style!=="ward"){
     const petHit=random()<cap(ratings.heroHitChance+.08,.34,.96);
     if(petHit){
      const petArmor=100/(100+foe.defense*(pet.style==="pierce"?.45:1));
      const extra=Math.max(1,Math.round(hero.attack*cap(pet.power/100,0,15)*petArmor*.82*
       (tech.style==="spirit"?1+cap(tech.power/100,0,5):1)));
      enemyHp=Math.max(0,enemyHp-extra);petDealt+=extra;
      log({actor:"pet",stage:idx+1,turn:heroAttacks,amount:extra,hp:enemyHp,max:foe.hp});
     }
    }
    if(enemyHp<=0)break;
    if(foe.special==="swordstorm"){
     // 18% of the unmitigated successful sword hit is reflected by the boss.
     const counter=Math.round(amount*.12);
     if(counter){heroHp=Math.max(0,heroHp-counter);
      log({actor:"counter",stage:idx+1,amount:counter,hp:heroHp,max:hero.hp})}
     if(heroHp<=0)break;
    }
   }else{
    enemyAttacks++;
    const hit=random()<ratings.enemyHitChance;
    let amount=0,absorb=0;
    if(hit){
     const rolled=RULES.minHitRoll+(1-RULES.minHitRoll)*random();
     const specialAmp=foe.special==="howl"&&enemyAttacks%4===0?1.38:
      foe.special==="swordstorm"&&enemyAttacks%3===0?1.3:1;
     amount=Math.max(1,Math.round(foe.attack*rolled*matchup.taken*(1-dr)*specialAmp));
     maxEnemyHit=Math.max(maxEnemyHit,amount);
     absorb=Math.min(shield,amount);shield-=absorb;blocked+=absorb;amount-=absorb;
     heroHp=Math.max(0,heroHp-amount);
    }else misses++;
    log({actor:hit?"enemy":"miss",owner:"enemy",stage:idx+1,turn:enemyAttacks,
     amount,blocked:absorb,hp:heroHp,max:hero.hp});
    enemyAt+=enemyInterval;
    if(heroHp<=0)break;
    if(foe.special==="regeneration"&&enemyAttacks%2===0){
      const recovered=Math.min(foe.hp-enemyHp,Math.max(1,Math.round(foe.hp*.035)));
      enemyHp+=recovered;
      if(recovered)log({actor:"regen",stage:idx+1,amount:recovered,hp:enemyHp,max:foe.hp});
    }
   }
  }
  enemyRemaining=enemyHp;
  timeMs+=Math.max(heroAt,enemyAt);
  if(enemyHp>0||heroHp<=0)break;
  completedWaves++;
 }
 const won=completedWaves===waves.length&&heroHp>0;
 return {won,reason:won?"victory":heroHp<=0?"defeat":"timeout",
  turns,completedWaves,totalWaves:waves.length,heroDealt,petDealt,blocked,misses,maxEnemyHit,
  heroRemaining:heroHp,enemyRemaining,hero,enemy:waves.at(-1),waves,
  timeMs,nextSeed:rng,logs:[...head,...tail]};
}
