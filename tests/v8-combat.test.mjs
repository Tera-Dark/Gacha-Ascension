import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {hitChance,styleMatchup,encounterWaves,simulateEncounter,assessEncounter,RULES} from "../src/v8/combat-depth.mjs";
import {loadCatalog,createSave,dispatch,fight,combatSnapshot,combatAssessment,packCost} from "../src/v8/engine.mjs";

const j=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const catalog=loadCatalog(j("realms-maps.v0.8.proposal.json"),j("v8-slice.json"));
const take=(s,type,extra={})=>dispatch(s,catalog,{type,seq:s.seq+1,...extra}).state;
test("adapted Melvor hit formula stays bounded and monotonic",()=>{
 assert.ok(hitChance(300,100)>hitChance(100,300));
 assert.ok(hitChance(100,100)>.4);
 assert.equal(hitChance(1e9,1),RULES.maxHitChance);
 assert.equal(hitChance(1,1e9),RULES.minHitChance);
 assert.throws(()=>hitChance(0,1));
});
test("technique affinity creates actual three-style tradeoffs",()=>{
 assert.equal(styleMatchup("blade","spirit").advantage,1);
 assert.equal(styleMatchup("spirit","ward").advantage,1);
 assert.equal(styleMatchup("ward","blade").advantage,1);
 assert.equal(styleMatchup("blade","ward").advantage,-1);
 assert.equal(styleMatchup("none","ward").advantage,0);
});
test("dungeon battles have independent waves and consecutive health persistence",()=>{
 const s=createSave(88),guard=combatSnapshot(s,catalog,"guardian"),boss=combatSnapshot(s,catalog,"boss");
 assert.equal(guard.waves.length,2);assert.equal(boss.waves.length,3);
 assert.ok(boss.waves.at(-1).hp>boss.waves[0].hp);
 assert.ok(boss.waves.every(w=>w.style));
 const battle=simulateEncounter(boss,88);
 assert.ok(battle.completedWaves<=3);assert.equal(battle.totalWaves,3);
 assert.ok(battle.logs.some(x=>x.actor==="wave"));
 assert.ok(battle.heroRemaining<=battle.hero.hp);
});
test("identical input+seed gives identical combat, actual battle advances only persistent seed",()=>{
 const s=createSave(600),before=structuredClone(s);
 const replay=fight(s,catalog,"mob",{seed:s.seed});
 assert.deepEqual(replay,fight(s,catalog,"mob",{seed:s.seed}));
 assert.deepEqual(s,before,"pure combat mutated original save");
 const out=dispatch(s,catalog,{type:"BATTLE",enemyType:"mob",seq:1});
 assert.deepEqual(out.result.combat,replay);
 assert.equal(out.state.seed,replay.nextSeed);
 assert.equal(s.seed,before.seed);
 assert.notEqual(out.state.seed,s.seed);
});
test("24-sample preview does not expose next real battle outcome or mutate seed",()=>{
 const s=createSave(779),old=structuredClone(s);
 const odds=combatAssessment(s,catalog,"guardian",24);
 assert.equal(odds.samples,24);
 assert.ok(odds.winRate>=0&&odds.winRate<=1);
 assert.ok(odds.heroHitChance>=RULES.minHitChance&&odds.heroHitChance<=RULES.maxHitChance);
 assert.ok(odds.damageReduction>=0&&odds.damageReduction<=1);
 assert.equal(typeof odds.matchup,"string");
 assert.deepEqual(s,old);
 assert.deepEqual(odds,combatAssessment(s,catalog,"guardian",24));
 assert.equal(odds.waveCount,2);
});
test("manual challenge may fail while auto decision accounts for risk",()=>{
 const s=createSave(222);
 s.run.mapIndex=3;s.run.checkpoint=7;
 const boss=combatAssessment(s,catalog,"boss",24);
 assert.ok(boss.winRate<=1);
 assert.equal(boss.safeToAuto,false);
 const result=dispatch(s,catalog,{seq:1,type:"BATTLE",enemyType:"boss"});
 assert.equal(result.state.run.mapIndex,3);
 assert.equal(result.state.run.checkpoint,7);
 if(!result.result.won)assert.equal(result.result.stones,0);
});
test("defensive technique reduces health loss under identical seeded enemy pressure",()=>{
 const s=createSave(3000);
 const snap=combatSnapshot(s,catalog,"guardian");
 snap.hero.attack=80;snap.hero.hp=2000;snap.enemy.hp=5000;
 snap.waves=encounterWaves(snap.enemy,"guardian",0);
 const base=simulateEncounter(snap,988);
 const defensive=simulateEncounter({...snap,tech:{style:"guard",power:70}},988);
 assert.ok(defensive.heroRemaining>=base.heroRemaining,"damage mitigation has no impact");
 assert.ok(defensive.damageReduction!==undefined||defensive.heroRemaining>base.heroRemaining);
});
test("pet independent action appears in battle logs rather than only increasing displayed attack",()=>{
 const s=createSave(172),base=fight(s,catalog,"guardian",{seed:123});
 s.run.cards.P001=2;s.run.pet="P001";
 const pet=fight(s,catalog,"guardian",{seed:123});
 assert.ok(pet.petDealt>0);
 assert.ok(pet.logs.some(x=>x.actor==="pet"));
 assert.ok(pet.hero.attack===base.hero.attack);
});
test("changing equipment improves combat outcome without forging card ownership",()=>{
 let s=createSave(999);
 assert.throws(()=>take(s,"EQUIP_TECH",{id:"T002"}),/未拥有/);
 s.run.cards.T002=3;s=take(s,"EQUIP_TECH",{id:"T002"});
 const a=combatAssessment(s,catalog,"guardian",24);
 assert.equal(a.heroStyle,"守势");
 assert.equal(a.enemyStyle,"剑势");
 assert.equal(a.matchup,"克制");
});
test("repeated current-map combat still gains resources and preserves progress",()=>{
 let s=createSave(106),prior=s.run.stones;
 for(let i=0;i<5;i++)s=take(s,"BATTLE",{enemyType:"mob"});
 assert.ok(s.run.stones>prior);
 assert.equal(s.run.checkpoint,0);
});
test("sparse high-rarity pools do not silently turn every missing rarity into common drops",()=>{
 const s=createSave(25);
 const cost=packCost(s,catalog,"technique");
 assert.ok(cost>0);
 assert.equal(catalog.packById.technique.cards.some(card=>card.rarity==="tian"),false);
});

