#!/usr/bin/env node
/**
 * Diagnostic-only first-life journey; never changes game code or user saves.
 * "guided" follows the same UI nextStep() hints a new player actually sees.
 * Combat and draws use production dispatch. Time is the simulated fight duration
 * plus explicit estimated UI interaction seconds, not real human play time.
 */
import {readFileSync} from "node:fs";
import {createSave,loadCatalog,dispatch,fight,combatAssessment,breakthroughRequirements,packCost} from "../src/v8/engine.mjs";
import {nextStep,recommendLoadout} from "../src/v8/advisor.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const fmt=n=>Math.round(n*10)/10;
function journey(seed,mode="guided",limit=3800){
 let s=createSave(seed),clock=1000000,actions=0,draws={},failures={},mapMilestones=[],log=[],goals={},idleTicks=0,
  combatSeconds=0,interactionSeconds=0,latestInsight=0,lastDepth=1,unchanged=0,mostUnchanged=0,blocked=null;
 const firstLook={startingStones:s.run.stones,startingQi:s.run.qi};
 const addLog=(kind,message)=>{if(log.length<42||kind==="milestone"||kind==="failure"&&log.length<75)
  log.push({n:actions,kind,map:s.run.mapIndex+1,stage:s.run.checkpoint+1,realm:s.run.realmIndex,
    stones:s.run.stones,qi:s.run.qi,message});};
 function doIt(type,args={},costSec=2){
  const before=clock;
  const out=dispatch(s,c,{type,seq:s.seq+1,now:Math.floor(clock),...args});
  s=out.state;actions++;clock+=costSec*1000;interactionSeconds+=costSec;
  return out.result;
 }
 function chooseDraw(pack){
  if(s.run.stones<packCost(s,c,pack))return false;
  try{
   const r=doIt("DRAW",{packId:pack,count:1},6);
   draws[pack]=(draws[pack]||0)+1;
   if(actions<24)addLog("draw",pack+" => "+r.items.map(x=>x.name).join("/"));
   return true;
  }catch(e){if(!blocked)blocked={action:"DRAW "+pack,error:e.message};return false}
 }
 function doFight(type){
  const seedBefore=s.seed,preview=fight(s,c,type,{seed:seedBefore});
  // Guards and bosses use exactly the same previewed seeded encounter in dispatch.
  const r=doIt("BATTLE",{enemyType:type},3);
  if(r.combat.timeMs!==preview.timeMs||r.combat.won!==preview.won)
   throw Error("Fight prediction diverged from actual combat");
  const delay=Math.ceil(r.combat.timeMs);
  clock+=delay;combatSeconds+=delay/1000;
  if(!r.won){
   failures[type]=(failures[type]||0)+1;
   if(actions<30||type==="boss")addLog("failure",type+" defeat="+r.combat.reason+(r.lostGear?" lost="+r.lostGear.name:""));
  }else if(type!=="mob"&&actions<25)addLog("guardian",type+" passed");
  if(r.won&&type==="boss"){
   mapMilestones.push({map:r.mapBefore+1,action:actions,timeMinutes:fmt((clock-1000000)/60000),
    realm:s.run.realmIndex,draws:Object.values(draws).reduce((a,b)=>a+b,0)});
   addLog("milestone","Beat map "+(r.mapBefore+1)+" boss");
  }
  return r;
 }
 firstLook.guardianForecast=combatAssessment(s,c,"guardian",24).winRate;
 firstLook.firstGoal=nextStep(s,c,combatAssessment(s,c,"guardian",24));
 addLog("milestone","First screen: "+firstLook.firstGoal.title+"; guardian winRate="+fmt(firstLook.guardianForecast));
 for(let i=0;i<limit;i++){
  if(s.run.bossCleared&&s.run.realmIndex===4)break;
  const r=s.run;
  const req=breakthroughRequirements(s,c);
  const target=r.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
  const forecast=!r.bossCleared?combatAssessment(s,c,target,24):null;
  const step=nextStep(s,c,forecast);
  goals[step.title]=(goals[step.title]||0)+1;
  const depth=r.mapIndex*8+r.checkpoint+1;
  if(depth===lastDepth)unchanged++;else {unchanged=0;lastDepth=depth}
  mostUnchanged=Math.max(mostUnchanged,unchanged);
  try{
   if(step.title==="突破条件已齐"){doIt("BREAKTHROUGH",{},3);addLog("milestone","Breakthrough to "+c.realms[s.run.realmIndex].name);continue}
   if(r.bossCleared){
    if(step.packId){
     if(!chooseDraw(step.packId))doFight("mob");
     continue;
    }
    if(!req.hasQi){doFight("mob");continue}
    if(!req.hasInsight){if(!chooseDraw("cultivation"))doFight("mob");continue}
    if(req.needsPill&&!req.hasPill){if(!chooseDraw("elixir"))doFight("mob");continue}
    if(req.canBreak){doIt("BREAKTHROUGH");continue}
    blocked={action:"post-clear",why:step};break;
   }
   if(step.title==="守关时机已到"){
    doFight(target);continue;
   }
   if(step.packId&&s.run.stones>=packCost(s,c,step.packId)){
    if(chooseDraw(step.packId))continue;
   }
   if(step.title==="调整构筑后再战"){
    const advice=recommendLoadout(s,c,target,16);
    if(advice.improved){
     doIt("EQUIP_LOADOUT",{technique:advice.best.technique,pet:advice.best.pet},4);
     if(actions<40)addLog("loadout","Accepted recommendation "+advice.best.technique+" "+advice.best.pet);
     continue;
    }
    const pack=mode==="battle-only"?"battle":
     !r.cards.B001?"battle": "battle";
    if(chooseDraw(pack))continue;
   }
   if(step.packId&&!chooseDraw(step.packId)){
    doFight("mob");idleTicks++;continue;
   }
   // If unsure, imitate the prominent "auto farm" button until the next draw is affordable.
   if(mode==="novice-curious"&&actions<10&&actions%4===0&&chooseDraw("battle"))continue;
   doFight("mob");idleTicks++;
  }catch(error){blocked={action:step.title,error:error.stack?.slice(0,350)||error.message};break}
 }
 const done=s.run.bossCleared&&s.run.realmIndex===4;
 let fate=null;
 if(done){
  const earned=doIt("REINCARNATE",{},5);
  fate={earned:earned.earned,reincarnations:s.meta.reincarnations,availableChests:Math.floor(s.meta.fate/c.fate.price)};
  if(s.meta.fate>=c.fate.price){
   const relic=doIt("OPEN_RELIC",{},6);
   fate.firstRelic=relic.relic.name;
   fate.nextRunAttack=(awaitlessAttack(s));
   fate.remainingFate=s.meta.fate;
  }
 }
 return {seed,mode,firstLook,done,actions,draws,failures,mapMilestones,
  mostActionsInSameStage:mostUnchanged,simulatedMinutes:fmt((clock-1000000)/60000),
  combatMinutes:fmt(combatSeconds/60),interactionMinutes:fmt(interactionSeconds/60),
  endingMap:s.run.mapIndex+1,endingStage:s.run.checkpoint+1,endingRealm:s.run.realmIndex,
  endingStones:s.run.stones,endingQi:s.run.qi,fate,goals,blocked,events:log};
}
function awaitlessAttack(s){return s.meta.relics.R001>0?29+2*s.meta.relics.R001:29}
const seeds=[20261020,23,71];
const out=seeds.map(seed=>journey(seed,"guided"));
console.log("NOVICE_JOURNEY_AUDIT="+JSON.stringify({source:"exact production dispatch + nextStep and seeded combat",
 estimate:"simulated fight durations plus 2-6 second UI action allowances; not actual user observation",rows:out}));
if(out.some(x=>x.blocked)){process.exitCode=0;}
