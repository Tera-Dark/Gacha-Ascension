/** Card milestones, permanent knowledge and explicit inheritance. No UI state. */
export const CORE_EFFECTS=new Set(['technique','pet','cave']);
export const GROWTH_TEXT={
 T001:['剑意每三次出手释放','剑意附带压制回复','剑意释放提前至每两次'],
 T002:['入场护盾，格挡后反击','每三次出手补充护盾','反击附带破甲'],
 T003:['两次主攻触发灵契追击','灵契追击恢复少量气血','灵契追击间隔减至一次'],
 T004:['每三次出手爆发','爆发获得精准加成','爆发不受反震影响'],
 P001:['随主攻协战','协战增强剑意释放','剑意命中时追加灵狐追击'],
 P002:['入场护盾','护盾耗尽后小额补充','强化体修反击'],
 P003:['协战无视部分防御','灵契追击附带压制回复','提高协战命中'],
 P004:['战斗修为加成','灵契追击治疗增强','每波恢复气血'],
 H001:['解锁药田','药田每次产出2份','药田每次产出3份'],
 H002:['闭关修为加成','每次闭关额外研习悟道','闭关悟道研习加速'],
 H003:['提高活动效率','炼丹速度提高20%','采药每次产出2份'],
 H004:['增强灵宠战备','丹炉可使用御灵增效','灵契恢复效果增强']
};
export function growth(count=0){return count>=6?3:count>=3?2:count>=1?1:0}
export const cappedCopies=(s,id)=>Math.min(6,s.run.cards[id]||0);
export function coreCard(card){return !!card&&(CORE_EFFECTS.has(card.effect)||['D002','D003'].includes(card.id))}
export function ensureProgression(s){
 const m=s.meta,r=s.run;
 m.knowledge??={cards:{},recipes:{H001:true},enemies:{},realms:0};
 m.directed??={draws:0,claimed:0};m.dao??={points:0,nodes:{},milestones:{}};m.inheritance??=[];
 r.recipes??={H001:true};r.mastery??={gather:0,meditate:0,brew:0};
}
export function discover(s,card){
 ensureProgression(s);s.meta.knowledge.cards[card.id]=true;
 if(card.id==='D002'||card.id==='D003'){
  const herb=card.id==='D002'?'H002':'H003';s.run.recipes[herb]=true;s.meta.knowledge.recipes[herb]=true;
 }
}
export function recordProgress(s,c){
 ensureProgression(s);
 for(const [id,count] of Object.entries(s.run.cards))if(count>0&&c.cards[id])discover(s,c.cards[id]);
 for(const [id,count] of Object.entries(s.run.pills))if(count>0&&c.cards[id])discover(s,c.cards[id]);
 const m=s.meta,r=s.run;
 m.knowledge.realms=Math.max(m.knowledge.realms,r.realmIndex);
 const milestones={firstDraw:Object.values(r.draws).some(n=>n>0),firstCraft:r.mastery.brew>0,
  firstMap:m.bestMap>1,firstRealm:r.realmIndex>0,firstCycle:m.reincarnations>0,thirdCycle:m.reincarnations>=2};
 for(const [id,done] of Object.entries(milestones))if(done&&!m.dao.milestones[id]){m.dao.milestones[id]=true;m.dao.points++}
}
export function inheritanceOptions(s,c){return Object.values(c.cards).filter(x=>CORE_EFFECTS.has(x.effect)&&s.meta.knowledge?.cards[x.id])}
export function selectInheritance(s,c,ids){
 if(!Array.isArray(ids)||ids.length>2||new Set(ids).size!==ids.length)throw Error('传承最多选择两张不同核心卡');
 const options=new Set(inheritanceOptions(s,c).map(x=>x.id));
 if(ids.some(id=>!options.has(id)))throw Error('只能传承已发现的普通功法、灵宠或洞府卡');
 s.meta.inheritance=[...ids];return {kind:'inheritance',ids};
}
export function learnDao(s,c,id){
 const node=c.management.talents.find(x=>x.id===id),dao=s.meta.dao;
 if(!node||dao.nodes[id]||dao.points<node.cost||node.requires&&!dao.nodes[node.requires])throw Error('道统节点未满足解锁条件');
 dao.points-=node.cost;dao.nodes[id]=true;return {kind:'dao',id};
}
export function validateProgression(s,c){
 const m=s.meta,r=s.run,k=m.knowledge,d=m.directed,dao=m.dao;
 const nat=x=>Number.isSafeInteger(x)&&x>=0;
 if(!k||!d||!dao||!r.recipes||!r.mastery||!nat(d.draws)||!nat(d.claimed)||d.claimed>Math.floor(d.draws/c.management.directedEvery)||!nat(dao.points)||!nat(k.realms)||k.realms>4)throw Error('修行与见闻记录损坏');
 for(const [obj,allowed] of [[k.cards,Object.keys(c.cards)],[k.recipes,['H001','H002','H003']],[r.recipes,['H001','H002','H003']],[dao.nodes,c.management.talents.map(x=>x.id)]]){
  if(!obj||Object.entries(obj).some(([id,v])=>!allowed.includes(id)||v!==true))throw Error('未知见闻或道统节点');
 }
 if(!k.enemies||Object.entries(k.enemies).some(([id,v])=>!/^\d:[a-z]+$/.test(id)||v!==true))throw Error('敌人见闻损坏');
 if(!dao.milestones||Object.entries(dao.milestones).some(([id,v])=>!['firstDraw','firstCraft','firstMap','firstRealm','firstCycle','thirdCycle'].includes(id)||v!==true))throw Error('未知里程碑');
 if(['gather','meditate','brew'].some(id=>!nat(r.mastery[id]))||Object.keys(r.mastery).some(id=>!['gather','meditate','brew'].includes(id)))throw Error('熟练度损坏');
 for(const n of c.management.talents)if(dao.nodes[n.id]&&n.requires&&!dao.nodes[n.requires])throw Error('道统前置损坏');
 const earned=Object.keys(dao.milestones).length,spent=c.management.talents.filter(n=>dao.nodes[n.id]).reduce((n,x)=>n+x.cost,0);
 if(dao.points+spent!==earned)throw Error('道统点账目不一致');
 const allowed=new Set(inheritanceOptions(s,c).map(x=>x.id));
 if(!Array.isArray(m.inheritance)||m.inheritance.length>2||new Set(m.inheritance).size!==m.inheritance.length||m.inheritance.some(id=>!allowed.has(id)))throw Error('传承记录损坏');
}
