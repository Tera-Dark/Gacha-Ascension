import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,createSave,dispatch,validateSave,fight,combatSnapshot,breakthroughRequirements,SCHEMA,SAVE_KEY} from '../src/v8/engine.mjs';
import {productionStats} from '../src/v8/activities.mjs';
import {readGame} from '../src/v8/storage.mjs';
const j=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(j('realms-maps.v0.8.proposal.json'),j('v8-slice.json'));
const command=(s,type,now=0,args={})=>dispatch(s,c,{type,now,seq:s.seq+1,...args});
const initial=()=>{const s=createSave(112);s.run.world.at=0;return s};
const fund=s=>{s.run.stones+=100000;s.run.totalEarned+=100000;return s};
const normalize=s=>{const v=structuredClone(s);delete v.seq;v.run.world.lastReport=null;if(v.run.idle)v.run.idle.lastReport=null;return v};
test('gather, queue and meditate are exclusive, timed and idempotent',()=>{
 let s=command(initial(),'START_ACTIVITY',0,{activity:'gather',herb:'H001'}).state;
 s=command(s,'CLAIM_WORLD',180000).state;assert.equal(s.run.herbs.H001,3);
 s=command(s,'QUEUE_BREW',180000,{herb:'H001',mode:'count',amount:1}).state;
 assert.equal(s.run.consumables.MED001,undefined,'queue must not give instant output');
 const crafted=command(s,'CLAIM_WORLD',240000);s=crafted.state;
 assert.equal(s.run.consumables.MED001,1);assert.equal(s.run.herbs.H001,1);assert.equal(s.run.mastery.brew,1);
 assert.deepEqual(crafted.result.spent,{H001:3});assert.ok(s.meta.dao.milestones.firstCraft);
 assert.equal(command(s,'CLAIM_WORLD',240000).state.run.consumables.MED001,1);
 s=command(s,'START_ACTIVITY',240000,{activity:'meditate'}).state;
 const qi=s.run.qi;s=command(s,'CLAIM_WORLD',300000).state;
 assert.equal(s.run.qi-qi,c.management.meditateQi);assert.equal(s.run.herbs.H001,1);
 s=command(s,'START_IDLE',300000).state;assert.equal(s.run.world.activity.kind,'none');
});
test('advanced recipes and fields are real unlocks, stock targets pause and resume without banked work',()=>{
 let s=initial();assert.throws(()=>command(s,'SET_FIELD',0,{enabled:true,herb:'H001'}),/九转灵田/);
 assert.throws(()=>command(s,'QUEUE_BREW',0,{herb:'H002',mode:'count',amount:1}),/配方/);
 s.run.cards.H001=1;s.run.cards.D002=1;s=command(s,'CLAIM_WORLD').state;
 assert.equal(s.run.recipes.H002,true);
 s.run.herbs.H001=9;s=command(s,'SET_FIELD',0,{enabled:true,herb:'H001'}).state;
 s=command(s,'QUEUE_BREW',0,{herb:'H001',mode:'target',amount:1}).state;
 s=command(s,'CLAIM_WORLD',600000).state;assert.equal(s.run.consumables.MED001,1);
 assert.ok(s.run.world.lastReport.reasons.some(x=>x.includes('目标')));
 s=command(s,'PREPARE_ITEM',600000,{id:'MED001'}).state;
 s=command(s,'CLAIM_WORLD',660000).state;assert.equal(s.run.consumables.MED001,1);
 assert.equal(s.run.mastery.brew,2);
});
test('full queue, invalid amounts, unavailable herbs and backwards clocks are rejected atomically',()=>{
 let s=initial();for(let i=0;i<3;i++)s=command(s,'QUEUE_BREW',0,{herb:'H001',mode:'count',amount:1}).state;
 const bytes=JSON.stringify(s);
 assert.throws(()=>command(s,'QUEUE_BREW',0,{herb:'H001',mode:'count',amount:1}),/已满/);
 assert.throws(()=>command(s,'QUEUE_BREW',0,{herb:'H001',mode:'target',amount:0}),/数量/);
 assert.throws(()=>command(s,'START_ACTIVITY',0,{activity:'gather',herb:'H003'}),/未解锁/);
 assert.equal(JSON.stringify(s),bytes);
 s=command(s,'CLAIM_WORLD',5).state;
 const rolledBack=command(s,'CLAIM_WORLD',4);
 assert.equal(rolledBack.state.run.world.at,5);
 assert.ok(rolledBack.result.reasons.some(x=>x.includes('时间回退')));
 validateSave(rolledBack.state,c);
});
test('eight hours in one claim equals split claims, including concurrent harvest, crafting, combat and potions',()=>{
 let s=initial();s.run.cards.H001=3;s.run.cards.H003=3;s.run.herbs.H001=60;
 s.meta.autoPotion={unlocked:true,enabled:true,threshold:.7};
 s=command(s,'CLAIM_WORLD').state;
 s=command(s,'SET_FIELD',0,{enabled:true,herb:'H001'}).state;
 s=command(s,'QUEUE_BREW',0,{herb:'H001',mode:'target',amount:20}).state;
 s=command(s,'START_IDLE').state;
 const one=command(s,'CLAIM_WORLD',8*3600000).state;
 let split=s;for(let t=600000;t<=8*3600000;t+=600000)split=command(split,'CLAIM_WORLD',t).state;
 assert.deepEqual(normalize(one),normalize(split));
 assert.ok(one.run.mobKills>0);assert.ok(one.run.mastery.brew>0);validateSave(one,c);
});
test('24h cap applies to both lives and stock full never destroys pre-existing holdings',()=>{
 for(const lives of [0,1]){
  let s=initial();s.meta.reincarnations=lives;s.run.herbs.H001=10000;
  s=command(s,'START_ACTIVITY',0,{activity:'gather',herb:'H001'}).state;
  const res=command(s,'CLAIM_WORLD',30*3600000);assert.equal(res.result.elapsedMs,86400000);assert.equal(res.result.capped,true);assert.equal(res.state.run.herbs.H001,10000);
  assert.equal(command(res.state,'CLAIM_WORLD',30*3600000).result.elapsedMs,0);
 }
});
test('normal pulls give 20-pull directed core reward; ineligible/locked cards cannot be claimed',()=>{
 let s=fund(initial());for(let i=0;i<2;i++)s=command(s,'DRAW',0,{packId:'battle',count:10}).state;
 const seed=s.seed,draws=s.run.draws.battle;
 assert.throws(()=>command(s,'CLAIM_DIRECTED',0,{id:'T003'}),/已开放定向池/);
 s.run.checkpoint=1;s.meta.bestCheckpoint=2;
 s=command(s,'CLAIM_DIRECTED',0,{id:'T003'}).state;
 assert.equal(s.run.cards.T003,1);assert.equal(s.meta.knowledge.cards.T003,true);assert.equal(s.seed,seed);assert.equal(s.run.draws.battle,draws);
 assert.throws(()=>command(s,'CLAIM_DIRECTED',0,{id:'T003'}),/20抽/);
 assert.throws(()=>command(s,'CLAIM_DIRECTED',0,{id:'U001'}),/定向池/);
});
test('card numerical copies cap at six and tier thresholds change mechanics',()=>{
 let s=initial();s.run.cards.T001=1;s.run.cards.P001=1;s.run.technique='T001';s.run.pet='P001';
 const one=fight(s,c,'guardian',{seed:91});assert.ok(one.logs.some(x=>x.mechanic==='剑意释放'));
 s.run.cards.T001=6;const six=fight(s,c,'guardian',{seed:91});
 s.run.cards.T001=600;const many=fight(s,c,'guardian',{seed:91});assert.deepEqual(six,many);
 s.run.cards.T002=3;s.run.cards.P002=3;s.run.technique='T002';s.run.pet='P002';
 assert.ok(fight(s,c,'guardian',{seed:91}).logs.some(x=>x.actor==='retaliation'));
 s.run.cards.T003=3;s.run.cards.P003=3;s.run.technique='T003';s.run.pet='P003';
 assert.ok(fight(s,c,'guardian',{seed:91}).logs.some(x=>x.mechanic==='灵契追击'));
});
test('knowledge survives rebirth; only two eligible distinct cards are inherited at base copies',()=>{
 let s=fund(initial());s.run.cards={T001:12,P001:9,H001:6,B001:7};s.run.technique='T001';s.run.pet='P001';
 s.run.bossCleared=true;s.run.realmIndex=3;s.run.mapIndex=3;s.run.checkpoint=7;
 s=command(s,'CLAIM_WORLD').state;
 assert.throws(()=>command(s,'SET_INHERITANCE',0,{ids:['T001','P001','H001']}),/两张/);
 assert.throws(()=>command(s,'SET_INHERITANCE',0,{ids:['B001']}),/只能传承/);
 s=command(s,'SET_INHERITANCE',0,{ids:['T001','H001']}).state;
 s.meta.directed.draws=19;s.run.herbs.H001=30;
 s=command(s,'REINCARNATE').state;
 assert.deepEqual(s.run.cards,{T001:1,H001:1});assert.equal(s.run.herbs.H001,undefined);
 assert.equal(s.meta.knowledge.cards.P001,true);assert.equal(s.meta.directed.draws,19);assert.equal(s.run.world.queue.length,0);
 assert.equal(breakthroughRequirements(s,c).qi,Math.round(c.realms[0].nextQiCost*c.management.realmQiFactor*.6));
 s=command(s,'LEARN_DAO',0,{id:'inherit'}).state;
 s.run.bossCleared=true;s=command(s,'REINCARNATE').state;assert.equal(s.run.cards.T001,2);
});
test('dao milestones are one-time, prerequisites and point accounting are enforced',()=>{
 let s=fund(initial());s=command(s,'DRAW',0,{packId:'battle',count:1}).state;assert.equal(s.meta.dao.points,1);
 s=command(s,'DRAW',0,{packId:'battle',count:1}).state;assert.equal(s.meta.dao.points,1);
 assert.throws(()=>command(s,'LEARN_DAO',0,{id:'queue'}),/未满足/);
 s=command(s,'LEARN_DAO',0,{id:'warehouse'}).state;assert.equal(productionStats(s,c).herbCap,600);
 assert.throws(()=>command(s,'LEARN_DAO',0,{id:'warehouse'}),/未满足/);
});
test('production continues during manual combat without changing its frozen heal availability or RNG',()=>{
 let s=initial();s.run.herbs.H001=9;s=command(s,'QUEUE_BREW',0,{herb:'H001',mode:'count',amount:3}).state;
 s=command(s,'PREPARE_BATTLE',0,{enemyType:'guardian'}).state;
 const snapshot=structuredClone(s.run.pendingBattle),seed=s.seed;
 s=command(s,'CLAIM_WORLD',60000).state;
 assert.deepEqual(s.run.pendingBattle,snapshot);assert.equal(s.seed,seed);assert.equal(s.run.consumables.MED001,1);
 const out=command(s,'FINISH_BATTLE',Math.max(60000,snapshot.durationMs));assert.ok(out.result.combat);assert.equal(out.state.run.pendingBattle,undefined);
});
test('schema8 migration backs up exact bytes, preserves holdings and never invents missing history',()=>{
 const old=initial();old.schemaVersion=8;delete old.run.world;delete old.run.recipes;delete old.run.mastery;
 delete old.meta.dao;delete old.meta.knowledge;delete old.meta.directed;delete old.meta.inheritance;
 old.run.cards={T001:4};old.run.technique='T001';old.meta.fate=81;old.meta.relics.R001=2;
 const raw=JSON.stringify(old),mem=new Map([[SAVE_KEY,raw]]),storage={getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v))};
 const loaded=readGame(c,storage);assert.equal(loaded.status,'migrated');assert.equal(mem.get(loaded.backupKey),raw);
 assert.equal(loaded.state.schemaVersion,SCHEMA);assert.equal(loaded.state.run.cards.T001,4);assert.equal(loaded.state.meta.fate,81);
 assert.equal(loaded.state.meta.knowledge.cards.T001,true);assert.equal(loaded.state.meta.knowledge.cards.P001,undefined);assert.equal(loaded.state.meta.directed.draws,0);
 assert.equal(readGame(c,storage).status,'restored');
});
test('satisfied stock targets yield to the next recipe, retaining separate unfinished work',()=>{
 let s=initial();s.run.cards.D002=1;s.run.herbs={H001:6,H002:6};s=command(s,'CLAIM_WORLD').state;
 s=command(s,'QUEUE_BREW',0,{herb:'H001',mode:'target',amount:1}).state;
 s=command(s,'QUEUE_BREW',0,{herb:'H002',mode:'count',amount:2}).state;
 s=command(s,'CLAIM_WORLD',90000).state;assert.equal(s.run.consumables.MED001,1);assert.equal(s.run.world.queue[1].carryMs,30000);
 s=command(s,'PREPARE_ITEM',90000,{id:'MED001'}).state;
 s=command(s,'CLAIM_WORLD',150000).state;assert.equal(s.run.consumables.MED001,1);
 s=command(s,'CLAIM_WORLD',180000).state;assert.equal(s.run.consumables.MED002,1,'previous recipe lost its half-finished work');
 s=command(s,'CLAIM_WORLD',240000).state;assert.equal(s.run.consumables.MED002,2);assert.equal(s.run.world.queue.length,1);
});
test('legacy active combat retains the original snapshot clock and migration failure never replaces original bytes',()=>{
 const old=initial();old.run.cards={T002:12,P002:9};old.run.technique='T002';old.run.pet='P002';
 const snapshot=combatSnapshot(old,c,'guardian',true);
 const legacyState=structuredClone(old);legacyState.run.pendingBattle={kind:'guardian',snapshot,seed:old.seed};
 const combat=fight(legacyState,c,'guardian',{seed:old.seed});
 old.schemaVersion=8;old.run.pendingBattle={kind:'guardian',seed:old.seed,startedAt:0,durationMs:combat.timeMs};
 delete old.run.world;delete old.run.mastery;delete old.run.recipes;delete old.meta.dao;delete old.meta.knowledge;delete old.meta.directed;delete old.meta.inheritance;
 const raw=JSON.stringify(old),map=new Map([[SAVE_KEY,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v))};
 const loaded=readGame(c,storage);assert.equal(loaded.status,'migrated');
 assert.deepEqual(fight(loaded.state,c,'guardian',{seed:old.seed}),combat);
 const denied={getItem:k=>k===SAVE_KEY?raw:null,setItem:()=>{throw Error('quota')}};
 assert.equal(readGame(c,denied).status,'blocked');assert.equal(denied.getItem(SAVE_KEY),raw);
});
