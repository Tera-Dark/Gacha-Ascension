#!/usr/bin/env node
/** Canonical v0.5 DESIGN catalog generator. Usage: node scripts/sync-codex-v0.5.mjs --check|--write */
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const file = path => new URL(path, root);
const read = path => readFileSync(file(path), "utf8");
const data = JSON.parse(read("data/codex/codex.v0.5.json"));
const cn = {huang:"黄",xuan:"玄",di:"地",tian:"天",xian:"仙",hongmeng:"鸿蒙"};
const enc = v => '"' + String(v == null ? "" : Array.isArray(v) ? v.join("|") : v).replaceAll('"','""') + '"';
const toCSV = (rows,keys) => keys.join(",") + "\n" + rows.map(r=>keys.map(k=>enc(r[k])).join(",")).join("\n") + "\n";
const entries = [
 ...data.relics.map(r=>({id:r.id,kind:r.isUltra?"鸿蒙异宝":"天命遗物",name:r.name,system:r.system,rarity:cn[r.rarity],effectKey:r.effectKey,value:r.valuePerStack,unit:r.unit,cap:r.maxStacks,unlock:r.unlock,source:r.isUltra?"独立0.01%追加池":"天命遗物箱常规池",phase:"P0",state:"proposal",detail:r.description})),
 ...data.prototypes.map(r=>({id:r.id,kind:"功能卡牌",name:r.name,system:r.system,rarity:cn[r.rarity],effectKey:"待结构化",value:"",unit:"",cap:"待定",unlock:"分段解锁",source:r.system+"包",phase:r.phase,state:r.state,detail:r.effectSummary})),
 ...data.enemies.map(r=>({id:r.id,kind:"敌人模板",name:r.name,system:"探索",rarity:"-",effectKey:"atk/hp/def倍率",value:String(r.attackMultiplier)+"/"+r.healthMultiplier+"/"+r.defenseMultiplier,unit:"倍率",cap:"-",unlock:"对应关卡",source:"关卡定义",phase:"P0",state:r.state,detail:r.trait})),
 ...data.stages.map(r=>({id:r.id,kind:"关卡样例",name:"青云普通·"+r.floor+"层",system:"关卡",rarity:"-",effectKey:"attack/hp/def",value:String(r.baseAttack)+"/"+r.baseHp+"/"+r.baseDefense,unit:"基础数值",cap:"-",unlock:"前一层",source:r.enemyId,phase:"P0",state:r.state,detail:"灵石"+r.stones+"、修为"+r.cultivationXp})),
 ...data.realms.map(r=>({id:r.id,kind:"境界",name:r.name,system:"修士",rarity:"-",effectKey:"levelLimit",value:r.levelEnd,unit:"等级",cap:"-",unlock:r.gateBoss,source:"修士成长",phase:r.phase,state:"proposal",detail:"下一境界："+r.breakthroughTo})),
 ...data.packs.map(r=>({id:r.id,kind:"卡包",name:r.name,system:r.system,rarity:"混合",effectKey:"",value:"",unit:"",cap:"",unlock:r.phase,source:r.currency,phase:r.phase,state:"proposal",detail:r.asset})),
 ...data.unlocks.map(r=>({id:r.id,kind:"解锁里程碑",name:r.name,system:"关卡解锁",rarity:"-",effectKey:r.featureId,value:r.mainlineDepth,unit:"主线深度",cap:1,unlock:r.progressSource,source:"账号首次解锁事件",phase:r.phase,state:r.state,detail:r.rewardPolicy==="one_free_run_pack_draw"?"解锁并赠送"+r.freeDrawPackId+"卡包一次免费抽取":r.progressSource==="first_reincarnation_completed"?"首次轮回后开放":"满足前置条件解锁"})),
 ...data.zones.map(r=>({id:r.id,kind:"地图境域",name:r.name,system:"关卡",rarity:"-",effectKey:"mainlineRange",value:String(r.mainlineStart)+"-"+r.mainlineEnd,unit:"主线深度",cap:"-",unlock:r.phase,source:"区域注册",phase:r.phase,state:r.state,detail:r.description}))
];
const output=[
 ["data/codex/relics.v0.5.csv",toCSV(data.relics,["id","name","rarity","system","group","effectKey","valuePerStack","unit","maxStacks","maxRawValue","unlock","appliesTo","description","state","isUltra","unique"])],
 ["data/codex/catalog.v0.5.csv",toCSV(entries,["id","kind","name","system","rarity","effectKey","value","unit","cap","unlock","source","phase","state","detail"])],
 ["data/codex/unlocks.v0.5.csv",toCSV(data.unlocks,["id","mainlineDepth","featureId","name","rewardPolicy","phase","state","progressSource","prerequisiteFeatureIds","freeDrawPackId","displayHint"])],
 ["data/codex/stages.v0.5.csv",toCSV(data.stages,["id","zoneId","difficultyId","mainlineIndex","zone","difficulty","floor","enemyId","enemyName","class","baseAttack","baseHp","baseDefense","stones","cultivationXp","state"])],
 ["data/codex/zones.v0.5.csv",toCSV(data.zones,["id","name","zoneKey","chapter","mainlineStart","mainlineEnd","phase","state","normalAvailableInSlice","dangerPhase","description"])]
];
let bad=0, mode=process.argv.includes("--write")?"write":"check";
for(const [path,expected] of output){
 if(mode==="write"){writeFileSync(file(path),expected);process.stdout.write("wrote "+path+"\n");continue;}
 let actual;try{actual=read(path);}catch{actual=null;}
 if(actual!==expected){process.stderr.write("DRIFT: "+path+"\n");bad++;}
}
if(bad)process.exit(1);
process.stdout.write("Codex v0.5 synchronized: "+entries.length+" entries; "+output.length+" generated CSVs.\n");
