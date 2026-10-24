import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,createSave,dispatch,SAVE_KEY,validateSave} from '../src/v8/engine.mjs';
import {readGame,writeGame,importGame} from '../src/v8/storage.mjs';
import {restoreSession} from '../src/v8/restore-worker.mjs';
import {openSession} from '../src/v8/session.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(read('realms-maps.v0.8.proposal.json'),read('v8-slice.json'));
const cmd=(s,type,now,args={})=>dispatch(s,c,{type,seq:s.seq+1,now,...args});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),data}};
test('return rewards and newest five ledgers commit together; ticking, reading and acknowledging cannot replay rewards',()=>{
 let s=cmd(createSave(),'START_ACTIVITY',0,{activity:'meditate'}).state;
 for(let i=1;i<=7;i++)s=restoreSession(s,c,i*3600000).state;
 assert.equal(s.meta.returns.length,5);assert.equal(s.meta.returns[0].report.qi,4800);
 const rows=structuredClone(s.meta.returns),qi=s.run.qi;
 s=cmd(s,'CLAIM_WORLD',7*3600000).state;assert.deepEqual(s.meta.returns,rows);
 s=cmd(s,'ACK_RETURN',8*3600000,{id:rows[0].id}).state;assert.equal(s.run.qi,qi);assert.equal(s.run.world.at,7*3600000);
 assert.equal(s.meta.returns[0].acknowledged,true);
 s=restoreSession(s,c,7*3600000).state;assert.equal(s.run.qi,qi);assert.equal(s.meta.returns.length,5);
 validateSave(s,c);assert.throws(()=>cmd(s,'ACK_RETURN',undefined,{id:-1}),/不存在/);
});
test('worker kernel matches chronological online kernel and caps the whole recovery once',()=>{
 let s=cmd(createSave(),'START_ACTIVITY',0,{activity:'gather',herb:'H001'}).state;
 s=cmd(s,'QUEUE_BREW',0,{herb:'H001',mode:'target',amount:60}).state;
 const before=JSON.stringify(s),out=restoreSession(s,c,30*3600000);
 assert.equal(JSON.stringify(s),before);assert.equal(out.result.elapsedMs,86400000);assert.equal(out.result.capped,true);
 let split=s;for(let t=3600000;t<=24*3600000;t+=3600000)split=cmd(split,'CLAIM_WORLD',t).state;
 for(const key of ['herbs','consumables','mastery','cards'])assert.deepEqual(out.state.run[key],split.run[key]);
 assert.deepEqual(out.result.spent,{H001:180});assert.ok(out.result.reasons.some(x=>x.includes('目标')));
 assert.equal(restoreSession(out.state,c,30*3600000).result.elapsedMs,0);
});
test('return ledger accounts for prepared buff consumption as well as healing',()=>{
 let s=createSave();s.run.prepared.MED002=1;s.run.prepared.MED003=1;
 s=cmd(s,'START_IDLE',0).state;
 const out=restoreSession(s,c,60000);
 assert.equal(out.result.usedItems.MED002,1);assert.equal(out.result.usedItems.MED003,1);
 assert.deepEqual(out.state.meta.returns[0].report.usedItems,out.result.usedItems);
 assert.equal(out.state.run.prepared.MED002,0);assert.equal(out.state.run.prepared.MED003,0);
});
test('schema9 raw backup precedes migration; read-only open and backup failure cannot change active bytes',()=>{
 const legacy=createSave(43);legacy.schemaVersion=9;delete legacy.meta.returns;legacy.run.cards.T001=3;
 const raw=JSON.stringify(legacy,null,2),storage=memory();storage.setItem(SAVE_KEY,raw);
 const ro=readGame(c,storage,{readOnly:true});assert.equal(ro.state.schemaVersion,10);assert.equal(storage.getItem(SAVE_KEY),raw);
 const loaded=readGame(c,storage);assert.equal(storage.getItem(loaded.backupKey),raw);assert.deepEqual(loaded.state.meta.returns,[]);assert.equal(loaded.state.run.cards.T001,3);
 const failed={getItem:k=>k===SAVE_KEY?raw:null,setItem:()=>{throw Error('quota')}};
 assert.equal(readGame(c,failed).status,'blocked');assert.equal(failed.getItem(SAVE_KEY),raw);
 const target=memory();importGame(raw,c,target);assert.equal(target.getItem(SAVE_KEY+'-schema9-import-backup'),raw);
});
test('single writer excludes second tab and guards against older clients; release enables takeover',async()=>{
 const storage=memory();storage.setItem(SAVE_KEY,JSON.stringify(createSave()));
 let held=false;
 const locks={request:async(name,options,callback)=>{if(held)return callback(null);held=true;try{return await callback({name})}finally{held=false}}};
 const one=await openSession(storage,locks),two=await openSession(storage,locks);
 assert.equal(one.writable,true);assert.equal(two.writable,false);
 assert.throws(()=>writeGame(createSave(2),c,two.storage),/只读/);
 one.storage.setItem(SAVE_KEY,JSON.stringify(createSave(3)));
 storage.setItem(SAVE_KEY,JSON.stringify(createSave(4)));
 assert.throws(()=>writeGame(createSave(5),c,one.storage),/其他页面/);assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).seed,4);
 one.close();await new Promise(r=>setTimeout(r,0));const third=await openSession(storage,locks);assert.equal(third.writable,true);third.close();two.close();
 const unsupported=await openSession(storage,null);assert.equal(unsupported.writable,false);
});
test('failed active-slot write preserves both reward input and persistent save',async()=>{
 const storage=memory(),start=cmd(createSave(),'START_ACTIVITY',0,{activity:'meditate'}).state;
 storage.setItem(SAVE_KEY,JSON.stringify(start));const session=await openSession(storage,{request:async(n,o,cb)=>cb({})});
 const original=storage.getItem(SAVE_KEY),out=restoreSession(start,c,86400000);
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>writeGame(out.state,c,session.storage),/quota/);
 assert.equal(storage.getItem(SAVE_KEY),original);assert.equal(start.run.qi,0);session.close();
});
