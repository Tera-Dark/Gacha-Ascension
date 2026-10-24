import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSave,loadCatalog,dispatch} from "../src/v8/engine.mjs";
import {MODULES,unimplementedModules,unlockedPack,validateContentContract} from "../src/v8/modules.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const world=read("realms-maps.v0.8.proposal.json"),slice=read("v8-slice.json"),catalog=loadCatalog(world,slice);
test("each shipping pack is registered and schema-valid",()=>{
 assert.equal(catalog.packs.length,9);
 assert.ok(validateContentContract(slice));
 for(const p of catalog.packs){
  assert.ok(MODULES.some(x=>x.id===p.id&&x.status==="live"));
  assert.equal(unlockedPack(createSave(77),catalog,p.id),p.id==="battle");
 }
});
test("future module features are declared but never labeled implemented",()=>{
 assert.ok(unimplementedModules().some(x=>x.id==="artifact"));
 assert.ok(unimplementedModules().some(x=>x.id==="sect"));
 assert.ok(unimplementedModules().some(x=>x.id==="ascension"));
 assert.ok(unimplementedModules().every(x=>x.status==="planned"));
});
test("pack unlock change is enforced in reducer, not just the UI",()=>{
 const locked=structuredClone(slice);
 locked.features.unlockAtGlobalCheckpoint.technique=17;
 const c=loadCatalog(world,locked),s=createSave(33);
 assert.equal(unlockedPack(s,c,"technique"),false);
 assert.throws(()=>dispatch(s,c,{seq:1,type:"DRAW",packId:"technique",count:1}),/尚未解锁/);
 const progressed=createSave(34);progressed.meta.bestCheckpoint=17;
 assert.equal(unlockedPack(progressed,c,"technique"),true);
});
test("unknown effect keys and unregistered packs are rejected before gameplay",()=>{
 const bad=structuredClone(slice);
 bad.packs[0].cards[0].effect="unknownMultiplicativeStat";
 assert.throws(()=>loadCatalog(world,bad),/未注册/);
 const missing=structuredClone(slice);
 delete missing.features.unlockAtGlobalCheckpoint.pet;
 assert.throws(()=>loadCatalog(world,missing),/未配置解锁里程碑/);
});
test("new optional rarity, idle and apex fields never invalidate pre-upgrade v8 saves",()=>{
 const old=createSave(55);
 delete old.meta.apex;delete old.meta.pityXian;delete old.meta.totalFateChests;
 delete old.run.idle;
 const c=loadCatalog(world,slice);
 // Starting activity extends state in the same schema; original permanent relics retained.
 old.meta.relics.R001=3;
 const next=dispatch(old,c,{seq:1,type:"START_IDLE",now:100000});
 assert.ok(next.state.run.idle.active);
 assert.equal(next.state.meta.relics.R001,3);
});