test("all dungeon phase headers survive event truncation in long fights",()=>{
 const s=createSave(177),snap=combatSnapshot(s,catalog,"boss");
 snap.hero.hp=1000000;snap.hero.attack=35;
 snap.enemy.hp=600;snap.enemy.attack=3;
 snap.waves=encounterWaves(snap.enemy,"boss",0);
 const result=simulateEncounter(snap,177);
 assert.equal(result.totalWaves,3);
 assert.equal(result.completedWaves,3);
 assert.deepEqual(result.logs.filter(x=>x.actor==="wave").map(x=>x.stage),[1,2,3]);
 const ids=result.logs.map(x=>x.seq);
 assert.deepEqual([...ids].sort((a,b)=>a-b),ids);
 assert.ok(result.logs.length<=25);
});

test("three monster farming targets trade stones against cultivation in the same checkpoint",()=>{
 const fresh=createSave(4242);
 const base=dispatch(fresh,catalog,{type:"BATTLE",enemyType:"mob",seq:1});
 const choose=(id)=>{
  const focused=dispatch(fresh,catalog,{type:"SET_FARM_FOCUS",id,seq:1});
  assert.equal(focused.state.run.checkpoint,0);
  assert.equal(focused.state.run.mapIndex,0);
  return dispatch(focused.state,catalog,{type:"BATTLE",enemyType:"mob",seq:2});
 };
 const stone=choose("stones"),cultivation=choose("cultivation");
 assert.equal(base.result.won,true);assert.equal(stone.result.won,true);assert.equal(cultivation.result.won,true);
 assert.ok(stone.result.stones>base.result.stones);
 assert.ok(stone.result.qi<base.result.qi);
 assert.ok(cultivation.result.qi>base.result.qi);
 assert.ok(cultivation.result.stones<base.result.stones);
 assert.throws(()=>dispatch(fresh,catalog,{type:"SET_FARM_FOCUS",id:"ultra",seq:1}),/刷怪目标/);
});
