import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,createSave,dispatch,validateSave,combatSnapshot,migrateSave} from '../src/v8/engine.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const world=read('realms-maps.v0.8.proposal.json'),slice=read('v8-slice.json');
const c=loadCatalog(world,slice);
const run=(s,type,{now=10000,...more}={})=>dispatch(s,c,{type,seq:s.seq+1,now,...more});

test('apex and 鸿蒙 multipliers are read from the catalog instead of being duplicated in code',()=>{
 const s=createSave(7);
 s.meta.ultras={U001:true,U002:true};
 s.meta.apex={A001:true,A002:true};
 s.run.technique='T001';s.run.cards.T001=2;
 s.run.pet='P001';s.run.cards.P001=2;
 const base=combatSnapshot(s,c,'mob');
 assert.equal(base.ultraDamageMultiplier,2.5);
 assert.equal(base.apexDamageMultiplier,1.4);
 const bumped=structuredClone(slice);
 bumped.ultras.find(x=>x.id==='U001').value=3.3;
 bumped.ultras.find(x=>x.id==='U002').value=6;
 bumped.apex.find(x=>x.id==='A001').value=1.9;
 bumped.apex.find(x=>x.id==='A002').value=2.4;
 const c2=loadCatalog(world,bumped);
 const changed=combatSnapshot(s,c2,'mob');
 assert.equal(changed.ultraDamageMultiplier,3.3);
 assert.equal(changed.apexDamageMultiplier,1.9);
 assert.ok(changed.pet.power>base.pet.power);
});

test('a pending battle can only be abandoned after its own clock, and awards nothing',()=>{
 const prepared=run(createSave(9),'PREPARE_BATTLE',{now:10000,enemyType:'mob'});
 const s=prepared.state,pending=s.run.pendingBattle;
 assert.ok(pending&&pending.durationMs>0);
 assert.throws(()=>run(s,'ABANDON_BATTLE',{now:10000}),/还未结束/);
 const out=run(s,'ABANDON_BATTLE',{now:10000+pending.durationMs});
 assert.equal(out.result.kind,'battleAbandoned');
 assert.equal(out.state.run.pendingBattle,undefined);
 assert.equal(out.state.run.stones,s.run.stones);
 validateSave(out.state,c);
});

test('an existing Schema10 save without the opening-wallet record migrates once and keeps its ledger',()=>{
 const old=createSave(11);
 delete old.run.startingStones;
 const first=migrateSave(old,c);
 assert.equal(first.migrated,true);
 assert.equal(first.state.run.startingStones,110);
 assert.equal(first.state.run.totalEarned+first.state.run.startingStones,
  first.state.run.stones+first.state.run.totalSpent);
 assert.equal(migrateSave(first.state,c).migrated,false);
});
