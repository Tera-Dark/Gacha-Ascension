import {GROWTH_TEXT} from './progression.mjs';
const routes=[{name:'剑修',tech:'T001',pet:'P001',alternative:['T004','P003'],support:'剑意散助爆发，剑经3份可压制回复'},
 {name:'体修',tech:'T002',pet:'P002',alternative:['P004'],support:'护体散承伤、回春丹续航，补盾后反击'},
 {name:'御灵',tech:'T003',pet:'P003',alternative:['P004','P001'],support:'蕴兽台助灵宠，回春丹保障主角持续行动'}];
export function buildRoadmap(s,c){return routes.map(route=>{
 const count=s.run.cards[route.tech]||0,next=[1,3,6].find(n=>n>count),label=id=>({id,name:c.cards[id].name,owned:(s.run.cards[id]||0)>0});
 return {...route,core:[label(route.tech),label(route.pet)],alternatives:route.alternative.map(label),next:next?{copies:next,missing:next-count,effect:GROWTH_TEXT[route.tech][[1,3,6].indexOf(next)]}:null};
})}
/** Explanations are grounded in this encounter's full event log, never a forecast. */
export function failureEvidence(combat,mapIndex){
 const logs=combat.logs||[],sum=actor=>logs.filter(x=>x.actor===actor).reduce((n,x)=>n+(x.amount||0),0);
 const misses=logs.filter(x=>x.actor==='miss'&&x.owner==='hero').length;
 if(combat.reason==='timeout')return {text:'行动耗尽；敌方回复 '+sum('regen')+'，主攻落空 '+misses+' 次。',action:sum('regen')?'补压制回复节点':'查看输出构筑',view:'technique'};
 if(mapIndex===3&&sum('counter'))return {text:'本场反震造成 '+sum('counter')+' 伤害。',action:'调整灵宠与御灵构筑',view:'pet'};
 if(mapIndex===1&&misses>=3)return {text:'本场主攻落空 '+misses+' 次。',action:'查看精准与灵契替代',view:'technique'};
 return {text:'最高单次敌攻 '+combat.maxEnemyHit+' / 气血 '+combat.hero.hp+'；护盾吸收 '+combat.blocked+'。',action:'安排护体与恢复丹药',view:'cave'};
}
export function renderBuildRoadmap(s,c){
 const host=document.getElementById('buildRoadmap');if(!host)return;
 const key=JSON.stringify(s.run.cards);if(host.dataset.cards===key)return;host.dataset.cards=key;host.replaceChildren();
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n};
 for(const route of buildRoadmap(s,c)){
  const row=document.createElement('section');row.className='build-route';row.append(node('h4',route.name));
  row.append(node('p',route.core.map(x=>x.name+(x.owned?' ✓':' · 待寻缘')).join(' ＋ ')));
  row.append(node('p','替代：'+route.alternatives.map(x=>x.name+(x.owned?' ✓':'')).join('、')));
  row.append(node('p',route.next?'下个节点：'+route.next.copies+'份（还差'+route.next.missing+'）· '+route.next.effect:'主功法已精通'));
  row.append(node('p',route.support));host.append(row);
 }
}
