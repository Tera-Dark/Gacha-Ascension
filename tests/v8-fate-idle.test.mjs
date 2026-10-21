import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,heroStats,yields,fight} from "../src/v8/engine.mjs";
import {baseCandidates,baseRates,rareRolls,pullFate} from "../src/v8/relic-pool.mjs";
import {battleIntervalMs} from "../src/v8/idle.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const exec=(s,type,data={})=>dispatch(s,c,{type,seq:s.seq+1,...data});
const nextMs=s=>Math.max(900,Math.ceil(fight(s,c,"mob",{seed:s.seed}).timeMs));
test("layered tiers have explicitly exact 1/100000 and 1/1000000 chances",()=>{
 assert.equal(c.fate.apexChance,1/100000);assert.equal(c.fate.ultraChance,1/1000000);
 assert.deepEqual(rareRolls(0,0),{apex:true,hongmeng:true});
 assert.deepEqual(rareRolls(.00001,.000001),{apex:false,hongmeng:false});
 assert.deepEqual(rareRolls(.000011,0),{apex:false,hongmeng:true});
 assert.deepEqual(rareRolls(0,.000002),{apex:true,hongmeng:false});
 assert.deepEqual(rareRolls(.5,.5),{apex:false,hongmeng:false});
});
test("permanent no-cap relics never exit ordinary tier pool",()=>{
 let s=createSave(77);
 for(const r of c.relics)if(r.max!=null)s.meta.relics[r.id]=r.max;
 const allowed=baseCandidates(s,c);
 assert.equal(allowed.length,4);
 assert.ok(allowed.every(x=>x.max==null));
 assert.ok(baseRates(s,c).every(x=>["huang","xuan"].includes(x.tier)));
 s.meta.fate=4000;
 const a=exec(s,"OPEN_RELIC");
 assert.equal(a.result.kind,"relic");
 assert.ok(a.result.relic.max==null);
 assert.equal(a.state.meta.fate,3960);
});
test("guaranteed normal chest always pays a baseline card even if every capped card is full",()=>{
 const s=createSave(99);
 for(const r of c.relics)if(r.max!=null)s.meta.relics[r.id]=r.max;
 s.meta.fate=500;
 let updated=s;
 for(let i=0;i<10;i++){const n=exec(updated,"OPEN_RELIC");updated=n.state;assert.ok(n.result.relic.id);assert.equal(n.result.independentRolls,true)}
 assert.equal(updated.meta.totalFateChests,10);
 assert.equal(updated.meta.fate,100);
});
test("tier pity is only for existing ordinary tiers; no ten-million rare pity",()=>{
 const s=createSave(51);s.meta.pity=24;s.meta.pityXian=79;s.meta.fate=40;
 const next=exec(s,"OPEN_RELIC");
 assert.equal(next.result.relic.rarity,"xian");assert.equal(next.state.meta.pityXian,0);
 assert.equal(next.result.pityTriggered,"xian");
 assert.equal(next.state.meta.ultras.U001,undefined);
 assert.equal(next.state.meta.apex.A001,undefined);
});
test("Primordial and Hongmeng can both appear on same chest independently without replacing base",()=>{
 const s=createSave(55);s.meta.fate=80;
 let i=0;const samples=[.01,.01,0,0,.1,.1];
 const res=pullFate(s,c,()=>samples[i++]??.4);
 assert.ok(res.relic.id.startsWith("R"));assert.ok(res.apex?.id.startsWith("A"));
 assert.ok(res.ultra?.id.startsWith("U"));assert.equal(s.meta.fate,40);
 assert.equal(Object.values(s.meta.apex).filter(Boolean).length,1);
 assert.equal(Object.values(s.meta.ultras).filter(Boolean).length,1);
});
test("unlimited relics remain effective after arbitrary quantity without an artificial relic hard cap",()=>{
 const s=createSave();
 const before=heroStats(s,c),initial=yields(s,c);
 s.meta.relics.R001=5000;s.meta.relics.R002=5000;
 s.meta.relics.R003=5000;s.meta.relics.R004=5000;
 const after=heroStats(s,c),econ=yields(s,c);
 assert.ok(after.attack>=before.attack+10000);
 assert.ok(after.hp>before.hp+50000);
 assert.ok(econ.stonePct>initial.stonePct+4000);
 assert.ok(econ.qiPct>initial.qiPct+4000);
});
test("offline monster claim uses the exact on-screen battle mutation and only current checkpoint",()=>{
 const t=1_000_000;
 let s=exec(createSave(127),"START_IDLE",{now:t}).state;
 assert.equal(s.run.idle.active,true);
 const result=exec(s,"CLAIM_IDLE",{now:t+nextMs(s)});
 assert.equal(result.result.kind,"idleClaim");assert.equal(result.result.attempts,1);
 assert.equal(result.state.run.checkpoint,0);assert.equal(result.state.run.mapIndex,0);
 assert.equal(result.result.stones,result.result.lastBattle.stones);
 const live=exec(createSave(127),"BATTLE",{enemyType:"mob"});
 assert.equal(result.state.run.stones,live.state.run.stones);
 assert.equal(result.state.run.qi,live.state.run.qi);
 assert.equal(result.state.seed,live.state.seed);
});
test("idempotent same-time offline resume cannot create duplicate rewards",()=>{
 const t=900000;
 let s=exec(createSave(112),"START_IDLE",{now:t}).state;
 const one=exec(s,"CLAIM_IDLE",{now:t+1550});
 s=one.state;
 const again=exec(s,"CLAIM_IDLE",{now:t+1550});
 assert.equal(again.result.attempts,0);
 assert.equal(again.result.stones,0);
 assert.equal(again.state.run.stones,s.run.stones);
});
test("offline farms only monsters, never runs boss, gacha, breakthrough or reincarnation",()=>{
 let s=createSave(230);
 s.run.checkpoint=7;
 s=exec(s,"START_IDLE",{now:400000}).state;
 const res=exec(s,"CLAIM_IDLE",{now:420000});
 assert.equal(res.state.run.checkpoint,7);
 assert.equal(res.state.run.mapIndex,0);
 assert.equal(res.state.run.bossWins,0);
 assert.equal(res.state.run.guardianWins,0);
 assert.equal(res.state.meta.reincarnations,0);
 assert.equal(Object.keys(res.state.run.cards).length,0);
});
test("offline time cap is 24 hours in every life",()=>{
 let s=exec(createSave(3),"START_IDLE",{now:1}).state;
 const first=exec(s,"CLAIM_IDLE",{now:1+30*3600*1000});
 assert.equal(first.result.elapsedMs,24*60*60*1000);
 assert.equal(first.result.capped,true);
 // Verify the invariant on a fresh reincarnated account; 2h remains the maximum.
 s=createSave(3);s.meta.reincarnations=1;
 s=exec(s,"START_IDLE",{now:1}).state;
 const second=exec(s,"CLAIM_IDLE",{now:1+30*3600*1000});
 assert.equal(second.result.elapsedMs,24*60*60*1000);
 assert.equal(second.result.capped,true);
});
test("stop action settles first, then disables farm; upgrade commands settle old farm session first",()=>{
 let s=exec(createSave(10),"START_IDLE",{now:20000}).state;
 const stopped=exec(s,"STOP_IDLE",{now:20000+nextMs(s)});
 assert.equal(stopped.state.run.idle.active,false);
 assert.equal(stopped.result.attempts,1);
 s=exec(createSave(20),"START_IDLE",{now:30000}).state;
 const funded=exec(s,"DRAW",{now:30000+nextMs(s),packId:"battle",count:1});
 assert.ok(funded.state.run.mobKills>=1);
 assert.ok(funded.state.run.cards.B001>=1);
});
