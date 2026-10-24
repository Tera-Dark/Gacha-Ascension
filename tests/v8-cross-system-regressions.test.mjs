import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,validateSave,SCHEMA,SAVE_KEY,fight} from "../src/v8/engine.mjs";
import {readGame,recoverInvalidSave} from "../src/v8/storage.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const run=(s,type,more={})=>dispatch(s,c,{type,seq:s.seq+1,...more});
function storage(){
 const map=new Map();
 return {map,getItem(key){return map.has(key)?map.get(key):null},
  setItem(key,value){map.set(key,String(value))},
  removeItem(key){map.delete(key)}};
}
test("an action-limit stalemate never means death and must not roll 50% equipment loss",()=>{
 const tuned={...c,balance:{...c.balance,mobHp:2_000_000,mobAttack:1}};
 for(let n=1;n<=55;n++){
  const s=createSave(10000+n);
  s.run.cards.E001=1;
  s.run.equipment.weapon1="E001";
  const out=dispatch(s,tuned,{type:"BATTLE",enemyType:"mob",seq:1});
  assert.equal(out.result.won,false);
  assert.equal(out.result.combat.reason,"timeout");
  assert.equal(out.result.failureReason,"timeout");
  assert.equal(out.result.lostGear,null);
  assert.equal(out.state.run.equipment.weapon1,"E001");
  assert.equal(out.state.run.cards.E001,1);
  assert.equal(out.state.run.lastBattle.failureReason,"timeout");
  assert.equal(out.state.run.victories,0);
  validateSave(out.state,tuned);
 }
});
test("offline stalemate report retains exact failure reason and never destroys equipment",()=>{
 const tuned={...c,balance:{...c.balance,mobHp:2_000_000,mobAttack:1}};
 const s=createSave(44444);s.run.cards.E001=1;s.run.equipment.weapon1="E001";
 const start=dispatch(s,tuned,{type:"START_IDLE",seq:1,now:10000});
 const predicted=fight(start.state,tuned,"mob",{seed:start.state.seed});
 assert.equal(predicted.reason,"timeout");
 const claim=dispatch(start.state,tuned,{type:"CLAIM_IDLE",seq:2,now:10000+predicted.timeMs+100});
 assert.equal(claim.result.active,false);
 assert.equal(claim.result.failureReason,"timeout");
 assert.equal(claim.result.lastBattle.failureReason,"timeout");
 assert.equal(claim.state.run.lastBattle.failureReason,"timeout");
 assert.equal(claim.state.run.equipment.weapon1,"E001");
 assert.equal(claim.state.run.cards.E001,1);
});
test("genuine lethal defeat retains intended roughly 50% gear loss",()=>{
 const tuned={...c,balance:{...c.balance,mobHp:2_000_000,mobAttack:100_000}};
 let drops=0;
 for(let n=1;n<=120;n++){
  const s=createSave(20000+n);
  s.run.cards.E001=1;s.run.equipment.weapon1="E001";
  const out=dispatch(s,tuned,{type:"BATTLE",enemyType:"mob",seq:1});
  assert.equal(out.result.won,false);
  assert.equal(out.result.combat.reason,"defeat");
  if(out.result.lostGear){
   drops++;assert.equal(out.state.run.cards.E001,undefined);
   assert.equal(out.state.run.equipment.weapon1,undefined);
  }else assert.equal(out.state.run.cards.E001,1);
  validateSave(out.state,tuned);
 }
 assert.ok(drops>35&&drops<85,"lethal losses should still occur near half the time, observed "+drops);
});
test("save rescue retains exact invalid bytes and never overwrites prior recoveries",()=>{
 const mem=storage(),invalid='{"schemaVersion":8,"seed":0,"player":"unreadable"}';
 mem.setItem(SAVE_KEY,invalid);
 const initial=readGame(c,mem);
 assert.equal(initial.status,"invalid");
 assert.equal(initial.raw,invalid);
 assert.equal(mem.getItem(SAVE_KEY),invalid);
 const first=recoverInvalidSave(c,mem);
 assert.equal(mem.getItem(first.backupKey),invalid);
 assert.equal(readGame(c,mem).status,"restored");
 assert.equal(first.state.schemaVersion,SCHEMA);
 assert.throws(()=>recoverInvalidSave(c,mem),/无需重置/);
 mem.setItem(SAVE_KEY,"{unexpected");
 const second=recoverInvalidSave(c,mem);
 assert.notEqual(first.backupKey,second.backupKey);
 assert.equal(mem.getItem(first.backupKey),invalid);
 assert.equal(mem.getItem(second.backupKey),"{unexpected");
 assert.equal(readGame(c,mem).status,"restored");
});
test("backup write failure cannot overwrite or erase the original corrupted save",()=>{
 const raw="{invalid json",mem=storage();
 mem.setItem(SAVE_KEY,raw);
 const rejected={getItem:key=>mem.getItem(key),
  setItem:(key,value)=>{if(key!==SAVE_KEY)throw Error("quota exceeded");mem.setItem(key,value)}};
 assert.throws(()=>recoverInvalidSave(c,rejected),/quota/);
 assert.equal(mem.getItem(SAVE_KEY),raw);
});
test("30-seed cross-system gameplay maintains cards, money, gear and save invariants",()=>{
 const focuses=["balanced","stones","cultivation"];
 const packs=["battle","wealth","cultivation","technique","pet","equipment","elixir","cave"];
 for(let seed=100;seed<130;seed++){
  let s=createSave(seed);
  for(let i=0;i<32;i++){
   const original=structuredClone(s);
   const target=focuses[i%3];
   s=run(s,"SET_FARM_FOCUS",{id:target}).state;
   validateSave(s,c);
   const combat=fight(s,c,"mob",{seed:s.seed});
   assert.deepEqual(fight(s,c,"mob",{seed:s.seed}),combat);
   if(i%4===0){
    const packId=packs[(i+seed)%packs.length],price=c.packById[packId].cost*Math.pow(1.9,s.run.mapIndex);
    if(s.run.stones>=price){
     try{s=run(s,"DRAW",{packId,count:1}).state}catch(error){
      assert.match(error.message,/尚未解锁/);
     }
    }
   }
   s=run(s,"BATTLE",{enemyType:"mob"}).state;
   validateSave(s,c);
   assert.equal(s.run.totalEarned+s.run.startingStones,s.run.stones+s.run.totalSpent);
   assert.ok(s.seq>original.seq);
  }
 }
});
