/** Gacha-first M0.1 vertical-slice content. All combat growth is obtained from draws. */
export const M0_SCHEMA=2;
export const M0_SAVE_KEY="gacha-ascension-m0-v2";
export const M0_ZONE="ZN-001";
export const STAGE_LIMIT=30;
export const TUNING=Object.freeze({enemyAttack:.40,enemyHp:.25,enemyDefense:.70,turnLimit:80});
export const HERO_BASE=Object.freeze({attack:42,hp:245,defense:15});
export const RARITIES=Object.freeze({huang:"黄阶",xuan:"玄阶",di:"地阶",tian:"天阶"});
export const PACK_ORDER=Object.freeze(["battle","wealth","cultivation","elixir"]);
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
export function loadM0Catalog(source,packsSource){
  if(source?.schemaVersion!=="0.5"||packsSource?.version!=="0.6-prototype")throw Error("Invalid game catalog version");
  const zone=source.zones.find(z=>z.id===M0_ZONE&&z.normalAvailableInSlice);
  const stages=source.stages.filter(s=>s.zoneId===M0_ZONE&&s.difficultyId==="normal").sort((a,b)=>a.floor-b.floor);
  const enemyIds=new Set(source.enemies.map(e=>e.id));
  if(!zone||stages.length!==STAGE_LIMIT||stages.some((s,i)=>s.floor!==i+1||s.mainlineIndex!==i+1||!enemyIds.has(s.enemyId)))throw Error("Invalid M0 stages");
  for(const s of stages)for(const f of ["baseAttack","baseHp","baseDefense","stones","cultivationXp"])if(!nonnegative(s[f])||!s[f])throw Error("Bad stage "+s.id+" field "+f);
  const packs=packsSource.packs;
  if(packs.length!==4||PACK_ORDER.some(id=>!packs.some(p=>p.id===id)))throw Error("Expected four progressively unlocked packs");
  const seen=new Set();
  for(const p of packs){
    if(!nonnegative(p.unlockedAt)||!(p.cost>0)||!p.cards.length)throw Error("Invalid pack "+p.id);
    for(const card of p.cards){
      if(seen.has(card.id)||!RARITIES[card.rarity]||!(card.value>0))throw Error("Invalid card "+card.id);
      seen.add(card.id);
    }
    if(p.pityTarget&&!p.cards.some(c=>c.id===p.pityTarget))throw Error("Pill guarantee target missing");
  }
  if(Object.values(packsSource.rarityWeights).reduce((a,b)=>a+b,0)!==100)throw Error("Rarity weights must add up to 100");
  const cards=Object.fromEntries(packs.flatMap(p=>p.cards.map(c=>[c.id,Object.freeze({...c,packId:p.id})])));
  return Object.freeze({version:"0.6-M0",zone,stages,byId:Object.fromEntries(stages.map(s=>[s.id,s])),
    packs:Object.fromEntries(packs.map(p=>[p.id,p])),cards,weights:packsSource.rarityWeights,
    levelCapInitial:packsSource.levelCapInitial,ascension:packsSource.ascension});
}
export function stageAt(catalog,floor){return catalog.stages[Math.max(0,Math.min(29,floor-1))];}
export function opponentStats(stage){return {attack:Math.max(1,Math.round(stage.baseAttack*TUNING.enemyAttack)),
  hp:Math.max(1,Math.round(stage.baseHp*TUNING.enemyHp)),
  defense:Math.max(0,Math.round(stage.baseDefense*TUNING.enemyDefense))};}
export function experienceNeeded(level){return 28+level*15+Math.floor(level**2*1.8);}
export function packUnlocked(save,pack){return save.run.exploration.highestCleared>=pack.unlockedAt;}
