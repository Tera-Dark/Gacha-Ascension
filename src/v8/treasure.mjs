/** Fixed-pool monster boxes & player consumables. No chest can award top-tier gacha equipment. */
export const AUTO_POTION_COST=25;
export const HERBS=Object.freeze([
 {id:"H001",name:"回春草",desc:"三份可炼回春丹",potion:"MED001"},
 {id:"H002",name:"护脉叶",desc:"三份可炼护体散",potion:"MED002"},
 {id:"H003",name:"剑意花",desc:"三份可炼剑意散",potion:"MED003"}
]);
export const ITEMS=Object.freeze([
 {id:"MED001",name:"回春丹",desc:"濒危时恢复35%气血",healPct:35},
 {id:"MED002",name:"护体散",desc:"下一场战斗防御提高15%",defensePct:15},
 {id:"MED003",name:"剑意散",desc:"下一场战斗攻击提高15%",attackPct:15}
]);
export const BOXES=Object.freeze([
 {id:"gear",name:"装备箱",desc:"随机获得一件黄／玄阶基础装备"},
 {id:"herb",name:"药草箱",desc:"随机获得一种药草2–5份"}
]);
export function inventory(s){
 const r=s.run;
 if(!r.boxes)r.boxes={gear:0,herb:0};
 if(!r.herbs)r.herbs={};
 if(!r.consumables)r.consumables={};
 if(!r.prepared)r.prepared={};
 return r;
}
export function validateInventory(s){
 const r=s.run;
 for(const obj of [r.boxes,r.herbs,r.consumables,r.prepared]){
  if(obj===undefined)continue;
  if(!obj||Object.values(obj).some(x=>!Number.isSafeInteger(x)||x<0))throw Error("背包数量损坏");
 }
 if(r.boxes&&Object.keys(r.boxes).some(x=>!BOXES.some(b=>b.id===x)))throw Error("未知宝箱");
 if(r.herbs&&Object.keys(r.herbs).some(x=>!HERBS.some(b=>b.id===x)))throw Error("未知草药");
 if(r.consumables&&Object.keys(r.consumables).some(x=>!ITEMS.some(b=>b.id===x)))throw Error("未知消耗品");
 if(r.prepared&&Object.keys(r.prepared).some(x=>!ITEMS.some(b=>b.id===x)))throw Error("未知备战消耗品");
 if(s.meta.autoPotion){
  const a=s.meta.autoPotion;
  if(typeof a.unlocked!=="boolean"||typeof a.enabled!=="boolean"||!Number.isFinite(a.threshold)||a.threshold<.1||a.threshold>.8)
   throw Error("自动吃药配置异常");
 }
}
export function rollBoxDrop(s,c,kind,roll){
 const chances=c.dropRates[kind];if(!chances)throw Error("未知掉落来源");
 const r=inventory(s),drops=[];
 // Independent small probabilities; all values are public and auditable.
 for(const type of ["gear","herb"]){
  if(roll()<chances[type]){r.boxes[type]=(r.boxes[type]||0)+1;drops.push({type,id:type,name:type==="gear"?"装备箱":"药草箱",count:1})}
 }
 return drops;
}
export function openBox(s,c,id,roll){
 const r=inventory(s),b=BOXES.find(x=>x.id===id);
 if(!b)throw Error("未知宝箱");
 if(!(r.boxes[id]>0))throw Error("没有可以开启的"+b.name);
 r.boxes[id]--;
 if(id==="gear"){
  const possible=c.packById.equipment.cards.filter(x=>["huang","xuan"].includes(x.rarity));
  const card=possible[Math.floor(roll()*possible.length)];
  r.cards[card.id]=(r.cards[card.id]||0)+1;
  return {kind:"boxOpen",box:id,reward:{id:card.id,name:card.name,count:1,type:"equipment"},
   note:"基础装备箱仅可获得黄/玄阶装备，珍稀法器及高阶装备仍需要抽卡"};
 }
 const herb=HERBS[Math.floor(roll()*HERBS.length)],count=2+Math.floor(roll()*4);
 r.herbs[herb.id]=(r.herbs[herb.id]||0)+count;
 return {kind:"boxOpen",box:id,reward:{id:herb.id,name:herb.name,count,type:"herb"}};
}
export function prepareItem(s,id){
 const r=inventory(s),item=ITEMS.find(x=>x.id===id);
 if(!item)throw Error("未知丹药");
 if(!(r.consumables[id]>0))throw Error("丹药不足");
 if((r.prepared[id]||0)>=3)throw Error("一次最多预备3份同类丹药");
 r.consumables[id]--;
 r.prepared[id]=(r.prepared[id]||0)+1;
 return {kind:"item",id,prepared:r.prepared[id]};
}
export function unlockAutoPotion(s){
 const meta=s.meta;
 if(meta.autoPotion?.unlocked)throw Error("回春自律已解锁");
 if(meta.fate<AUTO_POTION_COST)throw Error("因果不足，需要"+AUTO_POTION_COST+"点");
 meta.fate-=AUTO_POTION_COST;
 meta.autoPotion={unlocked:true,enabled:false,threshold:.35};
 return {kind:"autoPotionUnlock",spent:AUTO_POTION_COST};
}
export function setAutoPotion(s,enabled,threshold){
 const a=s.meta.autoPotion;
 if(!a?.unlocked)throw Error("先以因果解锁自动服药");
 if(typeof enabled!=="boolean"||!Number.isFinite(threshold)||threshold<.1||threshold>.8)
  throw Error("自动服药阈值限于10%至80%");
 a.enabled=enabled;a.threshold=threshold;
 return {kind:"autoPotion",enabled,threshold};
}
