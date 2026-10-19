#!/usr/bin/env node
/** Reproducible real-engine gacha-first playthrough, never a substitute battle formula. */
import {readFileSync} from "node:fs";
import {loadM0Catalog,packUnlocked} from "../src/m0/catalog.mjs";
import {createM0Save,levelCap} from "../src/m0/state.mjs";
import {executeM0,diagnose} from "../src/m0/engine.mjs";
const data=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadM0Catalog(data("codex/codex.v0.5.json"),data("m0-packs.v0.7.json"),data("m0-encounters.v0.7.json"));
export function simulate(seed,strategy="balanced",limit=2200){
 let s=createM0Save(seed),draws=0,fails=0,farms=0,steps=0,gateDraws=0,traitEquips=0;
 const firstClearTrace=[],drawTrace=[];
 const execute=(type,arg={})=>{
   const result=executeM0(s,{type,...arg,txnId:"tx:"+(s.txSequence+1)},c);
   s=result.state;return result;
 };
 const affordable=id=>s.run.stones>=c.packs[id].cost&&packUnlocked(s,c.packs[id]);
 const draw=id=>{
   const d=execute("DRAW",{packId:id,count:1});draws++;
   drawTrace.push({depth:s.run.exploration.highestCleared,pack:id,card:d.result.items[0].id});
   return d;
 };
 draw("battle");let retryCountdown=0;
 for(let turn=0;turn<limit&&s.run.exploration.highestCleared<30;turn++){
  steps++;
  const e=s.run.exploration,g=s.run.gacha,d=diagnose(s,c);
  if(e.highestCleared>=20&&!e.ascended){
   if(s.run.hero.level>=12&&(g.pills["P-04"]||0)>0){execute("BREAKTHROUGH");continue;}
   if(levelCap(s,c)<12&&affordable("cultivation")){draw("cultivation");continue;}
   if(!(g.pills["P-04"]>0)&&affordable("elixir")){draw("elixir");gateDraws++;continue;}
   if(s.run.hero.level<12&&s.run.hero.level>=levelCap(s,c)&&affordable("cultivation")){draw("cultivation");continue;}
  }
  if(e.highestCleared>=5&&g.packDraws.wealth<(strategy==="economic"?4:strategy==="balanced"?1:0)&&affordable("wealth")){draw("wealth");continue;}
  if(e.highestCleared>=10&&(levelCap(s,c)<14||g.packDraws.cultivation<2)&&affordable("cultivation")){draw("cultivation");continue;}
  if(e.highestCleared>=16&&g.packDraws.elixir<1&&affordable("elixir")){draw("elixir");continue;}
  if(e.farmReason==="defeat"&&affordable("battle")){
   draw("battle");retryCountdown++;
   if(e.mode==="farm"&&retryCountdown>=2){execute("SET_MODE",{mode:"push"});retryCountdown=0;}
   continue;
  }
  if(e.mode==="paused"){
   if(e.highestCleared>=20&&!e.ascended)execute("SET_MODE",{mode:"farm"});
   else execute("SET_MODE",{mode:"push"});
  }
  const wasFarm=s.run.exploration.mode==="farm";
  const out=execute("BATTLE");
  if(!out.result.won)fails++;
  if(wasFarm)farms++;
  if(out.result.firstClear)firstClearTrace.push(out.result.floor);
  // If repeatedly farming with no hard gate, accumulate until a card is affordable.
  if(s.run.exploration.mode==="farm"&&s.run.exploration.farmReason==="defeat"&&
    s.run.stones>=c.packs.battle.cost&&retryCountdown===0)retryCountdown=1;
 }
 const h=s.run.exploration.history;
 return {seed,strategy,depth:s.run.exploration.highestCleared,
  battles:s.run.exploration.battleCount,draws,fails,farms,gateDraws,traitEquips,
  level:s.run.hero.level,realm:s.run.hero.realm,
  stones:s.run.stones,earned:h.totalStonesEarned,spent:h.totalStonesSpent,
  initialFirstDefeat:h.firstDefeatAt,cardTypes:Object.keys(s.run.gacha.cards).length,
  trace:firstClearTrace,drawTrace};
}
const quick=process.argv.includes("--full")?1000:5,strategies=process.argv.includes("--full")?["balanced","economic","battle"]:["balanced"];
let failures=0;
for(const strategy of strategies){
 const data=[];
 for(let i=1;i<=quick;i++){
   const result=simulate(i===5?20261019:i,strategy);
   if(quick<=5)console.log(JSON.stringify({...result,trace:undefined,drawTrace:undefined}));
   data.push(result);
   if(result.depth!==30||result.realm!=="zhuji"){failures++;if(failures<8)console.error("Unfinished",result.seed,strategy,result.depth,result.battles);}
 }
 const avg=field=>Math.round(data.reduce((a,b)=>a+b[field],0)/data.length*10)/10;
 console.log(JSON.stringify({strategy,seeds:data.length,cleared:data.filter(x=>x.depth===30).length,
  avgBattles:avg("battles"),avgDraws:avg("draws"),avgFails:avg("fails"),avgFarms:avg("farms"),
  avgRemainingStones:avg("stones"),avgSpent:avg("spent")}));
}
if(failures){console.error("v0.7 smoke simulation FAILED: "+failures+" incomplete runs");process.exitCode=1}
else console.log("v0.7 smoke simulation PASSED with all required pill-gated clears.");
