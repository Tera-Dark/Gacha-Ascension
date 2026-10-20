/** Fate acquisition rules. All balancing and rarity data live in data/v8-slice.json.
 * Unlike a limited relic pool, uncapped baseline relics never exit the draw pool.
 * Extremely rare pools are ADDITIONAL independent rewards, not replacements.
 */
const ORDER=["huang","xuan","di","tian","xian"];
const isAvailable=(s,r)=>r.max==null||(s.meta.relics[r.id]||0)<r.max;
export const chanceFromDenominator=denom=>1/denom;
export function rareRolls(apexRoll,hongmengRoll){
 return {apex:apexRoll<chanceFromDenominator(100000),
  hongmeng:hongmengRoll<chanceFromDenominator(1000000)};
}
export function baseCandidates(s,c){return c.relics.filter(r=>isAvailable(s,r))}
export function baseRates(s,c){
 const active=baseCandidates(s,c), present=new Set(active.map(x=>x.rarity));
 const total=ORDER.reduce((n,t)=>n+(present.has(t)?c.fate.rarities[t]||0:0),0);
 if(!(total>0))throw Error("常规遗物池已经没有任何可获得遗物；检查无上限基础遗物");
 return ORDER.filter(t=>present.has(t)).map(t=>({
  tier:t,weight:c.fate.rarities[t],chance:c.fate.rarities[t]/total,
  remaining:active.filter(x=>x.rarity===t).length
 }));
}
function pickWeighted(random,weights){
 const total=weights.reduce((n,x)=>n+x.weight,0);
 if(!(total>0))throw Error("常规遗物权重为零");
 let r=random()*total;
 for(const w of weights){r-=w.weight;if(r<0)return w.tier}
 return weights.at(-1).tier;
}
export function pullFate(s,c,random){
 if(s.meta.fate<c.fate.price)throw Error("因果不足，先轮回积累");
 if(!(c.fate.ultraChance===1/1000000&&c.fate.apexChance===1/100000))throw Error("极稀有概率配置异常");
 const rates=baseRates(s,c),all=baseCandidates(s,c),meta=s.meta;
 const tierNames=rates.map(x=>x.tier);
 const haveXian=tierNames.includes("xian");
 const haveTian=tierNames.includes("tian");
 const pityHigh=Number.isSafeInteger(meta.pity)?meta.pity:0;
 const pityXian=Number.isSafeInteger(meta.pityXian)?meta.pityXian:0;
 let allowed=rates;
 let pityTriggered=null;
 if(pityXian>=c.fate.pityXianAt-1&&haveXian){
  allowed=rates.filter(x=>x.tier==="xian");pityTriggered="xian";
 }else if(pityHigh>=c.fate.pityAt-1&&(haveXian||haveTian)){
  allowed=rates.filter(x=>x.tier==="tian"||x.tier==="xian");pityTriggered="tian";
 }
 const tier=pickWeighted(random,allowed);
 const candidates=all.filter(x=>x.rarity===tier);
 if(!candidates.length)throw Error("遗物候选列表为空");
 const chosen=candidates[Math.floor(random()*candidates.length)];
 // All random decisions and state mutations are in one atomic command.
 meta.fate-=c.fate.price;
 meta.relics[chosen.id]=(meta.relics[chosen.id]||0)+1;
 meta.pity=(tier==="tian"||tier==="xian")?0:pityHigh+1;
 meta.pityXian=tier==="xian"?0:pityXian+1;
 // Roll both independent gates even when the other succeeds.
 const special=rareRolls(random(),random());
 const award=(hit,pool,bucket)=>{
  if(!hit)return null;
  const choices=pool.filter(x=>!bucket[x.id]);
  if(!choices.length)return null; // All unique specials owned.
  const selected=choices[Math.floor(random()*choices.length)];
  bucket[selected.id]=true;
  return selected;
 };
 const apex=award(special.apex,c.apex,meta.apex||(meta.apex={}));
 const ultra=award(special.hongmeng,c.ultras,meta.ultras);
 meta.totalFateChests=(meta.totalFateChests||0)+1;
 return {kind:"relic",relic:chosen,stacks:meta.relics[chosen.id],
  rarity:tier,pityTriggered,apex,ultra,independentRolls:true,
  remainsUncapped:all.some(x=>x.max==null)};
}
export function permanentEffect(s,c,key){
 let n=0;
 for(const r of c.relics)if(r.stat===key)n+=(s.meta.relics[r.id]||0)*r.value;
 return n;
}
export function permanentFlat(s,c,key){
 return permanentEffect(s,c,key);
}
export function ownedApex(s,id){return !!s.meta.apex?.[id]}
export function ownedHongmeng(s,id){return !!s.meta.ultras?.[id]}
