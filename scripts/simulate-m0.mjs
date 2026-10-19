#!/usr/bin/env node
/** Real reducer smoke simulation for gacha-driven progression: no direct-training command. */
import {readFileSync} from "node:fs";
import {loadM0Catalog,STAGE_LIMIT,packUnlocked} from "../src/m0/catalog.mjs";
import {createM0Save,levelCap} from "../src/m0/state.mjs";
import {executeM0,battlePreview} from "../src/m0/engine.mjs";
const raw=JSON.parse(readFileSync(new URL("../data/codex/codex.v0.5.json",import.meta.url),"utf8"));
const packs=JSON.parse(readFileSync(new URL("../data/m0-packs.v0.6.json",import.meta.url),"utf8"));
const c=loadM0Catalog(raw,packs);
const results=[];
function simulate(seed){
 let s=createM0Save(seed),draws=0,failures=0,farms=0,gotPill=false,ascended=false;
 const doIt=(type,args={})=>{
  const r=executeM0(s,{type,...args,txnId:"tx:"+(s.txSequence+1)},c);
  s=r.state;return r.result;
 };
 doIt("DRAW",{packId:"battle",count:1});draws++;
 for(let i=0;i<2000 && s.run.exploration.highestCleared<STAGE_LIMIT;i++){
  const e=s.run.exploration,g=s.run.gacha,p=battlePreview(s,c);
  const affordable=id=>s.run.stones>=c.packs[id].cost&&packUnlocked(s,c.packs[id]);
  const draw=id=>{doIt("DRAW",{packId:id,count:1});draws++;};
  if(e.highestCleared>=20&&!e.ascended){
    if(!gotPill && (g.pills["P-04"]||0)>0)gotPill=true;
    if(s.run.hero.level>=12 && (g.pills["P-04"]||0)>0){doIt("BREAKTHROUGH");ascended=true;continue;}
    if(levelCap(s,c)<12&&affordable("cultivation")){draw("cultivation");continue;}
    if(!(g.pills["P-04"]>0)&&affordable("elixir")){draw("elixir");continue;}
    if(s.run.hero.level<12&&levelCap(s,c)<=s.run.hero.level&&affordable("cultivation")){draw("cultivation");continue;}
  }
  if(e.highestCleared>=5&&g.packDraws.wealth<2&&affordable("wealth")){draw("wealth");continue;}
  if(e.highestCleared>=10 && (levelCap(s,c)<17||g.packDraws.cultivation<2)&&affordable("cultivation")){draw("cultivation");continue;}
  if(e.highestCleared>=16&&g.packDraws.elixir<2&&affordable("elixir")){draw("elixir");continue;}
  if(e.farmReason==="defeat"&&affordable("battle")){
    draw("battle");
    if(s.run.exploration.mode==="farm"&&draws%3===0)doIt("SET_MODE",{mode:"push"});
    continue;
  }
  if(e.mode==="paused")doIt("SET_MODE",{mode:"push"});
  const before=s.run.exploration.mode;
  const r=doIt("BATTLE");
  if(!r.won)failures++;
  if(before==="farm")farms++;
  if(s.run.exploration.mode==="farm"&&s.run.exploration.farmReason==="defeat"&&s.run.stones<c.packs.battle.cost){
    // Next iteration farms the last cleared floor.
  }
 }
 return {seed,depth:s.run.exploration.highestCleared,realm:s.run.hero.realm,
  level:s.run.hero.level,draws,failures,farms,stones:s.run.stones,
  battles:s.run.exploration.battleCount,keyPillsRemaining:s.run.gacha.pills["P-04"]||0,
  cultivatedCards:gained(s,"cultivation"),wealthCards:gained(s,"wealth"),
  starter:s.run.gacha.cards["B-01"]||0,ascended};
}
function gained(s,packId){return Object.entries(s.run.gacha.cards).reduce((n,[id,copies])=>n+(c.cards[id]?.packId===packId?copies:0),0)}
for(const seed of [1,42,456,1337,20261019]){
 const metrics=simulate(seed);results.push(metrics);console.log(JSON.stringify(metrics));
}
if(results.some(x=>x.depth!==30||x.realm!=="zhuji"||x.draws<5||x.battles>800)){
 console.error("M0.1 gacha-only progression smoke FAILED");process.exitCode=1;
}else console.log("M0.1 gacha-only progression PASSED: "+results.length+" seeds, pill-gated ascension and farming.");
