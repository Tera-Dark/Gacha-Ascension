import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSave,loadCatalog,heroStats,dispatch} from "../src/v8/engine.mjs";
import {detailModel,effectiveTierRates} from "../src/v8/details.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const c=loadCatalog(JSON.parse(read("data/realms-maps.v0.8.proposal.json")),JSON.parse(read("data/v8-slice.json")));
const page=read("preview-v0.8.html");
test("all nine game systems offer closed-by-default accessible native numeric detail panels",()=>{
 const keys=["explore","cultivate","gacha","technique","cave","pet","items","fate","atlas","settings"];
 for(const key of keys){
  const re=new RegExp('<details class="v8-disclosure" id="'+key+'">');
  assert.match(page,re,"missing collapsed stats panel "+key);
  assert.match(page,new RegExp('id="detail-'+key+'"'));
  assert.match(page,new RegExp('data-view-panel="'+key+'"'));
 }
 assert.match(page,/<details class="v8-disclosure v8-route-disclosure">/);
 assert.match(page,/<details class="v8-disclosure v8-future-map">/);
 assert.match(page,/<details class="v8-disclosure v8-relic-inventory">/);
 assert.match(page,/<div class="battle-workbench">/);
 assert.match(page,/<section class="wb-player wb-pane"/);
 assert.match(page,/<section class="wb-enemy wb-pane"/);
 assert.match(page,/id="equipmentGrid"/);
 assert.match(page,/id="landscapeNavToggle"/);
 assert.doesNotMatch(page,/<details[^>]*\sopen(?:\s|=|>)/);
});
test("compact mobile dock holds four primary destinations plus expandable accessible system sheet",()=>{
 const dock=page.match(/<nav class="mobile-tabs"[\s\S]*?<\/nav>/)?.[0];
 const sheet=page.match(/<div class="mobile-sheet"[\s\S]*?<\/div>\s*<\/div>/)?.[0];
 assert.ok(dock&&sheet);
 assert.equal((dock.match(/<button/g)||[]).length,5);
 assert.equal((sheet.match(/data-view="/g)||[]).length,10);
 assert.match(dock,/id="moreSystems"[^>]*aria-expanded="false"/);
 assert.match(page,/id="mobileSheetBackdrop" hidden/);
 assert.match(page,/id="mobileSheet"[^>]*hidden/);
});
test("tier probabilities equal 100% per pack after missing-rarity re-roll",()=>{
 for(const pack of c.packs){
  const rates=effectiveTierRates(pack,c.rarityWeights);
  const total=rates.reduce((a,x)=>a+x.rate,0);
  assert.ok(Math.abs(total-100)<1e-9,pack.name+" probability "+total);
  assert.ok(rates.every(x=>x.rate>0&&x.cards.length>0));
  for(const x of rates)assert.ok(pack.cards.some(y=>y.rarity===x.tier));
 }
});
test("numeric breakdowns are read-only and derive from actual card and realm state",()=>{
 const save=createSave(112233),copy=structuredClone(save);
 const detail=detailModel(save,c,null);
 assert.deepEqual(save,copy);
 assert.deepEqual(Object.keys(detail),["explore","cultivate","gacha","technique","cave","pet","items","fate","atlas","settings"]);
 assert.ok(detail.explore.some(section=>section.rows.some(x=>x.label==="攻击"&&x.value==="29")));
 assert.ok(detail.cultivate.some(section=>section.rows.some(x=>x.label==="现有修为 / 消耗"&&x.value==="0 / 20.00万")));
 assert.ok(detail.gacha.length>=8);
 const all=detail.fate.flatMap(x=>x.rows);
 assert.equal(all.find(x=>x.label==="鸿蒙异宝独立追加概率")?.value,"0.0001%");
});
test("card bonuses, cave yields, pet power and stored counters update with same detail selector",()=>{
 let s=createSave(24);
 s.run.cards.B001=3;
 s.run.cards.H001=2;
 s.run.cards.H002=1;
 s.run.cards.P001=2;s.run.pet="P001";
 s.run.insight=3;s.run.qi=120;
 const base=detailModel(createSave(24),c,null),now=detailModel(s,c,null);
 assert.ok(heroStats(s,c).attack>heroStats(createSave(24),c).attack);
 const caveStone=now.cave.flatMap(x=>x.rows).find(x=>x.label==="洞府灵石贡献");
 assert.equal(caveStone.value,"50%");
 const havePet=now.pet.flatMap(x=>x.rows).find(x=>x.label==="出战灵宠");
 assert.equal(havePet.value,"青狐");
 assert.ok(now.cultivate.flatMap(x=>x.rows).find(x=>x.label==="现有修为 / 消耗").value.startsWith("120"));
 assert.notDeepEqual(now.explore,base.explore);
});
test("unavailable world areas remain explicitly labeled planning-only and save metadata is preserved",()=>{
 const model=detailModel(createSave(1),c,null);
 const mapRows=model.atlas.flatMap(g=>g.rows);
 assert.ok(mapRows.some(row=>row.label==="计划总地图"&&row.value==="24张"));
 assert.ok(mapRows.some(row=>row.label==="目前实装"&&row.value==="4张"));
 assert.ok(model.settings.flatMap(g=>g.rows).some(row=>row.label==="灵石流水核对"&&row.value==="一致"));
 const boosted=dispatch(createSave(20),c,{type:"DRAW",packId:"battle",count:1,seq:1});
 assert.equal(boosted.state.seq,1);
 const detail=detailModel(boosted.state,c,null);
 assert.ok(detail.settings.flatMap(g=>g.rows).some(row=>row.label==="已完成交易序号"&&row.value==="1"));
});
