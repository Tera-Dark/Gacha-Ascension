/** Pixel UI for the management loop; all mutations are dispatched by ui.mjs. */
import {productionStats} from './activities.mjs';
import {growth,GROWTH_TEXT,coreCard,inheritanceOptions} from './progression.mjs';
import {unlockedPack} from './modules.mjs';
const $=id=>document.getElementById(id),esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const herbNames={H001:'回春草',H002:'护脉叶',H003:'剑意花'},potionNames={H001:'回春丹',H002:'护体散',H003:'剑意散'};
export function mountManagement(){
 const mount=(parent,id,html)=>{const node=document.createElement('section');node.id=id;node.className='v10-panel';node.innerHTML=html;parent?.append(node);return node};
 const activity=mount(document.querySelector('.wb-player'),'activityPanel','<div class="activity-current"><span>修行</span><strong id="activityStatus"></strong><button data-main="none" aria-label="停止修行">停止</button></div><div class="activity-choices"><button data-main="explore">探索</button><button data-main="gather">采药</button><button data-main="meditate">闭关</button></div><div id="gatherTarget"><select id="gatherHerb" aria-label="采药目标"></select></div><details class="quiet-disclosure activity-record"><summary>修行记录</summary><small id="activityRates"></small><p id="masterySummary"></p><p id="worldReport" role="status"></p></details>');
 document.querySelector('.wb-player>.wb-heading')?.after(activity);
 mount(document.querySelector('.wb-enemy'),'battlePrepPanel','<details class="quiet-disclosure"><summary>守关准备 <span id="battlePrepSummary"></span></summary><p id="battlePrepNote"></p><button class="text-action" data-view="items">准备丹药 ↗</button></details>');
 const production=mount(document.querySelector('[data-view-panel="cave"]'),'productionPanel','<div class="production-grid"><section class="production-station"><div class="station-heading"><h3>药田</h3><span id="fieldStatus"></span></div><p id="fieldRate"></p><div class="v10-controls"><select id="fieldHerb" aria-label="药田种植药草"></select><button id="toggleField">启用药田</button></div></section><section class="production-station"><div class="station-heading"><h3>丹炉</h3><span id="brewStatus"></span></div><div class="v10-controls brew-controls"><select id="brewHerb" aria-label="自动炼丹配方"></select><select id="brewMode" aria-label="炼丹任务模式"><option value="count">炼制数量</option><option value="target">库存目标</option></select><input id="brewAmount" aria-label="炼丹数量" type="number" min="1" max="100" value="5"><button id="queueBrew">加入排程</button></div><div id="productionQueue"></div></section></div><details class="quiet-disclosure production-record"><summary>收获与库存</summary><p id="productionReport" role="status"></p><p id="productionInventory"></p><p id="productionRates"></p><div class="v10-controls"><button data-main="gather">修士采药</button><button data-main="none">停止修行</button></div></details>');
 document.querySelector('[data-view-panel="cave"]>.px-system-banner')?.after(production);
 document.querySelector('[data-view-panel="cultivate"] #realmName')?.insertAdjacentHTML('afterend','<div class="v10-controls"><button class="action-btn" data-main="meditate">开始闭关</button><button class="action-btn" data-main="none">停止修行</button></div>');
 const directed=mount(document.querySelector('[data-view-panel="gacha"]'),'directedPanel','<details class="quiet-disclosure" id="directedChoice"><summary>定向机缘 <span id="directedProgress"></span></summary><div class="v10-controls"><select id="directedCard" aria-label="定向核心卡"></select><button id="claimDirected">领取机缘</button></div></details>');
 $('gachaDirection')?.after(directed);
 const meta=mount(document.querySelector('[data-view-panel="fate"]'),'lineagePanel','<h3>道统 <span id="daoPoints"></span></h3><div id="daoNodes" class="v10-dao-grid"></div><details class="quiet-disclosure"><summary>永久见闻 <span id="knowledgeSummary"></span></summary><div id="knowledgeCards" class="v10-knowledge"></div></details>');
 document.querySelector('[data-view-panel="fate"]>.px-system-banner')?.after(meta);
 const rebirth=document.querySelector('[data-view-panel="fate"]>.v8-panel');
 $('reincarnate').insertAdjacentHTML('beforebegin','<h3>两席传承</h3><div id="inheritanceChoices" class="v10-inheritance"></div><div id="reincarnationPreview" class="v10-preview"></div>');
 meta.dataset.fatePanel='dao';rebirth.dataset.fatePanel='inheritance';$('openRelic').closest('.v8-panel').dataset.fatePanel='relics';
 const tabs=document.createElement('nav');tabs.className='module-tabs';tabs.setAttribute('aria-label','轮回系统');
 tabs.innerHTML=[['dao','道统'],['inheritance','传承与轮回'],['relics','天命遗物']].map(([key,label])=>'<button data-fate-tab="'+key+'" aria-pressed="'+(key==='dao')+'">'+label+'</button>').join('');
 document.querySelector('[data-view-panel="fate"]>.px-system-banner').after(tabs);
 const switchTab=key=>{document.querySelectorAll('[data-fate-panel]').forEach(p=>{p.hidden=p.dataset.fatePanel!==key});tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fateTab===key)))};
 tabs.addEventListener('click',event=>{const b=event.target.closest('[data-fate-tab]');if(b)switchTab(b.dataset.fateTab)});switchTab('dao');
}
function options(id,items){const node=$(id),key=items.map(x=>x[0]).join('|');if(node.dataset.options===key)return;const current=node.value;node.innerHTML=items.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');if(items.some(x=>x[0]===current))node.value=current;node.dataset.options=key}
function htmlIfChanged(id,key,html){const node=$(id);if(node.dataset.renderKey!==key){node.innerHTML=html;node.dataset.renderKey=key}}
export function renderManagement(s,c,fmt){
 const r=s.run,m=s.meta,w=r.world,stats=productionStats(s,c),busy=!!r.pendingBattle;
 const text=(id,t)=>{const e=$(id);if(e&&e.textContent!==t)e.textContent=t};
 const threats=['妖狼每四次出手狂啸：护盾与护体散可承受爆发，剑意可抢先斩杀。','竹谷迷雾提高闪避：破军功法熟练节点提高爆发命中，灵宠提供额外出手机会。','鬼林妖物持续回血：流云剑经或雷隼达到3份可压制回复。','剑冢反震主角伤害：灵宠输出分担反震，九霄功法6份的爆发可免反震。'];
 text('battlePrepNote',threats[r.mapIndex]+' 当前战备：回春丹'+(r.prepared.MED001||0)+' / 护体散'+(r.prepared.MED002||0)+' / 剑意散'+(r.prepared.MED003||0)+'。');
 const main=r.idle?.active?'探索刷怪':w.activity.kind==='gather'?'采集'+herbNames[w.activity.herb]:w.activity.kind==='meditate'?'闭关修炼':busy?'手动战斗':'待命';
 text('activityStatus',w.activity.kind==='gather'?'采药 · '+fmt(3600000/stats.gatherMs*stats.gatherYield)+'份/时':w.activity.kind==='meditate'?'闭关 · '+fmt(3600000/stats.meditateMs*stats.meditateQi)+'/时':main);
 text('masterySummary','熟练度 · 采药 '+r.mastery.gather+' / 炼丹 '+r.mastery.brew+' / 闭关 '+r.mastery.meditate);
 $('gatherTarget').hidden=w.activity.kind!=='gather';
 text('battlePrepSummary',['爆发','闪避','回复','反震'][r.mapIndex]);
 text('fieldStatus',w.field.enabled?'种植中':r.cards.H001?'待种植':'未解锁');
 text('fieldRate',w.field.enabled?herbNames[w.field.herb]+' · '+fmt(3600000/stats.fieldMs*stats.fieldYield)+'份 / 小时':r.cards.H001?'选择药草开始种植':'抽到九转灵田后开放');
 const brewReason=w.lastReport?.reasons?.find(x=>x.startsWith('丹炉'));
 text('brewStatus',w.queue.length+'/'+stats.queueSlots+' · '+(brewReason?.includes('缺料')?'缺料':brewReason?.includes('目标')?'已达目标':w.queue.length?'炼制中':'待安排'));
 text('activityRates','采药 '+fmt(3600000/stats.gatherMs*stats.gatherYield)+'份/小时 · 闭关 '+fmt(3600000/stats.meditateMs*stats.meditateQi)+'修为/小时');
 document.querySelectorAll('[data-main]').forEach(b=>{b.disabled=busy;b.classList.toggle('is-active',b.dataset.main===(r.idle?.active?'explore':w.activity.kind))});
 const available=Object.keys(r.recipes).map(id=>[id,herbNames[id]]);
 for(const id of ['gatherHerb','fieldHerb'])options(id,available);
 options('brewHerb',available.map(([id])=>[id,potionNames[id]]));
 text('productionRates','药田当前：'+(w.field.enabled?herbNames[w.field.herb]:'未种植')+' · 药田 '+fmt(3600000/stats.fieldMs*stats.fieldYield)+'份/小时 · 炼丹 '+fmt(3600000/stats.brewMs)+'颗/小时 · 库存上限 药草'+stats.herbCap+' / 丹药'+stats.potionCap+' · 排程 '+w.queue.length+'/'+stats.queueSlots);
 text('toggleField',w.field.enabled?'停止种植':'开始种植');$('toggleField').disabled=busy||!(r.cards.H001>0);
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
 const directedPool=Object.values(c.cards).filter(x=>coreCard(x)&&unlockedPack(s,c,x.pack));
 text('directedProgress',ready?(directedPool.length?'可领取 '+ready:'已积攒 '+ready+'次 · 首卫后可选'):m.directed.draws%c.management.directedEvery+'/'+c.management.directedEvery);
 const directed=$('directedChoice').parentElement;if(directed.dataset.ready!==String(ready>0)){$('directedChoice').open=ready>0;directed.dataset.ready=String(ready>0)}
 options('directedCard',directedPool.map(x=>[x.id,c.packById[x.pack].name+' · '+x.name]));
 $('claimDirected').disabled=busy||ready<1||!directedPool.length;
 text('daoPoints','道统点 '+m.dao.points);text('knowledgeSummary',Object.keys(m.knowledge.cards).length+' 卡 / '+Object.keys(m.knowledge.recipes).length+' 配方 / '+Object.keys(m.knowledge.enemies).length+' 敌人');
 const nodes=['悟道','营造','传承'].map(branch=>'<section class="dao-branch"><h4>'+branch+'</h4>'+c.management.talents.filter(n=>n.branch===branch).map(n=>'<div class="v10-node '+(m.dao.nodes[n.id]?'owned':'')+'"><strong>'+n.name+'</strong><p>'+n.desc+'</p><button data-learn-dao="'+n.id+'" '+(busy||m.dao.nodes[n.id]||m.dao.points<n.cost||n.requires&&!m.dao.nodes[n.requires]?'disabled':'')+'>'+(m.dao.nodes[n.id]?'已传承':n.requires&&!m.dao.nodes[n.requires]?'需前置节点':'解锁 · '+n.cost+'点')+'</button></div>').join('')+'</section>').join('');htmlIfChanged('daoNodes',nodes,nodes);
 const choices=inheritanceOptions(s,c).map(x=>'<label><input type="checkbox" data-inherit="'+x.id+'" '+(m.inheritance.includes(x.id)?'checked ':'')+(busy?'disabled':'')+'>'+esc(x.name)+'</label>').join('')||'<p>先发现一门功法、一只灵宠或一座洞府，即可规划传承。</p>';
 htmlIfChanged('inheritanceChoices',choices,choices);
 const ledger='<dl class="inheritance-ledger"><div><dt>清空</dt><dd>境界、卡牌叠层、装备、材料、丹药、熟练度与排程</dd></div><div><dt>保留</dt><dd>见闻、道统、定向进度、因果与天命遗物</dd></div><div><dt>传承</dt><dd>'+esc(m.inheritance.map(id=>c.cards[id].name).join('、')||'尚未选择')+' · 每张'+(m.dao.nodes.inherit?2:1)+'份</dd></div><div><dt>下世</dt><dd>已修境界所需修为降至60%'+(m.dao.nodes.supplies?'，附赠药草与回春丹':'')+'</dd></div></dl>';
 htmlIfChanged('reincarnationPreview',ledger,ledger);
 const known=Object.keys(m.knowledge.cards).map(id=>'<span>机缘 · '+esc(c.cards[id].name)+'</span>').join('')+Object.keys(m.knowledge.recipes).map(id=>'<span>配方 · '+potionNames[id]+(r.recipes[id]?' · 本世可用':' · 本世待解锁')+'</span>').join('')+Object.keys(m.knowledge.enemies).map(key=>{const [map,kind]=key.split(':');return '<span>敌人 · '+esc(c.maps[Number(map)]?.name||'未知地图')+' · '+({mob:'小妖',guardian:'守卫',boss:'Boss'}[kind]||kind)+'</span>'}).join('');htmlIfChanged('knowledgeCards',known,known||'尚未发现机缘');
}
export function growthDescription(card,count){
 const tier=growth(count),descs=GROWTH_TEXT[card.id];if(!descs)return '';
 return '<details class="v10-growth"><summary>成长 '+Math.min(count,6)+'/6 · '+['未发现','入门','熟练','精通'][tier]+'</summary><span>'+descs.map((d,i)=>(tier>i?'◆ ':'◇ ')+[1,3,6][i]+'份：'+d).join('；')+'</span></details>';
}
