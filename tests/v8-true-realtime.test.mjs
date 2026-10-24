import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,fight,validateSave,SCHEMA,SAVE_KEY} from "../src/v8/engine.mjs";
import {combatTimeline} from "../src/v8/combat-timeline.mjs";
import {readGame,writeGame} from "../src/v8/storage.mjs";
const json=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(json("realms-maps.v0.8.proposal.json"),json("v8-slice.json"));
const act=(s,type,at,other={})=>dispatch(s,c,{type,now:at,seq:s.seq+1,...other});
const start=100000;
test("manual attacks preview real elapsed events but do not grant resources until final strike",()=>{
 let s=createSave(20261020),before=structuredClone(s);
 const planned=fight(s,c,"mob",{seed:s.seed});
 const begin=act(s,"PREPARE_BATTLE",start,{enemyType:"mob"});
 assert.deepEqual(begin.result.combat,planned);
 const pending=begin.state.run.pendingBattle;
 assert.equal(pending.seed,before.seed);
 assert.equal(pending.durationMs,Math.ceil(planned.timeMs));
 assert.equal(begin.state.run.stones,before.run.stones);
 assert.equal(begin.state.run.totalEarned,0);
 assert.equal(begin.state.run.victories,0);
 assert.equal(begin.state.seed,before.seed,"preview may not mutate seeded battle");
 const first=planned.logs.find(e=>e.actor==="hero"&&e.amount>0&&e.timeMs<planned.timeMs);
 assert.ok(first);
 const partial=combatTimeline(planned,first.timeMs+1);
 assert.ok(partial.past.some(x=>x.seq===first.seq));
 assert.ok(partial.remainingMs>0);
 assert.throws(()=>act(begin.state,"FINISH_BATTLE",start+planned.timeMs-1),/还未完成/);
 for(const command of [
  {type:"DRAW",args:{packId:"battle",count:1}},
  {type:"EQUIP_TECH",args:{id:null}},
  {type:"BREAKTHROUGH"},
  {type:"BATTLE",args:{enemyType:"mob"}},
  {type:"START_IDLE"}
 ])assert.throws(()=>act(begin.state,command.type,start+100,command.args),/战斗尚在进行/);
 const finished=act(begin.state,"FINISH_BATTLE",start+planned.timeMs+1);
 assert.equal(finished.result.combat.nextSeed,planned.nextSeed);
 assert.equal(finished.state.run.pendingBattle,undefined);
 assert.equal(finished.state.run.lastBattle.won,planned.won);
 assert.equal(finished.state.run.victories,Number(planned.won));
 assert.equal(finished.state.run.stones,before.run.stones+finished.result.stones);
 assert.throws(()=>act(finished.state,"FINISH_BATTLE",start+500000),/没有等待结算/);
 validateSave(finished.state,c);
});
test("multi-wave guardian is uncommitted until full real duration and retains exact progression",()=>{
 const s=createSave(71),planned=fight(s,c,"guardian",{seed:s.seed});
 assert.equal(planned.waves.length,2);
 const prepared=act(s,"PREPARE_BATTLE",start,{enemyType:"guardian"});
 assert.equal(prepared.state.run.checkpoint,0);
 assert.equal(prepared.state.meta.bestCheckpoint,1);
 assert.throws(()=>act(prepared.state,"FINISH_BATTLE",start+planned.timeMs-1),/还未完成/);
 const final=act(prepared.state,"FINISH_BATTLE",start+planned.timeMs);
 assert.equal(final.result.won,planned.won);
 assert.equal(final.state.run.checkpoint,planned.won?1:0);
 assert.equal(final.state.run.lastBattle.type,"guardian");
});
test("battle in progress survives serializing, loading and resuming with no extra draw or RNG consumption",()=>{
 const memory=new Map();
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)};
 const saved=act(createSave(111),"PREPARE_BATTLE",start,{enemyType:"mob"}).state;
 writeGame(saved,c,storage);
 const read=readGame(c,storage);
 assert.equal(read.status,"restored");
 assert.deepEqual(read.state.run.pendingBattle,saved.run.pendingBattle);
 const loaded=read.state;
 assert.equal(loaded.seed,saved.seed);
 const ready=act(loaded,"FINISH_BATTLE",start+loaded.run.pendingBattle.durationMs);
 writeGame(ready.state,c,storage);
 assert.equal(readGame(c,storage).state.seq,ready.state.seq);
 assert.equal(readGame(c,storage).state.run.pendingBattle,undefined);
 assert.equal(SCHEMA,10);assert.equal(SAVE_KEY,"gacha-ascension-v8-slice-v1");
});
test("three-wave map Boss uses the complete timeline and only changes map on final settlement",()=>{
 const s=createSave(2026);s.run.checkpoint=c.checkpointsPerMap-1;
 const planned=fight(s,c,"boss",{seed:s.seed});
 assert.equal(planned.waves.length,3);
 const prepared=act(s,"PREPARE_BATTLE",start,{enemyType:"boss"});
 assert.equal(prepared.state.run.mapIndex,0);
 assert.equal(prepared.state.run.checkpoint,c.checkpointsPerMap-1);
 assert.equal(prepared.state.run.bossWins,0);
 const lastLog=planned.logs.at(-1);
 assert.ok(lastLog.timeMs<=planned.timeMs);
 assert.throws(()=>act(prepared.state,"FINISH_BATTLE",start+planned.timeMs-1),/还未完成/);
 const settled=act(prepared.state,"FINISH_BATTLE",start+planned.timeMs+1);
 assert.equal(settled.result.combat.totalWaves,3);
 assert.equal(settled.result.won,planned.won);
 assert.equal(settled.state.run.mapIndex,planned.won?1:0);
 assert.equal(settled.state.run.bossWins,Number(planned.won));
 validateSave(settled.state,c);
});
test("invalid/bypassed battle operations do not silently settle during a pending encounter",()=>{
 const begin=act(createSave(71),"PREPARE_BATTLE",start,{enemyType:"mob"}).state;
 assert.throws(()=>act(begin,"CLAIM_IDLE",start+1000),/战斗尚在进行/);
 assert.throws(()=>act(begin,"PREPARE_BATTLE",start+1000,{enemyType:"mob"}),/战斗尚在进行/);
 const altered=structuredClone(begin);altered.seed++;
 assert.throws(()=>validateSave(altered,c),/战斗记录损坏/);
});
