/** Independent 法器 loadout: one new slot at each major realm from 筑基 onward. */
export const ARTIFACT_SLOTS=Object.freeze([
 {id:"foundation",realmIndex:4,name:"筑基法器"},
 {id:"goldenCore",realmIndex:8,name:"金丹法器"},
 {id:"nascentSoul",realmIndex:12,name:"元婴法器"},
 {id:"spirit",realmIndex:16,name:"化神法器"}
]);
export const ARTIFACT_EFFECTS=Object.freeze({
 strike:"增加主人攻击",ward:"增强主人防御",curse:"降低敌人攻击",blessing:"提高自己出手速度"
});
export function validateArtifacts(cards){
 const pool=cards.filter(x=>x.effect==="artifact");
 if(pool.length<4)throw Error("法器卡池缺少四类效果");
 for(const card of pool)
  if(!ARTIFACT_EFFECTS[card.artifactKind]||!Number.isFinite(card.artifactValue)||card.artifactValue<=0||card.artifactValue>50)
   throw Error("非法法器效果 "+card.id);
 return true;
}
export function artifactsOwned(s){return s.run.artifacts||{}}
export function verifyArtifacts(s,c){
 const used={};
 for(const [slot,id] of Object.entries(artifactsOwned(s))){
  const def=ARTIFACT_SLOTS.find(x=>x.id===slot);
  if(!def||!id||s.run.realmIndex<def.realmIndex||c.cards[id]?.effect!=="artifact")throw Error("法器槽位记录异常");
  used[id]=(used[id]||0)+1;
 }
 for(const [id,count] of Object.entries(used))if(count>(s.run.cards[id]||0))throw Error("法器重复穿戴超过持有数量");
}
export function equipArtifact(s,c,slot,id){
 const def=ARTIFACT_SLOTS.find(x=>x.id===slot);
 if(!def)throw Error("未知法器槽");
 if(s.run.realmIndex<def.realmIndex)throw Error("此法器槽需达到"+def.name+"境界方可开启");
 if(id!==null&&c.cards[id]?.effect!=="artifact")throw Error("此物不是法器");
 const equipped=s.run.artifacts||(s.run.artifacts={}),previous=equipped[slot]||null;
 if(id===previous)return {kind:"artifact",slot,id,unchanged:true};
 if(id!==null){
  const used=Object.values(equipped).filter(v=>v===id).length;
  if(used>=(s.run.cards[id]||0))throw Error("法器库存不足");
 }
 if(id===null)delete equipped[slot];else equipped[slot]=id;
 verifyArtifacts(s,c);
 return {kind:"artifact",slot,id,previous};
}
export function artifactBonuses(s,c){
 const out={strike:0,ward:0,curse:0,blessing:0};
 for(const id of Object.values(artifactsOwned(s))){
  const card=c.cards[id];
  if(card?.effect==="artifact")out[card.artifactKind]+=card.artifactValue;
 }
 return {strike:Math.min(out.strike,150),ward:Math.min(out.ward,100),
  curse:Math.min(out.curse,50),blessing:Math.min(out.blessing,40)};
}
