import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadM0Catalog,STAGE_LIMIT,trainingCost,opponentStats} from "../src/m0/catalog.mjs";
import {createM0Save,getHeroStats,validateM0Save,M0_SAVE_KEY} from "../src/m0/state.mjs";
import {fight,nextRandom,damage} from "../src/m0/combat.mjs";
import {executeM0,battlePreview} from "../src/m0/engine.mjs";
import {loadM0Save,saveM0Save,resetM0Save,BACKUP_KEY} from "../src/m0/storage.mjs";

const raw=JSON.parse(readFileSync(new URL("../data/codex/codex.v0.5.json",import.meta.url),"utf8"));
const c=loadM0Catalog(raw);
let counter=0;
function doCmd(save,type,fields={}){
  const outcome=executeM0(save,{type,txnId:"test-"+(++counter),...fields},c);
  return outcome;
}
function advanceTo(save,until){
  let count=0;
  while(save.run.exploration.highestCleared<until&&count<1000){
    if(save.run.exploration.mode!=="push")save=doCmd(save,"SET_MODE",{mode:"push"}).state;
    const n=doCmd(save,"BATTLE");
    save=n.state;
    if(!n.result.won)throw Error("Unanticipated defeat on stage "+n.result.stageFloor);
    count++;
  }
  assert.equal(save.run.exploration.highestCleared,until);
  return save;
}

test("content adapter includes exactly 30 legitimate stages, not future-zone placeholders",()=>{
  assert.equal(c.stages.length,STAGE_LIMIT);
  assert.equal(c.zone.id,"ZN-001");
  assert.equal(c.stages[0].mainlineIndex,1);
  assert.equal(c.stages.at(-1).mainlineIndex,30);
  assert.equal(c.byId["ST-QY-N-020"].enemyName,"寒潭蛟");
  const bad=structuredClone(raw);bad.stages[0].enemyId="unknown";
  assert.throws(()=>loadM0Catalog(bad),/Invalid M0 stage/);
});

test("createM0Save is versioned and remains separate from legacy v0.1",()=>{
  const a=createM0Save();
  validateM0Save(a);
  assert.equal(a.meta.featureUnlocks.exploration,true);
  assert.equal(a.meta.featureUnlocks.hero_training,undefined);
  assert.equal(a.run.exploration.highestCleared,0);
  assert.notEqual(M0_SAVE_KEY,"gacha-ascension-mvp-v1");
  assert.throws(()=>createM0Save(0),/Seed/);
});

test("battle results are deterministic pure functions for the same seed and snapshot",()=>{
  const s={hero:getHeroStats(createM0Save()),enemy:opponentStats(c.stages[0])};
  const before=structuredClone(s);
  const a=fight(s,1),b=fight(s,1);
  assert.deepEqual(a,b);
  assert.deepEqual(s,before);
  assert.ok(a.won);
  assert.ok(a.log.length>=1);
  assert.ok(a.turns>=1);
  assert.ok(a.nextSeed!==1);
  assert.ok(nextRandom(1).value<1);
  assert.ok(damage(10,1000)>=1);
  assert.equal(damage(10,100,0.6),Math.max(1,Math.floor(10*100/(100+40))));
  assert.throws(()=>fight({hero:{attack:0,hp:100,defense:0},enemy:s.enemy},123),/Invalid combat/);
});

test("single battle awards resources and only first clear adds a bonus",()=>{
  let s=createM0Save();
  const a=doCmd(s,"BATTLE");
  assert.equal(a.result.won,true);
  assert.equal(a.result.firstClear,true);
  assert.ok(a.result.stones>c.stages[0].stones);
  assert.equal(a.state.meta.bestDepth,1);
  assert.equal(a.state.run.exploration.highestCleared,1);
  assert.equal(a.state.run.exploration.targetIndex,2);
  assert.equal(a.state.run.exploration.battleCount,1);
  assert.equal(s.run.stones,0,"original state must be immutable");
  s=doCmd(a.state,"SET_MODE",{mode:"farm"}).state;
  const b=doCmd(s,"BATTLE");
  assert.equal(b.result.stageFloor,1);
  assert.equal(b.result.firstClear,false);
  assert.equal(b.result.stones,c.stages[0].stones);
  assert.equal(b.result.cultivationXp,c.stages[0].cultivationXp);
  assert.equal(b.state.run.exploration.highestCleared,1);
  assert.equal(b.state.run.exploration.battleCount,2);
  assert.equal(b.state.meta.accountFirstClear[c.stages[0].id],true);
  validateM0Save(b.state);
});

test("same transaction id never pays twice, cannot be repurposed",()=>{
  const s=createM0Save(7777);
  const action={type:"BATTLE",txnId:"battle-same"};
  const first=executeM0(s,action,c),again=executeM0(first.state,action,c);
  assert.equal(again.duplicate,true);
  assert.equal(again.state,first.state);
  assert.deepEqual(again.result,first.result);
  assert.deepEqual(again.events,[]);
  assert.equal(again.state.run.exploration.battleCount,1);
  assert.throws(()=>executeM0(first.state,{type:"SET_MODE",mode:"paused",txnId:"battle-same"},c),/reused/);
});

