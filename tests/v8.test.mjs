import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadCatalog,createSave,validateSave,dispatch,heroStats,yields,progress,breakthroughRequirements,fight,packCost,SAVE_KEY} from "../src/v8/engine.mjs";
import {readGame,writeGame,backupAndReset} from "../src/v8/storage.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(read("realms-maps.v0.8.proposal.json"),read("v8-slice.json"));
const execute=(s,type,params={})=>dispatch(s,c,{type,seq:s.seq+1,...params});
function grant(s,amount){s.run.stones+=amount;s.run.totalEarned+=amount;return s}
function advanceTo(s,mapIndex,checkpoint=0){
 s.run.mapIndex=mapIndex;s.run.checkpoint=checkpoint;
 return s;
}
test("world registry has 24 planned maps, 20 no-level stages and four playable maps",()=>{
 assert.equal(c.allMaps.length,24);assert.equal(c.maps.length,4);assert.equal(c.realms.length,20);
 assert.equal(c.packs.length,9);
 assert.equal(c.realms[0].name,"炼气·初期");
 assert.equal(c.realms[3].name,"炼气·圆满");
 assert.equal(c.realms[4].name,"筑基·初期");
 for(let i=1;i<20;i++)assert.ok(c.realms[i].nextQiCost>c.realms[i-1].nextQiCost);
 const s=createSave();assert.equal(s.run.hero,undefined);assert.equal(s.run.level,undefined);
 assert.equal(s.run.realmIndex,0);
});
test("first combat wins and farms same current monster without advancing",()=>{
 let s=createSave(10);
 const initial=progress(s,c);
 const r=execute(s,"BATTLE",{enemyType:"mob"});
 assert.equal(r.result.won,true);assert.equal(r.state.run.checkpoint,initial.stage-1);
 assert.equal(r.state.run.mapIndex,0);assert.ok(r.result.stones>0);assert.ok(r.result.qi>0);
 assert.equal(r.state.run.totalEarned+r.state.run.startingStones,r.state.run.stones+r.state.run.totalSpent);
});
test("guardian failure never rolls back current checkpoint or confiscates resources",()=>{
 const s=advanceTo(createSave(101),3,7),before=JSON.stringify(s);
 const r=execute(s,"BATTLE",{enemyType:"boss"});
 assert.equal(r.result.won,false);
 assert.equal(r.state.run.checkpoint,7);assert.equal(r.state.run.mapIndex,3);
 assert.equal(r.state.run.stones,s.run.stones);assert.equal(r.result.stones,0);
 assert.equal(JSON.stringify(s),before);
});
test("guardian clear opens only next checkpoint, final map Boss alone opens new map",()=>{
 let s=grant(createSave(2),10000);
 s.run.cards.B001=90;s.run.cards.B002=45;s.run.cards.B003=45;
 const g=execute(s,"BATTLE",{enemyType:"guardian"});
 assert.equal(g.result.won,true);assert.equal(g.state.run.checkpoint,1);assert.equal(g.state.run.mapIndex,0);
 s=advanceTo(g.state,0,7);
 assert.throws(()=>execute(s,"BATTLE",{enemyType:"guardian"}),/Boss/);
 const boss=execute(s,"BATTLE",{enemyType:"boss"});
 assert.equal(boss.result.won,true);assert.equal(boss.state.run.mapIndex,1);assert.equal(boss.state.run.checkpoint,0);
});
test("map advancement is exponential and packs cost more in later maps",()=>{
 const s=createSave();
 const p0=packCost(s,c,"battle"),hp0=fight(s,c,"mob").enemy.hp;
 const s2=advanceTo(createSave(),2,0);
 assert.ok(packCost(s2,c,"battle")>p0*3);
 assert.ok(fight(s2,c,"mob").enemy.hp>hp0*3);
});
test("first battle pack draw boosts hero automatically, cultivation always gains insight",()=>{
 const s=createSave(200);
 const base=heroStats(s,c);
 let r=execute(s,"DRAW",{packId:"battle",count:1});
 assert.equal(r.result.items[0].id,"B001");
 assert.ok(heroStats(r.state,c).attack>base.attack);
 r.state.meta.bestCheckpoint=6;
 r=execute(r.state,"DRAW",{packId:"cultivation",count:1});
 assert.ok(r.state.run.insight>=1);
 const unlocked=structuredClone(s);unlocked.meta.bestCheckpoint=10;
 assert.throws(()=>execute(unlocked,"DRAW",{packId:"elixir",count:10}),/灵石不足/);
});
test("small breakthroughs require previous map Boss as well as Qi and insight",()=>{
 let s=createSave(1);
 s.run.qi=1000000;s.run.insight=100;
 let needed=breakthroughRequirements(s,c);
 assert.equal(needed.needMapMilestone,true);assert.equal(needed.canBreak,false);
 assert.throws(()=>execute(s,"BREAKTHROUGH"),/地图Boss/);
 s.run.mapIndex=1;
 const result=execute(s,"BREAKTHROUGH");
 assert.equal(result.state.run.realmIndex,1);
 assert.equal(result.state.run.qi,1000000-breakthroughRequirements(s,c).qi);
});
test("major breakthrough after fourth map requires qi, insight and a gacha-sourced pill",()=>{
 const s=createSave();s.run.mapIndex=3;s.run.checkpoint=7;s.run.bossCleared=true;
 s.run.realmIndex=3;s.run.qi=3000000;s.run.insight=20;
 assert.throws(()=>execute(s,"BREAKTHROUGH"),/筑基丹/);
 s.run.pills.D004=1;
 const r=execute(s,"BREAKTHROUGH");
 assert.equal(r.state.run.realmIndex,4);assert.equal(r.state.run.pills.D004,0);
 assert.ok(heroStats(r.state,c).attack>heroStats(s,c).attack);
});
test("elixir key pill guaranteed by eighth elixir draw",()=>{
 for(const seed of [1,2,3,11,42,200,32123]){
  let s=grant(createSave(seed),2000),items=[];
  s.meta.bestCheckpoint=10;
  for(let i=0;i<8;i++){const r=execute(s,"DRAW",{packId:"elixir",count:1});s=r.state;items.push(r.result.items[0].id)}
  assert.ok(items.includes("D004"),"pill missing seed "+seed);
 }
});
test("ten singles and one ten pull match on rng, costs and reward inventory",()=>{
 let a=grant(createSave(21),10000),b=structuredClone(a);
 const ten=execute(a,"DRAW",{packId:"battle",count:10});a=ten.state;
 const ids=[];
 for(let i=0;i<10;i++){const next=execute(b,"DRAW",{packId:"battle",count:1});b=next.state;ids.push(next.result.items[0].id)}
 assert.deepEqual(ten.result.items.map(x=>x.id),ids);
 assert.equal(a.seed,b.seed);
 assert.deepEqual(a.run.cards,b.run.cards);
 assert.equal(a.run.stones,b.run.stones);
});
test("technique and pet must be drawn before equip, then genuinely modify combat",()=>{
 let s=grant(createSave(33),1000);
 assert.throws(()=>execute(s,"EQUIP_TECH",{id:"T001"}),/未拥有/);
 assert.throws(()=>execute(s,"EQUIP_PET",{id:"P001"}),/未拥有/);
 const before=fight(s,c,"guardian");
 s.run.cards.T001=2;s.run.cards.P001=2;
 s=execute(s,"EQUIP_TECH",{id:"T001"}).state;
 s=execute(s,"EQUIP_PET",{id:"P001"}).state;
 const after=fight(s,c,"guardian");
 assert.ok(after.heroDealt>before.heroDealt||after.petDealt>0);
 assert.ok(after.petDealt>0);
});
test("cave yields truly increase monster stone and qi rewards",()=>{
 const s=createSave(44);
 const baseline=yields(s,c);
 s.run.cards.H001=2;s.run.cards.H002=2;
 assert.ok(yields(s,c).stonePct>baseline.stonePct);
 assert.ok(yields(s,c).qiPct>baseline.qiPct);
 const r=execute(s,"BATTLE",{enemyType:"mob"});
 assert.ok(r.result.stones>19);assert.ok(r.result.qi>12);
});
test("post-boss same-stage mobs remain farmable to finance final breakthrough pills",()=>{
 const s=advanceTo(createSave(1),3,7);s.run.bossCleared=true;
 assert.throws(()=>execute(s,"BATTLE",{enemyType:"boss"}),/已通关/);
 const farm=execute(s,"BATTLE",{enemyType:"mob"});
 assert.equal(farm.state.run.bossCleared,true);
 assert.equal(farm.state.run.mapIndex,3);
});
test("reincarnation is voluntary and persistent relic chest uses independent low odds",()=>{
 let s=createSave(21);
 assert.throws(()=>execute(s,"REINCARNATE"),/第四张地图/);
 s.run.mapIndex=3;s.run.checkpoint=7;s.run.bossCleared=true;
 s.run.cards.B001=3;
 let r=execute(s,"REINCARNATE");s=r.state;
 assert.ok(s.meta.fate>=40);assert.equal(s.meta.reincarnations,1);
 assert.equal(s.run.mapIndex,0);assert.equal(s.run.cards.B001,undefined);
 r=execute(s,"OPEN_RELIC");s=r.state;
 assert.ok(s.meta.relics[r.result.relic.id]>0);
 const before=heroStats(s,c);
 assert.ok(before.attack>=29&&before.hp>=260);
 assert.equal(c.fate.ultraChance,0.000001);
 assert.equal(c.fate.apexChance,0.00001);
});
test("invalid save cannot overwrite game; old namespaces remain untouched",()=>{
 const data=new Map([["gacha-ascension-m0-v3","old-v07"],["gacha-ascension-mvp-v1","old-v01"]]);
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
 const s=createSave(7);writeGame(s,c,storage);
 assert.deepEqual(readGame(c,storage).state,s);
 backupAndReset(c,storage);
 assert.equal(data.get("gacha-ascension-m0-v3"),"old-v07");
 assert.equal(data.get("gacha-ascension-mvp-v1"),"old-v01");
 assert.notEqual(SAVE_KEY,"gacha-ascension-m0-v3");
 let invalid=structuredClone(s);invalid.run.stones+=50;
 assert.throws(()=>validateSave(invalid,c),/流水账/);
});
