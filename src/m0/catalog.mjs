/** M0.2 canonical runtime definitions, backed by versioned JSON instead of UI literals. */
export const M0_SCHEMA=3;
export const M0_SAVE_KEY="gacha-ascension-m0-v3";
export const M0_ZONE="ZN-001",STAGE_LIMIT=30;
export const TUNING=Object.freeze({enemyAttack:.40,enemyHp:.25,enemyDefense:.70,turnLimit:80});
export const HERO_BASE=Object.freeze({attack:42,hp:245,defense:15});
export const RARITIES=Object.freeze({huang:"黄阶",xuan:"玄阶",di:"地阶",tian:"天阶"});
export const PACK_ORDER=Object.freeze(["battle","wealth","cultivation","elixir"]);
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
const finitePositive=n=>typeof n==="number"&&Number.isFinite(n)&&n>0;
export function loadM0Catalog(source,packsSource,encounters){
 if(source?.schemaVersion!=="0.5"||packsSource?.version!=="0.7-prototype"||encounters?.version!=="0.7")
   throw Error("M0.2 requires v0.5 stages and v0.7 pack/encounter configs");
 const zone=source.zones?.find(z=>z.id===M0_ZONE&&z.normalAvailableInSlice);
 const enemies=new Set(source.enemies.map(e=>e.id));
 const stages=source.stages.filter(s=>s.zoneId===M0_ZONE&&s.difficultyId==="normal").sort((a,b)=>a.floor-b.floor);
 if(!zone||stages.length!==STAGE_LIMIT||stages.some((s,i)=>s.floor!==i+1||s.mainlineIndex!==i+1||!enemies.has(s.enemyId)))throw Error("M0.2: invalid stage registry");
 for(const st of stages)for(const key of ["baseAttack","baseHp","baseDefense","stones","cultivationXp"])
   if(!nonnegative(st[key])||st[key]===0)throw Error("Bad stage "+st.id+" "+key);
 const sourceTraits=encounters.traitDefinitions;
 if(!sourceTraits||Object.keys(sourceTraits).length!==4)throw Error("Expected four configured combat traits");
 const seen=new Set(),packs=packsSource.packs,ids=new Set(packs.map(p=>p.id));
 if(packs.length!==4||PACK_ORDER.some(id=>!ids.has(id)))throw Error("Expected four pack definitions");
 for(const pack of packs){
   if(!nonnegative(pack.unlockedAt)||!finitePositive(pack.cost)||!pack.cards.length)throw Error("Malformed pack "+pack.id);
   for(const card of pack.cards){
     if(seen.has(card.id)||!RARITIES[card.rarity]||!finitePositive(card.value))throw Error("Invalid/duplicate card "+card.id);
     if(card.effect==="battleTrait"&&!sourceTraits[card.mechanicId])throw Error("Unknown mechanic "+card.mechanicId);
     seen.add(card.id);
   }
   if(pack.pityTarget&&!pack.cards.some(c=>c.id===pack.pityTarget))throw Error("Bad pity item");
 }
 if(Object.values(packsSource.rarityWeights).reduce((sum,x)=>sum+x,0)!==100)throw Error("Rarity rates do not sum 100");
 const specials={};
 for(const item of encounters.majorFloors){
   if(!nonnegative(item.floor)||item.floor<1||item.floor>30||specials[item.floor])throw Error("Duplicate/invalid special floor");
   for(const field of ["attackScale","hpScale","defenseScale","rewardScale"])if(!finitePositive(item[field]))throw Error("Invalid encounter multiplier");
   for(const traitId of item.traitIds)if(!encounters.enemyTraitDescriptions[traitId])throw Error("Unknown enemy trait "+traitId);
   specials[item.floor]=item;
 }
 for(const field of ["stoneScale","xpScale","firstClearBonus"])if(!finitePositive(encounters.global[field]))throw Error("Bad economic setting "+field);
 const cards=Object.fromEntries(packs.flatMap(pack=>pack.cards.map(card=>[card.id,{...card,packId:pack.id}])));
 return Object.freeze({version:"0.7-M0",zone,stages,byId:Object.fromEntries(stages.map(s=>[s.id,s])),
  packs:Object.fromEntries(packs.map(p=>[p.id,p])),cards,weights:packsSource.rarityWeights,
  encounters:specials,traitDefinitions:sourceTraits,enemyTraitDescriptions:encounters.enemyTraitDescriptions,
  economy:encounters.global,levelCapInitial:packsSource.levelCapInitial,ascension:packsSource.ascension});
}
export function stageAt(catalog,floor){
 if(!Number.isSafeInteger(floor)||floor<1||floor>STAGE_LIMIT)throw Error("Stage out of bounds");
 return catalog.stages[floor-1];
}
export function encounterAt(catalog,floor){return catalog.encounters[floor]||null;}
export function opponentStats(stage,catalog){
 const special=catalog?.encounters?.[stage.floor];
 const factor=catalog?.economy||{};
 return {
  attack:Math.max(1,Math.round(stage.baseAttack*TUNING.enemyAttack*(factor.enemyAttackScale||1)*(special?.attackScale||1))),
  hp:Math.max(1,Math.round(stage.baseHp*TUNING.enemyHp*(factor.enemyHealthScale||1)*(special?.hpScale||1))),
  defense:Math.max(0,Math.round(stage.baseDefense*TUNING.enemyDefense*(factor.enemyDefenseScale||1)*(special?.defenseScale||1))),
  maxHp:Math.max(1,Math.round(stage.baseHp*TUNING.enemyHp*(factor.enemyHealthScale||1)*(special?.hpScale||1))),
  traitIds:special?.traitIds||[]
 };
}
export function experienceNeeded(level){return 28+level*15+Math.floor(level**2*1.8);}
export function packUnlocked(save,pack){return save.run.exploration.highestCleared>=pack.unlockedAt;}
