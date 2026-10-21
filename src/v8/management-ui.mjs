/** Pixel UI for the management loop; all mutations are dispatched by ui.mjs. */
import {productionStats} from './activities.mjs';
import {growth,GROWTH_TEXT,coreCard,inheritanceOptions} from './progression.mjs';
import {unlockedPack} from './modules.mjs';
const $=id=>document.getElementById(id),esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const herbNames={H001:'回春草',H002:'护脉叶',H003:'剑意花'},potionNames={H001:'回春丹',H002:'护体散',H003:'剑意散'};
export function mountManagement(){
 const mount=(parent,id,html)=>{const node=document.createElement('section');node.id=id;node.className='v10-panel';node.innerHTML=html;parent?.append(node);return node};
 const activity=mount(document.querySelector('.wb-player'),'activityPanel','<h3>修行安排</h3><p id="activityStatus"></p><div class="v10-controls"><button data-main="explore">探索刷怪</button><button data-main="meditate">闭关修炼</button><button data-main="gather">定向采药</button><button data-main="none">停止主活动</button><select id="gatherHerb" aria-label="采药目标"></select></div><small id="activityRates"></small><p id="worldReport" role="status"></p>');
 document.querySelector('.wb-player>.wb-heading')?.after(activity);
 const prep=mount(document.querySelector('.wb-enemy'),'battlePrepPanel','<h3>本图守关准备</h3><p id="battlePrepNote"></p>');
 const production=mount(document.querySelector('[data-view-panel="cave"]'),'productionPanel','<h3>药田与丹炉</h3><div class="v10-controls"><button data-main="gather">修士采药</button><button data-main="none">停止主活动</button></div><p id="productionRates"></p><div class="v10-controls"><select id="fieldHerb" aria-label="药田种植药草"></select><button id="toggleField">启用药田</button></div><div class="v10-controls"><select id="brewHerb" aria-label="自动炼丹配方"></select><select id="brewMode" aria-label="炼丹任务模式"><option value="count">炼制指定数量</option><option value="target">补足库存目标</option></select><input id="brewAmount" aria-label="炼丹数量" type="number" min="1" max="100" value="5"><button id="queueBrew">加入排程</button></div><div id="productionQueue"></div><p id="productionInventory"></p><p id="productionReport" role="status"></p>');
 document.querySelector('[data-view-panel="cave"]>.px-system-banner')?.after(production);
 document.querySelector('[data-view-panel="cultivate"] #realmName')?.insertAdjacentHTML('afterend','<div class="v10-controls"><button class="action-btn" data-main="meditate">开始闭关</button><button class="action-btn" data-main="none">停止主活动</button></div>');
 const directed=mount(document.querySelector('[data-view-panel="gacha"]'),'directedPanel','<h3>机缘定向 <span id="directedProgress"></span></h3><div class="v10-controls"><select id="directedCard" aria-label="定向核心卡"></select><button id="claimDirected">领取定向机缘</button></div>');
 $('gachaDirection')?.after(directed);
 const meta=mount(document.querySelector('[data-view-panel="fate"]'),'lineagePanel','<h3>道统与见闻 <span id="daoPoints"></span></h3><p id="knowledgeSummary"></p><div id="daoNodes" class="v10-dao-grid"></div><h3>两席传承</h3><div id="inheritanceChoices" class="v10-inheritance"></div><p id="reincarnationPreview" class="v10-preview"></p><details><summary>永久见闻图鉴</summary><div id="knowledgeCards" class="v10-knowledge"></div></details>');
 document.querySelector('[data-view-panel="fate"]>.px-system-banner')?.after(meta);
}
function options(id,items){const node=$(id),key=items.map(x=>x[0]).join('|');if(node.dataset.options===key)return;const current=node.value;node.innerHTML=items.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');if(items.some(x=>x[0]===current))node.value=current;node.dataset.options=key}
function htmlIfChanged(id,key,html){const node=$(id);if(node.dataset.renderKey!==key){node.innerHTML=html;node.dataset.renderKey=key}}
export function renderManagement(s,c,fmt){
 const r=s.run,m=s.meta,w=r.world,stats=productionStats(s,c),busy=!!r.pendingBattle;
 const text=(id,t)=>{const e=$(id);if(e&&e.textContent!==t)e.textContent=t};
 const threats=['妖狼每四次出手狂啸：护盾与护体散可承受爆发，剑意可抢先斩杀。','竹谷迷雾提高闪避：破军功法熟练节点提高爆发命中，灵宠提供额外出手机会。','鬼林妖物持续回血：流云剑经或雷隼达到3份可压制回复。','剑冢反震主角伤害：灵宠输出分担反震，九霄功法6份的爆发可免反震。'];
 text('battlePrepNote',threats[r.mapIndex]+' 当前战备：回春丹'+(r.prepared.MED001||0)+' / 护体散'+(r.prepared.MED002||0)+' / 剑意散'+(r.prepared.MED003||0)+'。');
 const main=r.idle?.active?'探索刷怪':w.activity.kind==='gather'?'采集'+herbNames[w.activity.herb]:w.activity.kind==='meditate'?'闭关修炼':busy?'手动战斗':'待命';
 text('activityStatus','当前：'+main+' · 本世熟练度 采药'+r.mastery.gather+' / 炼丹'+r.mastery.brew+' / 闭关'+r.mastery.meditate);
 text('activityRates','采药 '+fmt(3600000/stats.gatherMs*stats.gatherYield)+'份/小时 · 闭关 '+fmt(3600000/stats.meditateMs*stats.meditateQi)+'修为/小时');
 document.querySelectorAll('[data-main]').forEach(b=>{b.disabled=busy;b.classList.toggle('is-active',b.dataset.main===(r.idle?.active?'explore':w.activity.kind))});
 const available=Object.keys(r.recipes).map(id=>[id,herbNames[id]]);
 for(const id of ['gatherHerb','fieldHerb'])options(id,available);
 options('brewHerb',available.map(([id])=>[id,potionNames[id]]));
 text('productionRates','药田当前：'+(w.field.enabled?herbNames[w.field.herb]:'未种植')+' · 药田 '+fmt(3600000/stats.fieldMs*stats.fieldYield)+'份/小时 · 炼丹 '+fmt(3600000/stats.brewMs)+'颗/小时 · 库存上限 药草'+stats.herbCap+' / 丹药'+stats.potionCap+' · 排程 '+w.queue.length+'/'+stats.queueSlots);
 text('toggleField',w.field.enabled?'停止药田':'启用药田（需要九转灵田）');$('toggleField').disabled=busy||!(r.cards.H001>0);
 $('queueBrew').disabled=busy||w.queue.length>=stats.queueSlots;$('brewAmount').max=String(stats.potionCap);
 const queue=w.queue.map((x,i)=>'<div class="v10-queue-row"><span>'+potionNames[x.herb]+' · '+(x.mode==='target'?'库存达到 '+x.amount:'已炼 '+x.done+' / '+x.amount)+'</span><button data-remove-task="'+i+'" '+(busy?'disabled':'')+'>移除</button></div>').join('')||'<p>暂无排程</p>';
 htmlIfChanged('productionQueue',queue,queue);
 text('productionInventory','药草：'+Object.entries(herbNames).map(([id,n])=>n+' '+(r.herbs[id]||0)).join(' / ')+'；丹药：'+['MED001','MED002','MED003'].map((id,i)=>Object.values(potionNames)[i]+' '+(r.consumables[id]||0)).join(' / '));
 const rep=w.lastReport;
 if(rep){
  const names={...herbNames,MED001:'回春丹',MED002:'护体散',MED003:'剑意散'},parts=[];
  for(const [key,prefix] of [['gathered','采得'],['grown','药田'],['crafted','炼成'],['spent','消耗']])for(const [id,n] of Object.entries(rep[key]||{}))if(n)parts.push(prefix+names[id]+'×'+n);
  if(rep.qi)parts.push('修为+'+fmt(rep.qi));if(rep.stones)parts.push('灵石+'+fmt(rep.stones));
  const reportText=(rep.elapsedMs>=60000?'上次结算 '+(rep.elapsedMs/3600000).toFixed(2)+'小时：':'')+(parts.length?parts.join(' · '):'暂无新增产出')+(rep.capped?' · 超过24小时的部分未计入':'')+'。'+(rep.reasons||[]).join('；');
  text('worldReport',reportText);text('productionReport',reportText);
 }
 const ready=Math.floor(m.directed.draws/c.management.directedEvery)-m.directed.claimed;
 text('directedProgress','可领取 '+ready+' · 下次进度 '+m.directed.draws%c.management.directedEvery+'/20');
 options('directedCard',Object.values(c.cards).filter(x=>coreCard(x)&&unlockedPack(s,c,x.pack)).map(x=>[x.id,c.packById[x.pack].name+' · '+x.name]));
 $('claimDirected').disabled=busy||ready<1;
 text('daoPoints','道统点 '+m.dao.points);text('knowledgeSummary','永久发现 '+Object.keys(m.knowledge.cards).length+' 张卡 · 配方 '+Object.keys(m.knowledge.recipes).length+' 种 · 敌人 '+Object.keys(m.knowledge.enemies).length+' 类');
 const nodes=c.management.talents.map(n=>'<div class="v10-node '+(m.dao.nodes[n.id]?'owned':'')+'"><strong>'+n.branch+' · '+n.name+'</strong><p>'+n.desc+'</p><button data-learn-dao="'+n.id+'" '+(busy||m.dao.nodes[n.id]||m.dao.points<n.cost||n.requires&&!m.dao.nodes[n.requires]?'disabled':'')+'>'+(m.dao.nodes[n.id]?'已传承':n.requires&&!m.dao.nodes[n.requires]?'先解锁前置':'解锁 · '+n.cost+'道统点')+'</button></div>').join('');htmlIfChanged('daoNodes',nodes,nodes);
 const choices=inheritanceOptions(s,c).map(x=>'<label><input type="checkbox" data-inherit="'+x.id+'" '+(m.inheritance.includes(x.id)?'checked ':'')+(busy?'disabled':'')+'>'+esc(x.name)+'</label>').join('')||'<p>先发现一门功法、一只灵宠或一座洞府，即可规划传承。</p>';
 htmlIfChanged('inheritanceChoices',choices,choices);
 text('reincarnationPreview','轮回清空：境界、卡牌叠层、装备、材料、丹药、熟练度与排程。保留：见闻、道统、定向进度、因果、天命遗物。带走：'+(m.inheritance.map(id=>c.cards[id].name).join('、')||'尚未选择')+'，每张'+(m.dao.nodes.inherit?2:1)+'份。'+(m.dao.nodes.supplies?'下世附赠药草与回春丹。':''));
 const known=Object.keys(m.knowledge.cards).map(id=>'<span>机缘 · '+esc(c.cards[id].name)+'</span>').join('')+Object.keys(m.knowledge.recipes).map(id=>'<span>配方 · '+potionNames[id]+(r.recipes[id]?' · 本世可用':' · 本世待解锁')+'</span>').join('')+Object.keys(m.knowledge.enemies).map(key=>{const [map,kind]=key.split(':');return '<span>敌人 · '+esc(c.maps[Number(map)]?.name||'未知地图')+' · '+({mob:'小妖',guardian:'守卫',boss:'Boss'}[kind]||kind)+'</span>'}).join('');htmlIfChanged('knowledgeCards',known,known||'尚未发现机缘');
}
export function growthDescription(card,count){
 const tier=growth(count),descs=GROWTH_TEXT[card.id];if(!descs)return '';
 return '<details class="v10-growth"><summary>成长 '+Math.min(count,6)+'/6 · '+['未发现','入门','熟练','精通'][tier]+'</summary><span>'+descs.map((d,i)=>(tier>i?'◆ ':'◇ ')+[1,3,6][i]+'份：'+d).join('；')+'</span></details>';
}
