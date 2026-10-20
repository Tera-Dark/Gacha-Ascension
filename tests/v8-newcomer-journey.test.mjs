import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,pendingRealmGate,breakthroughRequirements,
 combatAssessment,packCost,SCHEMA,SAVE_KEY} from "../src/v8/engine.mjs";
import {noviceStep} from "../src/v8/onboarding.mjs";
import {nextStep} from "../src/v8/advisor.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const exec=(s,type,other={})=>dispatch(s,c,{seq:s.seq+1,type,...other});
test("brand new players get a clear three-step journey instead of a 96% first guardian",()=>{
 let s=createSave(20261020);
 assert.equal(SCHEMA,8);assert.equal(SAVE_KEY,"gacha-ascension-v8-slice-v1");
 assert.equal(noviceStep(s).index,1);
 assert.equal(nextStep(s,c,combatAssessment(s,c,"guardian",24)).packId,"battle");
 assert.equal(nextStep(s,c,null).view,"gacha");
 let pulled=exec(s,"DRAW",{packId:"battle",count:1});
 s=pulled.state;
 assert.equal(pulled.result.items[0].id,"B001","first draw should teach a guaranteed useful effect");
 assert.equal(noviceStep(s).index,2);
 assert.equal(nextStep(s,c,null).view,"explore");
 s=exec(s,"BATTLE",{enemyType:"mob"}).state;
 assert.equal(s.run.mobKills,1);
 assert.equal(noviceStep(s).index,3);
 s.run.guardianWins=1;
 assert.equal(noviceStep(s),null);
 s.meta.reincarnations=1;s.run.guardianWins=0;
 assert.equal(noviceStep(s),null,"second-life players must not repeat onboarding");
});
test("new map guard entrances are realm-gated while monster farming remains available",()=>{
 for(let map=1;map<=3;map++){
  let s=createSave(100+map);
  s.run.mapIndex=map;s.run.realmIndex=map-1;s.run.checkpoint=0;
  const gate=pendingRealmGate(s,c);
  assert.equal(gate.required,map);
  assert.equal(gate.realm,c.realms[map].name);
  assert.throws(()=>exec(s,"BATTLE",{enemyType:"guardian"}),/先突破至/);
  const mob=exec(s,"BATTLE",{enemyType:"mob"});
  assert.ok(mob.result?.combat);
  assert.equal(mob.state.run.mapIndex,map);
  s=mob.state;
  const req=breakthroughRequirements(s,c);
  s.run.qi=Math.max(s.run.qi,req.qi);s.run.insight=req.insight;
  const newRealm=exec(s,"BREAKTHROUGH");
  assert.equal(newRealm.state.run.realmIndex,map);
  assert.equal(pendingRealmGate(newRealm.state,c),null);
  assert.doesNotThrow(()=>exec(newRealm.state,"BATTLE",{enemyType:"guardian"}));
 }
});
test("advice does not send a resource-poor player to a disabled realm breakthrough pack",()=>{
 const s=createSave(2341);
 s.run.mapIndex=1;s.run.realmIndex=0;s.run.stones=0;
 const step=nextStep(s,c,{winRate:1});
 assert.equal(step.view,"explore");
 assert.match(step.description,/灵石/);
 assert.notEqual(step.title,"守关时机已到");
 s.run.stones=packCost(s,c,"cultivation");
 const funded=nextStep(s,c,{winRate:1});
 assert.equal(funded.packId,"cultivation");
 assert.match(funded.title,/悟道/);
 s.run.insight=10;s.run.qi=100;
 assert.equal(nextStep(s,c,null).view,"cultivate");
});
test("boss clears before or after the final major breakthrough have explicitly different rebirth yields",()=>{
 const base=createSave(661);
 base.run.mapIndex=3;base.run.checkpoint=7;base.run.bossCleared=true;
 base.run.realmIndex=3;
 const early=exec(base,"REINCARNATE");
 assert.equal(early.result.earned,55);
 assert.equal(early.state.meta.fate,55);
 const prepared=structuredClone(base);prepared.run.realmIndex=4;
 const complete=exec(prepared,"REINCARNATE");
 assert.equal(complete.result.earned,65);
 assert.equal(complete.state.meta.fate,65);
 assert.equal(complete.state.run.realmIndex,0);
 assert.equal(complete.state.meta.reincarnations,1);
});
