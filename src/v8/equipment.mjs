/** Lightweight real equipment: 10 independent slots, 8 types, <=2 deterministic affixes.
 * Equipment comes from the equipment gacha, never direct monster drops.
 * Copies matter for dual weapons and dual accessories. All gear is per-life.
 */
export const EQUIPMENT_SLOTS=Object.freeze([
 {id:"weapon1",type:"weapon",name:"主武器",icon:"⚔"},
 {id:"weapon2",type:"weapon",name:"副武器",icon:"⚔"},
 {id:"crown",type:"crown",name:"头冠",icon:"♕"},
 {id:"hat",type:"hat",name:"帽子",icon:"♧"},
 {id:"clothing",type:"clothing",name:"衣服",icon:"▣"},
 {id:"boots",type:"boots",name:"足履",icon:"♙"},
 {id:"accessory1",type:"accessory",name:"饰品一",icon:"◇"},
 {id:"accessory2",type:"accessory",name:"饰品二",icon:"◇"},
 {id:"amulet",type:"amulet",name:"护符",icon:"✧"},
 {id:"belt",type:"belt",name:"腰带",icon:"☷"}
]);
export const STAT_LABELS=Object.freeze({attack:"攻击",hp:"气血",defense:"防御",speedPct:"攻速"});
const KEYS=Object.keys(STAT_LABELS);
const safe=n=>Number.isSafeInteger(n)&&n>=0;
export function validateEquipmentCards(cards){
 const equipment=cards.filter(x=>x.effect==="equipment");
 const types=new Set(EQUIPMENT_SLOTS.map(x=>x.type));
 for(const card of equipment){
  if(!types.has(card.equipmentSlot))throw Error("非法装备部位 "+card.id);
  const attrs=Object.entries(card.stats||{});
  if(attrs.length<1||attrs.length>2||attrs.some(([key,val])=>!KEYS.includes(key)||!safe(val)||val===0))
   throw Error("装备只允许1-2条正向基础属性 "+card.id);
 }
 if(!equipment.length)throw Error("装备卡包为空");
 return true;
}
export function equippedMap(s){return s.run.equipment||{}}
export function verifyEquipment(s,c){
 const eq=equippedMap(s),held={};
 for(const [slot,id] of Object.entries(eq)){
  const info=EQUIPMENT_SLOTS.find(x=>x.id===slot);
  if(!info||!id||c.cards[id]?.effect!=="equipment"||c.cards[id].equipmentSlot!==info.type)
   throw Error("装备槽记录损坏");
  held[id]=(held[id]||0)+1;
 }
 for(const [id,n] of Object.entries(held))if(n>(s.run.cards[id]||0))throw Error("装备份数超过持有数量");
 return true;
}
export function equipItem(s,c,slot,id){
 const info=EQUIPMENT_SLOTS.find(x=>x.id===slot);
 if(!info)throw Error("未知装备槽位");
 if(id!==null&&(c.cards[id]?.effect!=="equipment"||c.cards[id].equipmentSlot!==info.type))
  throw Error("装备与槽位不匹配");
 const equipment=s.run.equipment||(s.run.equipment={});
 const original=equipment[slot]||null;
 if(id===original)return {kind:"equipment",slot,id,unchanged:true};
 if(id!==null){
  const occupied=Object.values(equipment).filter(x=>x===id).length;
  if((s.run.cards[id]||0)<=occupied)throw Error("没有多余的装备副本可以穿戴");
 }
 if(id===null)delete equipment[slot];else equipment[slot]=id;
 verifyEquipment(s,c);
 return {kind:"equipment",slot,id,previous:original};
}
export function equipmentStats(s,c){
 const result={attack:0,hp:0,defense:0,speedPct:0};
 for(const id of Object.values(equippedMap(s))){
  const card=c.cards[id];
  if(!card||card.effect!=="equipment")continue;
  for(const key of KEYS)result[key]+=card.stats[key]||0;
 }
 return result;
}
function addStats(c,id,out){
 const card=c.cards[id];
 if(card?.effect==="equipment")for(const key of KEYS)out[key]+=card.stats[key]||0;
 return out;
}
/** Stats if `slot` held `id`, without cloning the save (called for every candidate on render). */
function statsAfter(s,c,slot,id){
 const out={attack:0,hp:0,defense:0,speedPct:0};
 for(const [slotId,itemId] of Object.entries(equippedMap(s)))if(slotId!==slot&&itemId)addStats(c,itemId,out);
 if(id)addStats(c,id,out);
 return out;
}
export function comparison(s,c,slot,id){
 const info=EQUIPMENT_SLOTS.find(x=>x.id===slot);
 if(!info)throw Error("未知装备槽位");
 const equipped=equippedMap(s),previous=equipped[slot]||null;
 if(id!==null){
  const card=c.cards[id];
  if(card?.effect!=="equipment"||card.equipmentSlot!==info.type)throw Error("装备与槽位不匹配");
  if(id!==previous&&(s.run.cards[id]||0)<=Object.values(equipped).filter(x=>x===id).length)
   throw Error("没有多余的装备副本可以穿戴");
 }
 const baseline=equipmentStats(s,c),after=statsAfter(s,c,slot,id);
 return {previous,afterId:id,difference:Object.fromEntries(KEYS.map(k=>[k,after[k]-baseline[k]])),
   total:after};
}
