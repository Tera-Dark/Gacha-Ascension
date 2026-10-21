/** Read-only inventory projection. Actions use the existing game transaction engine. */
import {BOXES,HERBS,ITEMS} from './treasure.mjs';
import {EQUIPMENT_SLOTS,STAT_LABELS,comparison} from './equipment.mjs';
import {ARTIFACT_SLOTS,ARTIFACT_EFFECTS} from './artifacts.mjs';
import {pixelIcon} from './pixel-ui.mjs';
import {growth,GROWTH_TEXT} from './progression.mjs';
const esc=t=>String(t??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const BANK_CATEGORIES={all:'全部',equipment:'装备',artifact:'法器',medicine:'丹药',material:'药草',loot:'宝箱',core:'机缘',growth:'修行',relic:'遗物'};
export function bankEntries(s,c){
 const r=s.run,entries=[];
 const add=(kind,item,count,category,icon,extra={})=>{if(count>0)entries.push({...item,...extra,key:kind+':'+item.id,kind,count,category,icon})};
 for(const x of BOXES)add('box',x,r.boxes?.[x.id]||0,'loot','bag');
 for(const x of HERBS)add('herb',x,r.herbs?.[x.id]||0,'material','leaf');
 for(const x of ITEMS)add('medicine',x,(r.consumables?.[x.id]||0)+(r.prepared?.[x.id]||0),'medicine','bottle',{available:r.consumables?.[x.id]||0,prepared:r.prepared?.[x.id]||0});
 for(const [id,count] of Object.entries(r.pills||{}))if(c.cards[id])add('pill',c.cards[id],count,'medicine','bottle',{desc:'突破所需丹药，满足境界条件后自动扣除。'});
 for(const [id,count] of Object.entries(r.cards||{})){
  const x=c.cards[id];if(!x||x.effect==='pill')continue;
  const category=x.effect==='equipment'?'equipment':x.effect==='artifact'?'artifact':['technique','pet','cave'].includes(x.effect)?'core':'growth';
  const equipped=x.effect==='equipment'?Object.values(r.equipment||{}).filter(v=>v===id).length:x.effect==='artifact'?Object.values(r.artifacts||{}).filter(v=>v===id).length:r.technique===id||r.pet===id?1:0;
  add('card',x,count,category,({equipment:'sword',artifact:'fate',technique:'book',pet:'fox',cave:'cave'})[x.effect]||'scroll',{equipped,available:count-equipped});
 }
 for(const [source,defs] of [['relics',c.relics],['apex',c.apex],['ultras',c.ultras]])for(const x of defs||[]){const n=s.meta[source]?.[x.id];add(source,x,typeof n==='boolean'?Number(n):n||0,'relic','fate')}
 return entries;
}
let selected=null,category='all',query='',state,catalog,number=String,callbacks;
const $=id=>document.getElementById(id);
const rendered=new WeakMap();
function html(node,value){if(rendered.get(node)!==value){node.innerHTML=value;rendered.set(node,value)}}
export function mountBank(options){
 callbacks=options;
 $('bankSearch').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();selected=null;renderBank(state,catalog,number)});
 $('bankFilters').addEventListener('click',event=>{const b=event.target.closest('[data-bank-category]');if(!b)return;category=b.dataset.bankCategory;selected=null;renderBank(state,catalog,number)});
 $('bankGrid').addEventListener('click',event=>{const b=event.target.closest('[data-bank-item]');if(!b)return;selected=b.dataset.bankItem;renderBank(state,catalog,number);if(matchMedia('(max-width:600px) and (orientation:portrait)').matches)$('bankDetail').scrollIntoView({block:'nearest'})});
 $('bankDetail').addEventListener('click',event=>{
  const b=event.target.closest('[data-bank-action]');if(!b||b.disabled)return;
  const item=bankEntries(state,catalog).find(x=>x.key===selected);if(!item)return;
  const action=b.dataset.bankAction;
  if(action==='brew'){callbacks.navigate('cave');$('brewHerb').value=item.id;$('brewAmount').focus();return}
  if(action==='cultivate'){callbacks.navigate('cultivate');return}
  const commands={open:['OPEN_BOX',{id:item.id}],prepare:['PREPARE_ITEM',{id:item.id}],equip:['EQUIP_ITEM',{id:item.id,slot:b.dataset.slot}],artifact:['EQUIP_ARTIFACT',{id:item.id,slot:b.dataset.slot}],technique:['EQUIP_TECH',{id:item.id}],pet:['EQUIP_PET',{id:item.id}],unequip:['EQUIP_ITEM',{id:null,slot:b.dataset.slot}],unartifact:['EQUIP_ARTIFACT',{id:null,slot:b.dataset.slot}]};
  const [command,args]=commands[action]||[];if(!command)return;
  const result=callbacks.command(command,args);
  if(result)callbacks.notify(action==='open'?'获得 '+result.reward.name+' ×'+result.reward.count:action==='prepare'?'已加入下场战备':action.startsWith('un')?'已卸下':'已装配');
 });
}
export function renderBank(s,c,fmt){
 if(!s||!c)return;state=s;catalog=c;number=fmt;
 const all=bankEntries(s,c),visible=all.filter(x=>(category==='all'||x.category===category)&&(!query||(x.name+' '+x.id).toLowerCase().includes(query)));
 // Keep selection through state updates, including consuming the final copy.
 if(!selected&&visible.length)selected=visible[0].key;
 html($('bankFilters'),Object.entries(BANK_CATEGORIES).map(([key,label])=>'<button type="button" data-bank-category="'+key+'" aria-pressed="'+(key===category)+'">'+label+(key==='all'?'':' <small>'+all.filter(x=>x.category===key).length+'</small>')+'</button>').join(''));
 $('bankCount').textContent=visible.length+' / '+all.length+' 种';
 html($('bankGrid'),visible.map(x=>'<button type="button" class="bank-item" data-bank-item="'+x.key+'" data-rarity="'+esc(x.rarity||'huang')+'" aria-pressed="'+(x.key===selected)+'"><span class="bank-item-icon">'+pixelIcon(x.icon)+'</span><strong>'+esc(x.name)+'</strong><span class="bank-item-count">×'+fmt(x.count)+'</span>'+(x.equipped?'<small class="bank-badge">已装配 '+x.equipped+'</small>':x.prepared?'<small class="bank-badge">备战 '+x.prepared+'</small>':'')+'</button>').join('')||'<div class="bank-empty">'+(query?'没有匹配物品':'暂无物品')+'</div>');
 const item=all.find(x=>x.key===selected);
 if(!item){html($('bankDetail'),'<div class="bank-empty">'+(selected?'该物品已用完，选择其他物品查看。':'选择物品查看效果与操作')+'</div>');return}
 const busy=!!s.run.pendingBattle,disabled=busy?' disabled':'',r=s.run;
 let effect=item.desc||item.description||'获得后自动生效。',actions='',status='',extra='';
 const button=(action,label,slot='',off=false)=>'<button type="button" data-bank-action="'+action+'"'+(slot?' data-slot="'+slot+'"':'')+(off?' disabled':disabled)+'>'+esc(label)+'</button>';
 if(item.kind==='box')actions=button('open','开启一个');
 if(item.kind==='herb'){status='3份药草 → 1颗'+ITEMS.find(x=>x.id===item.potion)?.name;actions=button('brew','前往丹炉',null,!r.recipes?.[item.id]);if(!r.recipes?.[item.id])status+=' · 配方未解锁'}
 if(item.kind==='medicine'){status='可用 '+fmt(item.available)+' · 已备战 '+item.prepared+'/3';actions=button('prepare','加入下场战备',null,!item.available||item.prepared>=3)}
 if(item.kind==='pill')actions=button('cultivate','前往突破');
 if(item.effect==='equipment'){
  effect=Object.entries(item.stats).map(([k,v])=>STAT_LABELS[k]+' +'+fmt(v)+(k==='speedPct'?'%':'')).join(' · ');
  status='可用 '+item.available+' · 穿戴 '+item.equipped;
  actions=EQUIPMENT_SLOTS.filter(x=>x.type===item.equipmentSlot).map(slot=>{
   if(r.equipment?.[slot.id]===item.id)return '<div class="bank-slot-action">'+button('unequip','卸下 · '+slot.name,slot.id)+'</div>';
   let delta='没有空闲副本';if(item.available){const diff=comparison(s,c,slot.id,item.id).difference;delta=Object.entries(diff).filter(([,v])=>v).map(([k,v])=>STAT_LABELS[k]+' '+(v>0?'+':'')+v+(k==='speedPct'?'%':'')).join(' · ')||'属性不变'}
   return '<div class="bank-slot-action">'+button('equip','穿戴 · '+slot.name,slot.id,!item.available)+'<small>'+esc(delta)+'</small></div>';
  }).join('');
 }
 if(item.effect==='artifact'){
  effect=ARTIFACT_EFFECTS[item.artifactKind]+' +'+item.artifactValue+'%';status='可用 '+item.available+' · 穿戴 '+item.equipped;
  const slots=ARTIFACT_SLOTS.filter(x=>r.realmIndex>=x.realmIndex);
  actions=slots.map(slot=>r.artifacts?.[slot.id]===item.id?button('unartifact','卸下 · '+slot.name,slot.id):button('artifact','装配 · '+slot.name,slot.id,!item.available)).join('')||'<p>筑基期开放首个法器槽</p>';
 }
 if(['technique','pet'].includes(item.effect)){status=item.equipped?'当前已装配':'尚未装配';actions=button(item.effect,item.equipped?'已装配':'装配出战',null,!!item.equipped)}
 if(item.effect==='cave')status='已建造 · 自动生效';
 const labels={attackPct:'攻击',hpPct:'气血',defPct:'防御',allPct:'全属性',stonePct:'灵石收益',qiPct:'修为收益',speedPct:'出手速度',petPct:'灵宠效果',flatAttack:'基础攻击',flatHp:'基础气血'};
 if(item.category==='growth'){status='已领悟 · 自动生效';if(labels[item.effect])effect=(item.description?item.description+'。':'')+labels[item.effect]+' +'+fmt(item.value*item.count)+'%'}
 if(item.category==='relic'){
  const multipliers={heroMultiplier:'修士普攻伤害',petMultiplier:'灵宠效果',caveMultiplier:'洞府收益',techniqueMultiplier:'功法强度'};
  effect=multipliers[item.effect]?multipliers[item.effect]+' ×'+item.value:item.description||item.desc||(labels[item.stat]?labels[item.stat]+' +'+fmt(item.value*item.count)+(item.stat.endsWith('Pct')?'%':''):'永久加成，自动生效');status='永久保留 · 自动生效';
 }
 const nodes=GROWTH_TEXT[item.id];if(item.category==='core'&&nodes){const tier=growth(item.count);extra='<div class="bank-growth">'+nodes.map((text,i)=>'<p class="'+(tier>i?'unlocked':'')+'">'+(tier>i?'◆':'◇')+' '+[1,3,6][i]+'份 · '+esc(text)+'</p>').join('')+'</div>'}
 html($('bankDetail'),'<div class="bank-detail-icon">'+pixelIcon(item.icon)+'</div><small>'+BANK_CATEGORIES[item.category]+'</small><h3>'+esc(item.name)+'</h3><div class="bank-detail-quantity">持有 <strong>'+fmt(item.count)+'</strong></div><p class="bank-effect">'+esc(effect)+'</p>'+(status?'<p class="bank-item-status">'+esc(status)+'</p>':'')+extra+'<div class="bank-actions">'+actions+'</div>'+(busy&&actions?'<p class="bank-item-status">战斗结束后可操作</p>':''));
}
