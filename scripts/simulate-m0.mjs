#!/usr/bin/env node
/**
 * Deterministic M0 smoke simulation: a budget-aware player who farms,
 * trains the most useful stat, retries and clears the 30-floor demo.
 * Not a replacement for full game balance or human mobile playtests.
 */
import {readFileSync} from "node:fs";
import {loadM0Catalog,TRAINING,trainingCost} from "../src/m0/catalog.mjs";
import {createM0Save,getHeroStats} from "../src/m0/state.mjs";
import {executeM0,battlePreview} from "../src/m0/engine.mjs";
import {damage} from "../src/m0/combat.mjs";
const source=JSON.parse(readFileSync(new URL("../data/codex/codex.v0.5.json",import.meta.url),"utf8"));
const catalog=loadM0Catalog(source);
const metrics=[];
function run(seed) {
  let state=createM0Save(seed), training=0, defeats=0;
  const call=(type,args={})=>{
    const response=executeM0(state,{type,txnId:"tx:"+(state.txSequence+1),...args},catalog);
    state=response.state;return response.result;
  };
  const assess=(hero,enemy)=> {
    const h=hero.hp/damage(enemy.attack,hero.defense);
    const k=enemy.hp/damage(hero.attack,enemy.defense);
    return h/k;
  };
  for(let step=0;step<500 && state.run.exploration.highestCleared<30;step++){
    const p=battlePreview(state,catalog),h=getHeroStats(state);
    if(state.meta.featureUnlocks.hero_training){
      const current=assess(h,p.enemy), options=[];
      for(const stat of ["attack","hp","defense"]){
        const cost=trainingCost(stat,state.run.hero.training[stat]);
        if(state.run.stones<cost)continue;
        const future={...h,[stat]:h[stat]+TRAINING[stat].amount};
        options.push({stat,cost,score:Math.log(assess(future,p.enemy)/current)/cost});
      }
      // Upgrade when estimated too weak; otherwise let combat decide.
      if(p.hitsToKill>=p.hitsToFall-1 && options.length){
        options.sort((a,b)=>b.score-a.score);
        call("TRAIN_HERO",{stat:options[0].stat});
        training++;
        continue;
      }
    }
    if(state.run.exploration.mode!=="push")call("SET_MODE",{mode:"push"});
    const r=call("BATTLE");
    if(!r.won){
      defeats++;
      if(state.run.exploration.highestCleared>0){
        // Spend on stable upgrades when possible; otherwise farm until affordable.
        call("BATTLE");
      }
    }
  }
  return {seed,depth:state.run.exploration.highestCleared,battles:state.run.exploration.battleCount,
    training,defeats,level:state.run.hero.level,stones:state.run.stones,stats:getHeroStats(state)};
}
for(const seed of [1,42,456,1337,20261019]){
 const m=run(seed);metrics.push(m);console.log(JSON.stringify(m));
}
if(metrics.some(m=>m.depth!==30||m.battles>300||m.stones<0)){
 console.error("M0 balance smoke simulation did not reach a playable conclusion");
 process.exitCode=1;
}else console.log("M0 basic progression smoke test PASSED for "+metrics.length+" seeds.");
