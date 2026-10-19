import {M0_SCHEMA,M0_SAVE_KEY,HERO_BASE,experienceNeeded} from "./catalog.mjs";
const dict=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const nat=x=>Number.isSafeInteger(x)&&x>=0;
export function createM0Save(seed=123456789){
 if(!Number.isSafeInteger(seed)||seed<1||seed>0xffffffff)throw Error("Invalid seed");
 return {schemaVersion:M0_SCHEMA,dataVersion:"0.6-M0",seed,txSequence:0,
  meta:{bestDepth:0,accountFirstClear:{},featureUnlocks:{exploration:true,battle:true}},
  run:{stones:65,cultivationXp:0,earnedXp:0,
    hero:{level:1,realm:"qi",pillStats:{attack:0,hp:0,defense:0},pillAllPct:0},
    gacha:{cards:{},packDraws:{battle:0,wealth:0,cultivation:0,elixir:0},pills:{},sinceKeyPill:0},
    exploration:{highestCleared:0,mode:"push",farmFloor:0,farmReason:null,
      currentRunFirstClear:{},battleCount:0,winCount:0,lossCount:0,ascended:false}},
  receipts:{},receiptOrder:[],settings:{autoBattle:false}};
}
export function effects(save,catalog){
 const totals={attackFlat:0,hpFlat:0,defenseFlat:0,attackPct:0,hpPct:0,defensePct:0,allBaseStatsPct:0,
  stoneGainPct:0,xpGainPct:0,speedPct:0,cultivatePowerPct:0,capBoost:0};
 for(const [id,n] of Object.entries(save.run.gacha.cards)){
   const c=catalog.cards[id];if(!c||!nat(n))throw Error("Corrupt card collection: "+id);
   if(c.effect in totals)totals[c.effect]+=c.value*n;
   if(c.capPerCopy)totals.capBoost+=c.capPerCopy*n;
 }
 return totals;
}
export function levelCap(save,catalog){return Math.min(250,catalog.levelCapInitial+effects(save,catalog).capBoost);}
export function getHeroStats(save,catalog){
 const e=effects(save,catalog),h=save.run.hero,p=h.pillStats;
 const cultivated=(1+Math.min(3,e.cultivatePowerPct/100));
 const all=1+Math.min(6,(e.allBaseStatsPct+h.pillAllPct)/100);
 const realm=h.realm==="zhuji"?catalog.ascension:null;
 const assemble=(base,flat,pct,percent)=>Math.max(1,Math.floor((base+flat)*all*(1+Math.min(8,pct/100))*cultivated*(realm?1+percent/100:1)));
 return {attack:assemble(HERO_BASE.attack+(h.level-1)*5+p.attack,e.attackFlat,e.attackPct,realm?.attackPct||0),
  hp:assemble(HERO_BASE.hp+(h.level-1)*24+p.hp,e.hpFlat,e.hpPct,realm?.hpPct||0),
  defense:assemble(HERO_BASE.defense+(h.level-1)*2+p.defense,e.defenseFlat,e.defensePct,realm?.defensePct||0)};
}
export function levelFromXp(save,catalog){
 let ups=0;
 while(save.run.hero.level<levelCap(save,catalog)&&save.run.cultivationXp>=experienceNeeded(save.run.hero.level)){
  save.run.cultivationXp-=experienceNeeded(save.run.hero.level);
  save.run.hero.level++;ups++;
 }
 // At a cap, retain enough accumulated XP for later breakthroughs without unbounded growth.
 if(save.run.hero.level===levelCap(save,catalog))save.run.cultivationXp=Math.min(500000,save.run.cultivationXp);
 return ups;
}
export function validateM0Save(s){
 if(!dict(s)||s.schemaVersion!==M0_SCHEMA||s.dataVersion!=="0.6-M0")throw Error("Incompatible v0.6-M0 save");
 if(!nat(s.seed)||!s.seed||s.seed>0xffffffff||!nat(s.txSequence))throw Error("Invalid seed/transaction");
 if(!dict(s.meta)||!dict(s.run)||!dict(s.receipts)||!Array.isArray(s.receiptOrder)||!dict(s.settings))throw Error("Invalid save root");
 const r=s.run,e=r.exploration,h=r.hero,g=r.gacha;
 if(!r||!e||!h||!g||!dict(s.meta.accountFirstClear)||!dict(s.meta.featureUnlocks))throw Error("Missing state domain");
 if(!nat(r.stones)||!nat(r.cultivationXp)||!nat(r.earnedXp)||!nat(h.level)||h.level<1||h.level>250||
   !["qi","zhuji"].includes(h.realm)||!dict(h.pillStats)||!nat(h.pillAllPct)||!dict(g.cards)||!dict(g.pills)||!dict(g.packDraws)||!nat(g.sinceKeyPill))throw Error("Invalid resources/hero");
 for(const key of ["attack","hp","defense"])if(!nat(h.pillStats[key]))throw Error("Invalid pill buffs");
 for(const v of Object.values(g.cards))if(!nat(v)||v>1000)throw Error("Invalid card level");
 for(const v of Object.values(g.pills))if(!nat(v))throw Error("Invalid pill inventory");
 for(const k of ["battle","wealth","cultivation","elixir"])if(!nat(g.packDraws[k]))throw Error("Invalid pack counter");
 if(!nat(e.highestCleared)||e.highestCleared>30||!["push","farm","paused"].includes(e.mode)||
    !nat(e.farmFloor)||e.farmFloor>e.highestCleared||!["defeat","gate",null].includes(e.farmReason)||
    !nat(e.battleCount)||!nat(e.winCount)||!nat(e.lossCount)||e.winCount+e.lossCount!==e.battleCount||
    typeof e.ascended!=="boolean"||!dict(e.currentRunFirstClear))throw Error("Invalid stage/exploration");
 if(e.ascended!==(h.realm==="zhuji"))throw Error("Realm desynchronized");
 if(e.highestCleared>20&&!e.ascended)throw Error("Invalid unlocked realm gate");
 if(!nat(s.meta.bestDepth)||s.meta.bestDepth<e.highestCleared)throw Error("Invalid best depth");
 if(s.receiptOrder.length>96||s.receiptOrder.length!==Object.keys(s.receipts).length||
    s.receiptOrder.some(id=>!Object.hasOwn(s.receipts,id)))throw Error("Invalid receipts");
 return s;
}
export function cloneM0Save(s){return structuredClone(validateM0Save(s));}
export {M0_SAVE_KEY};
