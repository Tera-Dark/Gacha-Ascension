import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadM0Catalog,STAGE_LIMIT,M0_SAVE_KEY,opponentStats} from "../src/m0/catalog.mjs";
import {createM0Save,getHeroStats,effects,levelCap,validateM0Save,levelFromXp} from "../src/m0/state.mjs";
import {fight,damage,nextRandom} from "../src/m0/combat.mjs";
import {executeM0,battlePreview} from "../src/m0/engine.mjs";
import {loadM0Save,saveM0Save,resetM0Save,BACKUP_KEY} from "../src/m0/storage.mjs";
const json=(file)=>JSON.parse(readFileSync(new URL("../data/"+file,import.meta.url),"utf8"));
const c=loadM0Catalog(json("codex/codex.v0.5.json"),json("m0-packs.v0.6.json"));
function exec(s,type,more={}){return executeM0(s,{type,txnId:"tx:"+(s.txSequence+1),...more},c);}
function grant(s,{stones=10000,depth=0}={}){
 s.run.stones=stones;s.run.exploration.highestCleared=depth;s.meta.bestDepth=Math.max(s.meta.bestDepth,depth);
 return s;
}
function runTo(s,depth){
 for(let i=0;i<depth;i++){
  if(s.run.exploration.mode!=="push")s=exec(s,"SET_MODE",{mode:"push"}).state;
  const r=exec(s,"BATTLE");assert.equal(r.result.won,true,"Failed at stage "+r.result.floor);
  s=r.state;
 }return s;
}
test("content: 30 real stages and 4 packs with 24 unique cards",()=>{
 assert.equal(c.stages.length,STAGE_LIMIT);assert.equal(Object.keys(c.packs).length,4);
 assert.equal(Object.keys(c.cards).length,24);assert.equal(c.packs.battle.unlockedAt,0);
 assert.equal(c.packs.elixir.unlockedAt,16);assert.equal(c.ascension.requiredCleared,20);
 assert.throws(()=>loadM0Catalog(json("codex/codex.v0.5.json"),{version:"0.4"}),/Invalid/);
});
test("first power pack pull is guaranteed and immediately changes attack without manual training",()=>{
 let s=createM0Save();const original=getHeroStats(s,c);
 const result=exec(s,"DRAW",{packId:"battle",count:1});
 assert.equal(result.result.items[0].id,"B-01");assert.equal(result.state.run.stones,0);
 assert.equal(getHeroStats(result.state,c).attack,original.attack+16);
 assert.equal(result.state.run.gacha.cards["B-01"],1);
 assert.throws(()=>exec(s,"TRAIN_HERO",{stat:"attack"}),/无效指令/);
 assert.equal(s.run.stones,65);
});
test("a low rarity duplicate stacks instead of becoming trash",()=>{
 let s=grant(createM0Save(),{stones:1000});
 const r=exec(s,"DRAW",{packId:"battle",count:1});s=r.state;
 s.run.gacha.cards["B-01"]=4;
 assert.equal(getHeroStats(s,c).attack,42+4*16);
});
test("battle awards resources, progresses stage, and never pays a repeat first clear",()=>{
 let s=createM0Save(44);
 const first=exec(s,"BATTLE");assert.ok(first.result.won);assert.equal(first.result.firstClear,true);
 assert.equal(first.state.run.exploration.highestCleared,1);
 s=exec(first.state,"SET_MODE",{mode:"farm"}).state;
 const again=exec(s,"BATTLE");
 assert.equal(again.result.firstClear,false);
 assert.equal(again.result.stones,c.stages[0].stones);
 assert.equal(again.state.run.exploration.highestCleared,1);
});
test("progressive pack locks: wealth at 5, cultivation at 10, elixir at 16",()=>{
 let s=createM0Save();
 for(const id of ["wealth","cultivation","elixir"])
  assert.throws(()=>exec(s,"DRAW",{packId:id,count:1}),/尚未解锁/);
 s=runTo(s,5);
 assert.ok(s.run.exploration.highestCleared===5);
 assert.equal(exec(s,"DRAW",{packId:"wealth",count:1}).result.packId,"wealth");
 assert.throws(()=>exec(s,"DRAW",{packId:"cultivation",count:1}),/尚未解锁/);
 const f=grant(createM0Save(123),{depth:10,stones:3000});
 assert.equal(exec(f,"DRAW",{packId:"cultivation",count:1}).result.packId,"cultivation");
 const e=grant(createM0Save(123),{depth:16,stones:3000});
 assert.equal(exec(e,"DRAW",{packId:"elixir",count:1}).result.packId,"elixir");
});
test("wealth cards increase battle earnings (not attack) and cultivation cards grow level cap",()=>{
 const s=grant(createM0Save(),{stones:1500,depth:10});
 const stats=getHeroStats(s,c);
 s.run.gacha.cards["W-01"]=2;
 assert.equal(getHeroStats(s,c).attack,stats.attack);
 assert.equal(effects(s,c).stoneGainPct,36);
 const base=levelCap(s,c);
 s.run.gacha.cards["C-01"]=2;
 assert.equal(levelCap(s,c),base+8);
 assert.equal(effects(s,c).xpGainPct,44);
 s.run.hero.level=10;
 s.run.cultivationXp=2000;
 const ups=levelFromXp(s,c);
 assert.ok(ups>0);assert.equal(s.run.hero.level,Math.min(18,s.run.hero.level));
});
test("battle snapshot stays deterministic, RNG seeded, no state side effects",()=>{
 const s=createM0Save(999),snapshot={hero:getHeroStats(s,c),enemy:opponentStats(c.stages[0])};
 const first=fight(snapshot,s.seed),second=fight(snapshot,s.seed);
 assert.deepEqual(first,second);assert.equal(s.seed,999);
 assert.ok(first.won);assert.ok(damage(1,999)>=1);assert.ok(nextRandom(42).value<1);
});
test("10 singles and 1 ten-pull use same odds, seed, pity, collection and cost",()=>{
 let x=grant(createM0Save(42),{stones:10000,depth:16}),y=structuredClone(x);
 const out=exec(x,"DRAW",{packId:"elixir",count:10});
 x=out.state;
 const ids=[];
 for(let i=0;i<10;i++){const a=exec(y,"DRAW",{packId:"elixir",count:1});ids.push(a.result.items[0].id);y=a.state;}
 assert.deepEqual(out.result.items.map(a=>a.id),ids);
 assert.equal(x.run.stones,y.run.stones);
 assert.deepEqual(x.run.gacha,y.run.gacha);
 assert.deepEqual(x.run.hero,y.run.hero);
 assert.equal(x.seed,y.seed);
});
test("the needed 筑基丹 is guaranteed by the 8th elixir draw",()=>{
 for(const seed of [1,2,3,42,777,13433,2026]){
  const s=grant(createM0Save(seed),{stones:10000,depth:16});
  const r=exec(s,"DRAW",{packId:"elixir",count:10});
  assert.ok(r.result.items.slice(0,8).some(i=>i.id==="P-04"),"Unlucky seed "+seed);
  assert.ok(r.state.run.gacha.pills["P-04"]>0);
 }
});
test("realm lock requires stage20, Lv12 and special pill, consumes pill on breakthrough",()=>{
 let s=grant(createM0Save(10),{stones:10000,depth:19});
 s.run.hero.level=12;s.run.gacha.cards["C-01"]=1;s.run.gacha.pills["P-04"]=1;
 assert.throws(()=>exec(s,"BREAKTHROUGH"),/第20层/);
 s.run.exploration.highestCleared=20;s.meta.bestDepth=20;
 s.run.exploration.mode="farm";s.run.exploration.farmFloor=20;s.run.exploration.farmReason="gate";
 assert.throws(()=>exec(s,"SET_MODE",{mode:"push"}),/境界锁/);
 const before=getHeroStats(s,c);
 const asc=exec(s,"BREAKTHROUGH");
 assert.equal(asc.state.run.hero.realm,"zhuji");assert.equal(asc.state.run.gacha.pills["P-04"],0);
 assert.equal(asc.state.run.exploration.mode,"push");
 assert.ok(getHeroStats(asc.state,c).attack>before.attack);
 assert.equal(asc.result.realm,"zhuji");
 assert.throws(()=>exec(asc.state,"BREAKTHROUGH"),/已完成/);
});
test("an insufficient level or missing pill prevents ascension without consuming any resources",()=>{
 const s=grant(createM0Save(),{depth:20,stones:10000});
 const current=JSON.stringify(s);
 assert.throws(()=>exec(s,"BREAKTHROUGH"),/等级不足/);
 assert.equal(JSON.stringify(s),current);
 s.run.hero.level=12;s.run.gacha.cards["C-01"]=1;
 assert.throws(()=>exec(s,"BREAKTHROUGH"),/缺少筑基丹/);
});
test("after a defeat, exploration falls back one floor and remains farmable",()=>{
 const s=grant(createM0Save(1337),{depth:29,stones:0});
 const r=exec(s,"BATTLE");
 assert.equal(r.result.floor,30);assert.equal(r.result.won,false);assert.equal(r.result.stones,0);
 assert.equal(r.state.run.exploration.mode,"farm");assert.equal(r.state.run.exploration.farmFloor,29);
 assert.equal(r.state.run.exploration.farmReason,"defeat");
});
test("card-powered recovery automatically retries the next floor when viable",()=>{
 const s=grant(createM0Save(4),{depth:1,stones:1000});
 s.run.exploration.mode="farm";s.run.exploration.farmFloor=1;s.run.exploration.farmReason="defeat";
 const r=exec(s,"DRAW",{packId:"battle",count:1});
 assert.equal(r.state.run.exploration.mode,"push");assert.ok(r.events.some(e=>e.type==="AutoRetry"));
});
test("the core loop is strictly gacha-first; invalid pack draw does not deduct stones",()=>{
 const s=createM0Save(1);const snapshot=JSON.stringify(s);
 assert.throws(()=>exec(s,"DRAW",{packId:"nonexistent",count:1}),/尚未解锁/);
 assert.throws(()=>exec(s,"DRAW",{packId:"battle",count:10}),/灵石不足/);
 assert.equal(JSON.stringify(s),snapshot);
});
test("expired transaction ids never refund/re-award after receipts are pruned",()=>{
 let s=createM0Save();
 for(let i=0;i<130;i++)s=exec(s,"SET_MODE",{mode:"paused"}).state;
 assert.equal(s.txSequence,130);assert.equal(s.receiptOrder.length,96);
 assert.throws(()=>executeM0(s,{type:"SET_MODE",mode:"push",txnId:"tx:1"},c),/过期/);
 const latest=executeM0(s,{type:"SET_MODE",mode:"paused",txnId:"tx:130"},c);
 assert.equal(latest.duplicate,true);
});
test("a saved game reloads; old v0.1/M0-v1 namespaces remain untouched",()=>{
 const m=new Map([["gacha-ascension-mvp-v1","old v0.1"],["gacha-ascension-m0-v1","old M0"]]);
 const storage={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v))};
 const current=createM0Save(9);saveM0Save(current,storage);
 assert.deepEqual(loadM0Save(storage).state,current);
 resetM0Save(storage,333);
 assert.equal(m.get("gacha-ascension-mvp-v1"),"old v0.1");
 assert.equal(m.get("gacha-ascension-m0-v1"),"old M0");
 assert.ok(m.get(BACKUP_KEY)?.includes('"seed":9'));
 m.set(M0_SAVE_KEY,"invalid-json");
 assert.equal(loadM0Save(storage).status,"invalid");
});
test("unknown schema, negative economy, illegal realm flags and malformed receipts rejected",()=>{
 const mutators=[s=>s.schemaVersion=99,s=>s.run.stones=-1,s=>s.run.exploration.ascended=true,
 s=>s.run.gacha.cards["B-01"]=-3,s=>s.run.exploration.highestCleared=21];
 for(const mutate of mutators){const s=createM0Save();mutate(s);assert.throws(()=>validateM0Save(s));}
});
test("stage battle is not playable while paused",()=>{
 const s=createM0Save();const r=exec(s,"SET_MODE",{mode:"paused"});
 assert.throws(()=>exec(r.state,"BATTLE"),/暂停/);
 assert.ok(battlePreview(r.state,c).hero.attack>0);
});
