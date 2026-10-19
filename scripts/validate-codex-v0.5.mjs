#!/usr/bin/env node
/**
 * Structural validator for the active v0.5 DESIGN registry.
 * Run: node scripts/sync-codex-v0.5.mjs --check && node scripts/validate-codex-v0.5.mjs
 */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const read = p => readFileSync(new URL("../"+p,import.meta.url),"utf8");
const d = JSON.parse(read("data/codex/codex.v0.5.json"));
const err=[];
const ok=(condition,message)=>{if(!condition)err.push(message)};
function csv(text){
 const lines=text.trimEnd().split(/\r?\n/),out=[];
 for(const line of lines){
  let fields=[],val="",inside=false;
  for(let i=0;i<line.length;i++){
   let c=line[i];
   if(c==='"'){if(inside&&line[i+1]==='"'){val+='"';i++}else inside=!inside}
   else if(c===","&&!inside){fields.push(val);val=""}
   else val+=c;
  }
  ok(!inside,"Unbalanced CSV quote");fields.push(val);out.push(fields);
 }
 const [header,...body]=out;
 return body.map((cells,i)=>{ok(cells.length===header.length,"CSV column mismatch row "+(i+2));return Object.fromEntries(header.map((k,j)=>[k,cells[j]]))});
}
const sections=["relics","packs","prototypes","enemies","stages","realms","unlocks","zones"];
const entries=sections.flatMap(k=>d[k]||[]);
ok(d.schemaVersion==="0.5","schemaVersion");
ok(entries.every(x=>x.id&&(x.name||(x.floor>0&&x.enemyId))),"Missing entity labels");
ok(new Set(entries.map(x=>x.id)).size===entries.length,"Duplicate stable IDs");
ok(d.relics.length===34,"30 ordinary and 4 ultra relics");
const ordinary=d.relics.filter(x=>!x.isUltra),ultra=d.relics.filter(x=>x.isUltra);
ok(ordinary.length===30 && ultra.length===4,"Relic partition");
ok(ultra.every(x=>x.rarity==="hongmeng"&&x.maxStacks===1&&x.unique===true),"Ultra uniqueness");
const keys=new Set(["attackFlat","hpFlat","defenseFlat","stoneGainPct","cultivationGainPct","petExpGainPct","attackPct","hpPct","defensePct","caveYieldPct","petDamagePct","techniqueEffectPct","armorPenPct","damageReductionPct","bossDamagePct","breakthroughBonusPct","trainingCostReductionPct","runPackExpGainPct","petFirstTurnShieldPct","allBaseStatsPct","allResourceGainPct","ultraHeroDamageMultiplier","ultraPetDamageMultiplier","ultraCaveYieldBonusMultiplier","ultraTechniqueEffectMultiplier"]);
for(const r of d.relics){
 ok(keys.has(r.effectKey),r.id+" unknown effect key");
 ok(Number.isFinite(r.valuePerStack)&&r.valuePerStack>0&&Number.isInteger(r.maxStacks)&&r.maxStacks>0,r.id+" invalid growth");
 ok(Math.abs(r.valuePerStack*r.maxStacks-r.maxRawValue)<1e-7,r.id+" cap mismatch");
}
const f=d.fateChest;
ok(f.cost===40,"Fate chest cost diverged");
ok(f.tierWeightsPct.length===5 && f.tierWeightsPct.reduce((a,b)=>a+b,0)===100,"Five tier chance sum 100");
ok(f.ultraJackpot.chancePerChest===0.0001 && f.ultraJackpot.pity===false,"Ultra rate / no pity");
ok(f.ultraJackpot.rewardInAdditionToOrdinary===true,"Ultra must not replace ordinary draw");
ok(new Set(f.ultraJackpot.poolIds).size===4&&f.ultraJackpot.poolIds.every(id=>ultra.some(r=>r.id===id)),"Ultra pool references");
ok(f.allCappedRule.includes("ordinary_to_resonance")&&!f.allCappedRule.includes("disable_open;"),"All capped rule must allow resonance");
ok(f.ordinaryOverflow.whenAllOrdinaryCapped===true&&f.ordinaryOverflow.ultraRollContinues===true,"Overflow and jackpot");
ok(f.ordinaryOverflow.disableChestIfResonanceMaxedAndAllUltraOwned===true,"Fully exhausted chest must close");
ok(f.ordinaryOverflow.drawsPerLevel>0&&f.ordinaryOverflow.maxLevel>0,"Resonance cap valid");
ok(d.zones.length===5,"Zone roadmap registry");
const zones=[...d.zones].sort((a,b)=>a.mainlineStart-b.mainlineStart);
for(let i=0;i<zones.length;i++){
 const z=zones[i];
 ok(z.mainlineStart<=z.mainlineEnd,z.id+" invalid range");
 if(i>0)ok(z.mainlineStart===zones[i-1].mainlineEnd+1,z.id+" gap or overlap");
}
const zonesById=new Map(d.zones.map(z=>[z.id,z]));
const enemiesById=new Set(d.enemies.map(x=>x.id));
const stageKeys=new Set(),mainline=new Set();
for(const st of d.stages){
 const zone=zonesById.get(st.zoneId);
 ok(!!zone,st.id+" unknown zone");
 ok(enemiesById.has(st.enemyId),st.id+" unknown enemy");
 const key=st.zoneId+":"+st.difficultyId+":"+st.floor;
 ok(!stageKeys.has(key),st.id+" duplicated stage key");stageKeys.add(key);
 if(st.difficultyId==="normal"){
  ok(!mainline.has(st.mainlineIndex),st.id+" duplicate global depth");mainline.add(st.mainlineIndex);
  if(zone)ok(st.mainlineIndex===zone.mainlineStart+st.floor-1,st.id+" incorrect global depth");
 }
 ok(st.baseAttack>0&&st.baseHp>0&&st.baseDefense>0&&st.stones>0&&st.cultivationXp>0,st.id+" invalid stats");
}
ok(d.prototypes.every(x=>x.rarity!=="hongmeng"),"Ultra cannot enter run packs");
const allowedSources=new Set(["account_created","first_mainline_clear","first_reincarnation_completed","first_realm_breakthrough"]);
const ids=new Map(d.unlocks.map(u=>[u.featureId,u]));
ok(d.unlocks.length===18&&ids.size===18,"Unlock IDs / duplicate feature IDs");
ok(d.unlocks[0].mainlineDepth===0&&d.unlocks[0].progressSource==="account_created","Bootstrapping exploration at account creation");
for(let i=0;i<d.unlocks.length;i++){
 const u=d.unlocks[i];ok(allowedSources.has(u.progressSource),u.id+" invalid unlock event");
 if(i>0)ok(d.unlocks[i-1].mainlineDepth<=u.mainlineDepth,"Unlock depth ordering");
 for(const p of u.prerequisiteFeatureIds||[])ok(ids.has(p)&&p!==u.featureId,u.id+" invalid prerequisite "+p);
 if(u.rewardPolicy==="one_free_run_pack_draw")ok(d.packs.some(p=>p.id===u.freeDrawPackId&&p.id!=="PK-006"),u.id+" invalid free pack id");
 else ok(!u.freeDrawPackId,u.id+" stale free pack id");
}
const visiting=new Set(),visited=new Set();
function walk(feature){
 if(visited.has(feature))return;
 if(visiting.has(feature)){ok(false,"Cyclic unlock graph at "+feature);return}
 visiting.add(feature);
 for(const p of ids.get(feature)?.prerequisiteFeatureIds||[])walk(p);
 visiting.delete(feature);visited.add(feature);
}
for(const u of d.unlocks)walk(u.featureId);
ok(d.packs.find(p=>p.id==="PK-006").phase==="P0","Relic chest MVP phase mismatch");
const sheets=[["relics","data/codex/relics.v0.5.csv"],["unlocks","data/codex/unlocks.v0.5.csv"],["stages","data/codex/stages.v0.5.csv"],["zones","data/codex/zones.v0.5.csv"],["prototypes","data/codex/prototypes.v0.4.csv"],["enemies","data/codex/enemies.v0.4.csv"]];
for(const [type,path] of sheets){
 const rows=csv(read(path)),src=new Map(d[type].map(x=>[x.id,x]));
 ok(rows.length===d[type].length,path+" row length");
 for(const row of rows){
  let entry=src.get(row.id);ok(!!entry,path+" missing "+row.id);if(!entry)continue;
  for(const [field,val] of Object.entries(row)){
   if(field in entry){const expect=String(Array.isArray(entry[field])?entry[field].join("|"):entry[field]);ok(expect===val,path+" mismatch "+row.id+"."+field);}
  }
 }
}
const master=csv(read("data/codex/catalog.v0.5.csv"));
ok(master.length===entries.length,"Catalog master length");
const catalogIds=new Set(master.map(x=>x.id));
ok(catalogIds.size===entries.length,"Master IDs unique");
for(const x of entries)ok(catalogIds.has(x.id),"Master missing "+x.id);
if(err.length){process.stderr.write("v0.5 VALIDATION FAILED:\n"+err.map(s=>"- "+s).join("\n")+"\n");process.exit(1);}
assert.equal(d.relics.reduce((sum,r)=>sum+r.maxStacks,0),502);
process.stdout.write("v0.5 audit PASSED: "+entries.length+" entries, 18 unlocks, 5 zones, 34 relics, 502 total levels.\n");
