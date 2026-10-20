import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {loadM0Catalog,opponentStats,STAGE_LIMIT,M0_SAVE_KEY} from "../src/m0/catalog.mjs";
import {createM0Save,validateM0Save,getHeroStats,levelCap} from "../src/m0/state.mjs";
import {damage,fight,nextRandom} from "../src/m0/combat.mjs";
import {executeM0,battlePreview,diagnose} from "../src/m0/engine.mjs";
import {loadM0Save,saveM0Save,resetM0Save,BACKUP_KEY} from "../src/m0/storage.mjs";
const read=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const catalog=loadM0Catalog(read("codex/codex.v0.5.json"),read("m0-packs.v0.7.json"),read("m0-encounters.v0.7.json"));
function call(save,type,details={}){return executeM0(save,{type,...details,txnId:"tx:"+(save.txSequence+1)},catalog);}
function supplied(seed=42,depth=0,stones=12000){
 const save=createM0Save(seed);
 save.run.stones=stones;save.run.exploration.history.totalStonesEarned=stones-65;
 save.run.exploration.highestCleared=depth;save.meta.bestDepth=depth;
 return save;
}
test("v0.7 catalog has 30 stages, 28 cards, four stances, six encounter overrides",()=>{
 assert.equal(catalog.stages.length,STAGE_LIMIT);
 assert.equal(Object.keys(catalog.cards).length,28);
 assert.equal(Object.keys(catalog.encounters).length,6);
 assert.equal(Object.keys(catalog.traitDefinitions).length,4);
 assert.equal(catalog.encounters[10].traitIds[0],"iron_shell");
 assert.throws(()=>loadM0Catalog(read("codex/codex.v0.5.json"),read("m0-packs.v0.7.json"),{version:"0.6"}));
 assert.throws(()=>loadM0Catalog(read("codex/codex.v0.5.json"),JSON.parse(readFileSync(new URL("./fixtures/m0-packs.v0.6.json",import.meta.url),"utf8")),read("m0-encounters.v0.7.json")));
});
test("fresh save has independent v3 key; battle first draw deterministically increases attack",()=>{
 const initial=createM0Save();
 assert.equal(initial.run.stones,65);
 assert.notEqual(M0_SAVE_KEY,"gacha-ascension-m0-v2");
 const first=call(initial,"DRAW",{packId:"battle",count:1});
 assert.equal(first.result.items[0].id,"B-01");
 assert.equal(getHeroStats(first.state,catalog).attack,getHeroStats(initial,catalog).attack+16);
 assert.equal(first.state.run.stones,0);
 assert.equal(first.state.run.exploration.history.totalStonesSpent,65);
 assert.throws(()=>call(initial,"TRAIN_HERO",{stat:"attack"}),/无效指令/);
});
test("enemy elites have combat-relevant multipliers and legal hints",()=>{
 const base=catalog.stages[9],elite=opponentStats(base,catalog),normal=opponentStats(base,null);
 assert.ok(elite.defense>normal.defense*2.9);
 assert.ok(elite.hp>normal.hp);
 assert.ok(catalog.encounters[30].hint);
 const source=JSON.stringify(catalog.encounters);
 assert.ok(source.includes("regeneration"));
});
test("battle is purely deterministic and different traits change mechanics",()=>{
 const hero={attack:110,hp:300,defense:30},enemy={attack:30,hp:700,defense:85,traitIds:[]};
 const b=fight({hero,enemy},765);
 assert.deepEqual(b,fight({hero,enemy},765));
 const c=fight({hero,enemy,mechanic:{id:"combo",stacks:2}},765);
 assert.ok(c.mechanicProcs>0);
 assert.ok(c.heroDamage>b.heroDamage);
 const pierce=fight({hero,enemy,mechanic:{id:"pierce",stacks:2}},765);
 assert.ok(pierce.heroDamage>=b.heroDamage);
 const ward=fight({hero,enemy,mechanic:{id:"ward",stacks:2}},765);
 assert.ok(ward.absorbed>0);assert.ok(ward.damageTaken<b.damageTaken);
 const counter=fight({hero,enemy,mechanic:{id:"counter",stacks:4}},765);
 assert.ok(counter.mechanicProcs>0);
 assert.ok(nextRandom(30).value<1);
 assert.equal(damage(20,100,0.6),Math.floor(20*100/140));
 assert.ok(b.log.length<=18);
});
test("first clear pays once, repeats never grant first clear bonus",()=>{
 let s=createM0Save(2);
 const a=call(s,"BATTLE");assert.equal(a.result.won,true);
 assert.equal(a.result.firstClear,true);
 s=call(a.state,"SET_MODE",{mode:"farm"}).state;
 const r=call(s,"BATTLE");
 assert.equal(r.result.firstClear,false);
 assert.ok(a.result.stones>r.result.stones);
 assert.equal(r.state.run.exploration.highestCleared,1);
 assert.equal(r.state.run.exploration.history.totalStonesEarned,a.result.stones+r.result.stones);
});
test("locked packs reject early purchases without spending",()=>{
 const s=supplied(1);
 for(const p of ["wealth","cultivation","elixir"])assert.throws(()=>call(s,"DRAW",{packId:p,count:1}),/尚未开放/);
 assert.equal(s.run.stones,12000);
});
test("combat trait auto-equips first one and only one can be manually equipped",()=>{
 let s=supplied(19);
 s.run.gacha.cards["B-09"]=2;s.run.gacha.cards["B-08"]=1;
 s=call(s,"EQUIP_TRAIT",{cardId:"B-09"}).state;
 assert.equal(s.run.gacha.equippedTrait,"B-09");
 const a=battlePreview(s,catalog);
 assert.ok(a.mechanic?.id==="ward");
 s=call(s,"EQUIP_TRAIT",{cardId:"B-08"}).state;
 assert.equal(battlePreview(s,catalog).mechanic.id,"pierce");
 assert.throws(()=>call(s,"EQUIP_TRAIT",{cardId:"B-10"}),/没有拥有/);
 assert.throws(()=>call(s,"EQUIP_TRAIT",{cardId:"B-01"}),/没有拥有/);
});
test("10 singles and ten-pull return identical sequences, economy and rng",()=>{
 let x=supplied(812,16),y=structuredClone(x);
 const multi=call(x,"DRAW",{packId:"elixir",count:10});
 x=multi.state;const ids=[];
 for(let i=0;i<10;i++){const o=call(y,"DRAW",{packId:"elixir",count:1});y=o.state;ids.push(o.result.items[0].id);}
 assert.deepEqual(multi.result.items.map(x=>x.id),ids);
 assert.equal(x.seed,y.seed);
 assert.deepEqual(x.run.gacha,y.run.gacha);
 assert.equal(x.run.stones,y.run.stones);
 assert.equal(x.run.exploration.history.totalStonesSpent,y.run.exploration.history.totalStonesSpent);
});
test("elixir pity guarantees breakthrough pill on or before draw eight",()=>{
 for(const seed of [1,2,42,300,2026]){
  const initial=supplied(seed,16),out=call(initial,"DRAW",{packId:"elixir",count:10});
  assert.ok(out.result.items.slice(0,8).some(x=>x.id==="P-04"));
  assert.ok(out.state.run.gacha.pills["P-04"]>0);
 }
});
test("realm gate rejects progression until Lv12 and consumed pill",()=>{
 let s=supplied(3,20);
 s.run.exploration.mode="farm";s.run.exploration.farmFloor=20;s.run.exploration.farmReason="gate";
 assert.throws(()=>call(s,"SET_MODE",{mode:"push"}),/境界锁/);
 assert.throws(()=>call(s,"BREAKTHROUGH"),/Lv.12/);
 s.run.hero.level=12;s.run.gacha.cards["C-01"]=1;
 assert.throws(()=>call(s,"BREAKTHROUGH"),/缺少筑基丹/);
 s.run.gacha.pills["P-04"]=1;
 const out=call(s,"BREAKTHROUGH");
 assert.equal(out.state.run.gacha.pills["P-04"],0);
 assert.equal(out.state.run.hero.realm,"zhuji");
 assert.equal(out.state.run.exploration.mode,"push");
});
test("failed elite retreats to last cleared floor and diagnostic points to accessible pack",()=>{
 const s=supplied(4,9);
 s.run.stones=65;s.run.exploration.history.totalStonesEarned=0;
 const p=diagnose(s,catalog);
 assert.equal(p.targetFloor,10);
 assert.equal(p.packId,"battle");
 const out=call(s,"BATTLE");
 if(!out.result.won){
  assert.equal(out.state.run.exploration.mode,"farm");
  assert.equal(out.state.run.exploration.farmFloor,9);
 }
});
test("farm target can only be changed to an already defeated stage",()=>{
 let s=supplied(5,4);
 assert.throws(()=>call(s,"SET_FARM_TARGET",{floor:5}),/只能扫荡/);
 s=call(s,"SET_FARM_TARGET",{floor:2}).state;
 assert.equal(s.run.exploration.farmFloor,2);
 const a=call(s,"BATTLE");
 assert.equal(a.result.floor,2);
});
test("same tx id is idempotent and pruned transaction replay forbidden",()=>{
 let s=createM0Save();
 const cmd={type:"DRAW",packId:"battle",count:1,txnId:"tx:1"};
 const first=executeM0(s,cmd,catalog);s=first.state;
 assert.equal(executeM0(s,cmd,catalog).duplicate,true);
 assert.throws(()=>executeM0(s,{...cmd,count:10},catalog),/相同交易号/);
 for(let i=0;i<100;i++)s=call(s,"SET_MODE",{mode:"paused"}).state;
 assert.equal(s.receiptOrder.length,96);
 assert.throws(()=>executeM0(s,cmd,catalog),/过期/);
});
test("new v3 storage never modifies M0, M0.1 or v0.1",()=>{
 const data=new Map([["gacha-ascension-mvp-v1","legacy"],["gacha-ascension-m0-v1","oldM0"],
  ["gacha-ascension-m0-v2","oldM01"]]);
 const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v))};
 const s=createM0Save(22);saveM0Save(s,store);
 assert.deepEqual(loadM0Save(store).state,s);
 resetM0Save(store,33);
 assert.ok(data.get(BACKUP_KEY));
 assert.equal(data.get("gacha-ascension-m0-v2"),"oldM01");
 assert.equal(data.get("gacha-ascension-mvp-v1"),"legacy");
});
test("save ledger and equipped trait validations prevent silent corrupted states",()=>{
 const s=createM0Save(),bad=structuredClone(s);
 bad.run.stones=-1;assert.throws(()=>validateM0Save(bad));
 const invalid=structuredClone(s);invalid.run.gacha.equippedTrait="B-07";
 assert.throws(()=>validateM0Save(invalid),/Equipped/);
 const ledger=structuredClone(s);ledger.run.stones+=1000;
 assert.throws(()=>validateM0Save(ledger),/Inconsistent/);
});
test("battle forecasts are deterministic and do not spend random seeds",()=>{
 const s=createM0Save(99),copy=structuredClone(s);
 const a=battlePreview(s,catalog),b=battlePreview(s,catalog);
 assert.deepEqual(a.predicted,b.predicted);
 assert.deepEqual(s,copy);
});

test("auto-retry never bypasses a pending realm gate after new card or equipment",()=>{
 let s=supplied(13,20);
 s.run.exploration.mode="farm";s.run.exploration.farmFloor=20;s.run.exploration.farmReason="defeat";
 s.run.gacha.cards["B-09"]=1;
 const r=call(s,"DRAW",{packId:"battle",count:1});
 assert.equal(r.state.run.exploration.mode,"farm");
 assert.throws(()=>call(r.state,"SET_MODE",{mode:"push"}),/境界锁/);
 const equipped=call(r.state,"EQUIP_TRAIT",{cardId:"B-09"});
 assert.equal(equipped.state.run.exploration.mode,"farm");
});