test("train costs are defined, finite and cannot be charged when locked/insufficient",()=>{
  let s=createM0Save();
  assert.equal(trainingCost("attack",0),35);
  assert.throws(()=>doCmd(s,"TRAIN_HERO",{stat:"attack"}),/unlocks/);
  s=advanceTo(s,3);
  assert.equal(s.meta.featureUnlocks.hero_training,true);
  const previous=JSON.stringify(s);
  const statsBefore=getHeroStats(s);
  const a=doCmd(s,"TRAIN_HERO",{stat:"attack"});
  assert.equal(a.state.run.stones,s.run.stones-35);
  assert.equal(getHeroStats(a.state).attack,statsBefore.attack+10);
  assert.equal(JSON.stringify(s),previous);
  const broke=structuredClone(a.state);broke.run.stones=0;
  const unchanged=JSON.stringify(broke);
  assert.throws(()=>doCmd(broke,"TRAIN_HERO",{stat:"attack"}),/Insufficient/);
  assert.equal(JSON.stringify(broke),unchanged);
  assert.throws(()=>doCmd(s,"TRAIN_HERO",{stat:"unknown"}),/Unknown/);
});

test("stage 3 and future rewards unlock training once; no same-stage replaying",()=>{
  let s=advanceTo(createM0Save(999),3);
  const event=Object.values(s.receipts).flatMap(r=>r.result?.combat?[]:[]);
  assert.equal(s.run.exploration.highestCleared,3);
  assert.equal(s.meta.featureUnlocks.hero_training,true);
  assert.equal(s.run.exploration.battleCount,3);
  const original=JSON.stringify(s.meta.accountFirstClear);
  s=doCmd(s,"SET_MODE",{mode:"farm"}).state;
  s=doCmd(s,"BATTLE").state;
  assert.equal(JSON.stringify(s.meta.accountFirstClear),original);
  assert.equal(s.run.exploration.highestCleared,3);
});

test("failure switches to valid farm level, without paying defeat rewards",()=>{
  let s=createM0Save(1337);
  s.run.exploration.highestCleared=29;
  s.run.exploration.targetIndex=30;
  s.meta.bestDepth=29;
  validateM0Save(s);
  const r=doCmd(s,"BATTLE");
  assert.equal(r.result.stageFloor,30);
  assert.equal(r.result.won,false);
  assert.equal(r.result.stones,0);
  assert.equal(r.state.run.stones,0);
  assert.equal(r.state.run.exploration.mode,"farm");
  assert.equal(r.state.run.exploration.farmingIndex,29);
  assert.equal(r.state.run.exploration.lossCount,1);
  assert.equal(r.state.run.exploration.battleCount,1);
});

test("no background time accrual; preview does not mutate save",()=>{
  let s=createM0Save();
  const snapshot=JSON.stringify(s);
  const p=battlePreview(s,c);
  assert.equal(p.stage.id,c.stages[0].id);
  assert.ok(p.hitsToKill>=1);
  assert.ok(p.hitsToFall>=1);
  assert.equal(JSON.stringify(s),snapshot);
  const paused=doCmd(s,"SET_MODE",{mode:"paused"}).state;
  assert.throws(()=>doCmd(paused,"BATTLE"),/paused/);
  assert.equal(paused.run.stones,0);
});

test("storage restores exact schema and reset backs up M0 without touching legacy storage",()=>{
  const map=new Map([["gacha-ascension-mvp-v1","legacy-saved-forever"]]);
  const mem={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v))};
  const fresh=createM0Save(456);
  saveM0Save(fresh,mem);
  const restored=loadM0Save(mem);
  assert.equal(restored.status,"restored");
  assert.deepEqual(restored.state,fresh);
  const reset=resetM0Save(mem,789);
  assert.equal(reset.seed,789);
  assert.ok(mem.getItem(BACKUP_KEY)?.includes('"seed":456'));
  assert.equal(mem.getItem("gacha-ascension-mvp-v1"),"legacy-saved-forever");
  map.set(M0_SAVE_KEY,"{broken}");
  assert.equal(loadM0Save(mem).status,"invalid");
});

test("corrupt negative resources / illegal mode / mutable schema are rejected",()=>{
  for(const edit of [
    x=>x.run.stones=-2,
    x=>x.run.exploration.mode="teleport",
    x=>x.schemaVersion=55,
    x=>x.run.hero.training.attack=-1,
    x=>x.meta.bestDepth=-1
  ]){
    const s=createM0Save();edit(s);
    assert.throws(()=>validateM0Save(s));
  }
});

test("deterministic end-to-end seeds produce identical battle and economy",()=>{
  let a=createM0Save(1234),b=createM0Save(1234);
  for(let i=0;i<3;i++){
    const command={type:"BATTLE",txnId:"seed-test-"+i};
    const x=executeM0(a,command,c),y=executeM0(b,command,c);
    assert.deepEqual(x.result,y.result);
    a=x.state;b=y.state;
  }
  assert.deepEqual(a,b);
});
