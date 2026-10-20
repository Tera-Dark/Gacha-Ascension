import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,dispatch,fight,combatSnapshot} from "../src/v8/engine.mjs";
import {ARTIFACT_SLOTS,artifactBonuses} from "../src/v8/artifacts.mjs";
import {rollBoxDrop,openBox,brew,prepareItem,HERBS,ITEMS,AUTO_POTION_COST} from "../src/v8/treasure.mjs";
import {simulateEncounter} from "../src/v8/combat-depth.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const step=(s,type,args={})=>dispatch(s,c,{seq:s.seq+1,type,...args});
test("artifact slots unlock each major realm, with only 筑基 reachable today",()=>{
 assert.deepEqual(ARTIFACT_SLOTS.map(s=>s.realmIndex),[4,8,12,16]);
 let s=createSave(712);s.run.cards.F001=1;
 assert.throws(()=>step(s,"EQUIP_ARTIFACT",{slot:"foundation",id:"F001"}),/境界/);
 s.run.realmIndex=4;s.meta.bestCheckpoint=32;
 const eq=step(s,"EQUIP_ARTIFACT",{slot:"foundation",id:"F001"});
 assert.equal(eq.state.run.artifacts.foundation,"F001");
 assert.equal(artifactBonuses(eq.state,c).strike,18);
 assert.throws(()=>step(eq.state,"EQUIP_ARTIFACT",{slot:"goldenCore",id:"F001"}),/境界/);
 assert.ok(combatSnapshot(eq.state,c,"mob").hero.attack>combatSnapshot(s,c,"mob").hero.attack);
});
test("artifact gacha unlocks at 筑基, not merely by many checkpoints",()=>{
 let s=createSave(170);
 s.meta.bestCheckpoint=32;s.run.stones=1000;s.run.totalEarned=890;
 assert.throws(()=>step(s,"DRAW",{packId:"artifact",count:1}),/尚未解锁/);
 s.run.realmIndex=4;
 const r=step(s,"DRAW",{packId:"artifact",count:1});
 assert.equal(r.result.packId,"artifact");
 assert.equal(r.result.items[0].effect,"artifact");
 assert.equal(Object.keys(r.state.run.artifacts).length,1);
});
test("published independent chest odds can be replaced with 100% for deterministic exact-pool test",()=>{
 const s=createSave(90),local={...c,dropRates:{mob:{gear:1,herb:1}}};
 const found=rollBoxDrop(s,local,"mob",()=>0);
 assert.deepEqual(found.map(x=>x.id),["gear","herb"]);
 assert.equal(s.run.boxes.gear,1);assert.equal(s.run.boxes.herb,1);
 const eq=openBox(s,c,"gear",()=>0);
 assert.equal(eq.reward.type,"equipment");
 assert.ok(["huang","xuan"].includes(c.cards[eq.reward.id].rarity));
 const herb=openBox(s,c,"herb",()=>.99);
 assert.equal(herb.reward.type,"herb");
 assert.ok(herb.reward.count>=2&&herb.reward.count<=5);
 assert.ok(HERBS.some(h=>h.id===herb.reward.id));
 assert.equal(s.run.boxes.gear,0);
 assert.equal(s.run.boxes.herb,0);
});
test("three herbs craft one combat item, preparation is queued and limited",()=>{
 let s=createSave(99);s.run.herbs={H001:7};
 let result=step(s,"BREW",{id:"H001",count:2});s=result.state;
 assert.equal(s.run.herbs.H001,1);
 assert.equal(s.run.consumables.P001,2);
 s=step(s,"PREPARE_ITEM",{id:"P001"}).state;
 assert.equal(s.run.prepared.P001,1);
 assert.equal(s.run.consumables.P001,1);
 assert.throws(()=>step(s,"BREW",{id:"H001",count:1}),/不足/);
});
test("auto potion is not free or automatic: requires paid fate unlock and manual toggle",()=>{
 let s=createSave(11);s.meta.fate=AUTO_POTION_COST-1;
 assert.throws(()=>step(s,"UNLOCK_AUTO_POTION"),/不足/);
 s.meta.fate=AUTO_POTION_COST;
 s=step(s,"UNLOCK_AUTO_POTION").state;
 assert.equal(s.meta.fate,0);
 assert.equal(s.meta.autoPotion.unlocked,true);
 assert.equal(s.meta.autoPotion.enabled,false);
 assert.throws(()=>step(s,"SET_AUTO_POTION",{enabled:true,threshold:.95}),/阈值/);
 s=step(s,"SET_AUTO_POTION",{enabled:true,threshold:.5}).state;
 assert.equal(s.meta.autoPotion.threshold,.5);
 assert.equal(s.meta.autoPotion.enabled,true);
});
test("real multi-hit logs preserve all timestamped events and emergency healing",()=>{
 const s=createSave(991),base=combatSnapshot(s,c,"guardian");
 const snap={...base,hero:{...base.hero,hp:600,attack:12,defense:8},
  enemy:{...base.enemy,attack:68,hp:680},
  waves:base.waves.map(w=>({...w,attack:68,hp:680})),
  healing:{auto:true,available:3,prepared:1,threshold:.8}};
 const battle=simulateEncounter(snap,444);
 assert.ok(battle.logs.length>15);
 assert.ok(battle.logs.every((x,i)=>i===0||x.timeMs>=battle.logs[i-1].timeMs));
 assert.ok(battle.logs.filter(x=>["hero","enemy"].includes(x.actor)).length>=6);
 assert.ok(battle.logs.some(x=>x.actor==="potion"));
 assert.ok(battle.usedAuto+battle.usedPrepared>0);
});
test("losses have independent 50% seeded chance of destroying one equipped copy, not whole stash",()=>{
 let lost=0,defeats=0;
 for(let seed=1;seed<=160;seed++){
  const s=createSave(seed);
  s.run.mapIndex=3;s.run.checkpoint=7;
  s.run.equipment={weapon1:"E001"};
  s.run.cards.E001=3;
  const res=step(s,"BATTLE",{enemyType:"boss"});
  if(res.result.won)continue;
  defeats++;
  if(res.result.lostGear){
   lost++;
   assert.equal(res.state.run.cards.E001,2);
   assert.equal(res.state.run.equipment.weapon1,undefined);
  }else{
   assert.equal(res.state.run.cards.E001,3);
   assert.equal(res.state.run.equipment.weapon1,"E001");
  }
 }
 assert.ok(defeats>=140,"chosen enemy should defeat most weak heroes");
 assert.ok(lost/defeats>.30&&lost/defeats<.70,"gear loss should approximate 50% over many seeds");
});
test("reincarnation clears all per-life treasures but keeps unlocked auto-heal",()=>{
 let s=createSave(51);
 s.meta.autoPotion={unlocked:true,enabled:true,threshold:.35};
 s.run.cards.F001=1;s.run.realmIndex=4;s.run.artifacts={foundation:"F001"};
 s.run.herbs={H001:9};s.run.boxes={gear:2,herb:4};
 s.run.consumables={P001:3};s.run.prepared={P003:1};
 s.run.mapIndex=3;s.run.checkpoint=7;s.run.bossCleared=true;
 const r=step(s,"REINCARNATE").state;
 assert.equal(r.meta.autoPotion.unlocked,true);
 assert.ok(!Object.keys(r.run.artifacts).length);
 assert.equal(r.run.boxes.gear,0);
 assert.equal(r.run.herbs.H001,undefined);
 assert.equal(r.run.consumables.P001,undefined);
});
