import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,createSave,dispatch,validateSave,SAVE_KEY} from '../src/v8/engine.mjs';
import {importGame,parseImport} from '../src/v8/storage.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(read('realms-maps.v0.8.proposal.json'),read('v8-slice.json'));
const memory=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}};
test('import validates first, preserves exact existing bytes and never overwrites previous backups',()=>{
 const storage=memory(),original=JSON.stringify(createSave(11),null,2),raw=JSON.stringify(createSave(22));storage.setItem(SAVE_KEY,original);
 const first=importGame(raw,c,storage);assert.equal(storage.getItem(first.backupKey),original);assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).seed,22);
 const second=importGame(JSON.stringify(createSave(33)),c,storage);assert.notEqual(second.backupKey,first.backupKey);assert.equal(storage.getItem(first.backupKey),original);
});
test('malformed, oversized and invalid inventory imports leave active progress and backups untouched',()=>{
 const storage=memory();storage.setItem(SAVE_KEY,JSON.stringify(createSave(11)));const before=[...storage.data];
 for(const raw of ['broken','x'.repeat(2*1024*1024+1),JSON.stringify({...createSave(4),seed:0})]){assert.throws(()=>importGame(raw,c,storage));assert.deepEqual([...storage.data],before)}
});
test('backup failure cannot replace the active slot; Schema8 imports explicitly migrate',()=>{
 const old=JSON.stringify(createSave(41)),storage={getItem:key=>key===SAVE_KEY?old:null,setItem:()=>{throw Error('full')}};
 assert.throws(()=>importGame(JSON.stringify(createSave(42)),c,storage),/full/);assert.equal(storage.getItem(SAVE_KEY),old);
 const legacy=createSave(43);legacy.schemaVersion=8;assert.equal(parseImport(JSON.stringify(legacy),c).schemaVersion,10);
 const incoming=JSON.stringify(legacy,null,2),target=memory();importGame(incoming,c,target);
 assert.equal(target.getItem(SAVE_KEY+'-schema8-import-backup'),incoming);
});
test('a real Schema8 save missing later containers still migrates and can keep playing',()=>{
 const old=createSave(44);old.schemaVersion=8;
 // The first Schema8 build had no 洞府 world, chests, equipment, consumables,
 // farm focus, opening-wallet record or progression bookkeeping.
 delete old.run.world;delete old.run.recipes;delete old.run.mastery;
 delete old.run.herbs;delete old.run.consumables;delete old.run.prepared;
 delete old.run.boxes;delete old.run.equipment;delete old.run.artifacts;
 delete old.run.farmFocus;delete old.run.startingStones;
 delete old.meta.knowledge;delete old.meta.directed;delete old.meta.dao;delete old.meta.inheritance;delete old.meta.returns;
 old.run.cards.T001=2;old.run.mapIndex=1;old.run.stones=500;old.run.totalEarned=390;
 const upgraded=parseImport(JSON.stringify(old),c);
 assert.equal(upgraded.schemaVersion,10);
 assert.equal(upgraded.run.cards.T001,2);assert.equal(upgraded.run.mapIndex,1);assert.equal(upgraded.run.stones,500);
 assert.equal(upgraded.run.startingStones,110);
 assert.ok(upgraded.run.world&&upgraded.run.recipes&&upgraded.run.mastery);
 assert.ok(upgraded.run.herbs&&upgraded.run.consumables&&upgraded.run.prepared&&upgraded.run.boxes);
 assert.ok(upgraded.meta.knowledge&&upgraded.meta.dao&&upgraded.meta.directed);
 // The old bug only appeared on the first production command after migrating.
 const command=(state,type,now,more={})=>dispatch(state,c,{type,seq:state.seq+1,now,...more}).state;
 let s=command(upgraded,'START_ACTIVITY',1000,{activity:'gather',herb:'H001'});
 s=command(s,'CLAIM_WORLD',1000+10*60000);
 assert.ok((s.run.herbs.H001||0)>0);
 s=command(s,'START_IDLE',1000+11*60000);
 s=command(s,'CLAIM_WORLD',1000+30*60000);
 assert.ok(s.run.mobKills>0);
 validateSave(s,c);
});
