#!/usr/bin/env node
/**
 * Actual reducer-driven v0.8 combat balance sweeps.
 * Not a fake scalar power simulation: all hits and waves use the same engine.
 */
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,heroStats,combatAssessment,breakthroughRequirements,packCost} from "../src/v8/engine.mjs";
import {unlockedPack} from '../src/v8/modules.mjs';
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));

// Combat-only fixture: progression pacing is tested separately with real clocks.
c.management.realmQiFactor=1;
export function play(seed,policy="battle",limit=3600){
 let s=createSave(seed),battles=0,draws=0,mobFailures=0,
  guardianFailures=0,upgrades=0,byMap=[],pulls={};
 function command(type,values={}){
  const out=dispatch(s,c,{seq:s.seq+1,type,...values});s=out.state;return out.result;
 }
 const affordable=pack=>unlockedPack(s,c,pack)&&s.run.stones>=packCost(s,c,pack);
 const draw=pack=>{
  command("DRAW",{packId:pack,count:1});draws++;pulls[pack]=(pulls[pack]||0)+1;
 };
 for(let tick=0;tick<limit&&!s.run.bossCleared;tick++){
  const r=s.run,need=breakthroughRequirements(s,c);
  if(need.canBreak&&r.realmIndex<4){command("BREAKTHROUGH");upgrades++;continue}
  // An unlocked map can still be farmed, but its guardian is gated until breakthrough.
  if(r.mapIndex>r.realmIndex){
   if(!need.hasInsight&&affordable("cultivation")){draw("cultivation");continue}
   if(!need.hasQi||!need.hasInsight){const res=command("BATTLE",{enemyType:"mob"});battles++;if(!res.won)mobFailures++;continue}
  }
  if(!need.hasInsight&&r.qi>=need.qi*.6&&affordable("cultivation")){draw("cultivation");continue}
  const goal=r.checkpoint===c.checkpointsPerMap-1?"boss":"guardian",estimate=combatAssessment(s,c,goal,16);
  if(estimate.winRate>=.875&&estimate.maxThreatHit<heroStats(s,c).hp*.67){
   const res=command("BATTLE",{enemyType:goal});battles++;
   if(!res.won)guardianFailures++;
   if(res.won&&goal==="boss")byMap.push({map:res.mapBefore+1,battles,draws,realm:r.realmIndex});
   continue;
  }
  if(policy==="economy"&&r.mapIndex>=1&&(pulls.wealth||0)<r.mapIndex*3&&affordable("wealth")){
   draw("wealth");continue
  }
  if(policy==="tactical"){
   const desired=r.mapIndex===1?"T001":r.mapIndex===2?"T003":"T002";
   if(r.cards[desired]>0&&r.technique!==desired){
    command("EQUIP_TECH",{id:desired});continue
   }
   if((pulls.technique||0)<2*(r.mapIndex+1)&&affordable("technique")){
    draw("technique");continue
   }
   if(!r.pet&&r.mapIndex>=1&&(pulls.pet||0)<2&&affordable("pet")){
    draw("pet");continue
   }
  }
  if(affordable("battle")){draw("battle");continue}
  const fight=command("BATTLE",{enemyType:"mob"});battles++;if(!fight.won)mobFailures++;
 }
 return {seed,policy,completed:s.run.bossCleared,
  depth:s.run.mapIndex*8+s.run.checkpoint+1,battles,draws,mobFailures,guardianFailures,
  upgrades,stone:s.run.stones,realm:s.run.realmIndex,byMap};
}
const full=process.argv.includes("--full"),n=full?100:8;
const modes=full?["battle","economy","tactical"]:["battle","tactical"];
let bad=0;
for(const policy of modes){
 const rows=[];
 for(let seed=1;seed<=n;seed++){
  const v=play(seed===n?20261020:seed,policy);
  rows.push(v);
  if(!v.completed||v.mobFailures){bad++;if(bad<=10)console.error("UNFINISHED",JSON.stringify(v))}
 }
 const average=key=>Math.round(rows.reduce((a,v)=>a+v[key],0)/rows.length*10)/10;
 console.log(JSON.stringify({policy,seeds:rows.length,completed:rows.filter(v=>v.completed).length,
  meanBattles:average("battles"),meanDraws:average("draws"),
  meanDeaths:average("guardianFailures"),mobLosses:rows.reduce((a,v)=>a+v.mobFailures,0),
  avgRemainingStone:average("stone")}));
}
if(bad){console.error("v0.8 combat sweep FAILED with "+bad+" unwinnable seeds");process.exitCode=1}
else console.log("v0.8 Melvor-inspired four-map gameplay sweep PASSED");
