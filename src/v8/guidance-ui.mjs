/** Optional UI guidance. Preferences are local UI state; rewards stay in engine. */
import {cultivationJourney,FIRST_VISIT_TIPS,featureIntroductions} from './onboarding.mjs';
const PREF_KEY='gacha-ascension-v8-guidance-v1';
const $=id=>document.getElementById(id);
const esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
let prefs={muted:false,seen:{}},state,catalog,current='explore',opener=null,navigate=null;
try{const raw=JSON.parse(localStorage.getItem(PREF_KEY));if(raw&&typeof raw==='object')prefs={muted:raw.muted===true,seen:raw.seen&&typeof raw.seen==='object'?raw.seen:{}}}catch{}
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
function paintJournal(){
 if(!state)return;
 const journal=cultivationJourney(state,catalog);
 $('journeySummary').textContent='第'+journal.life+'世 · '+journal.completed+'/'+journal.total+'项达成';
 $('journeyNext').textContent=journal.next?'建议下一步：'+journal.next.title:'本世要点已掌握，可自由安排修行。';
 const html=['入门','经营','构筑','传承'].map(chapter=>{
  const tasks=journal.tasks.filter(t=>t.chapter===chapter);
  return '<section class="journey-chapter"><h3>'+chapter+' <small>'+tasks.filter(t=>t.done).length+'/'+tasks.length+'</small></h3>'+tasks.map(t=>'<div class="journey-task '+(t.done?'is-complete':'')+'" data-journey-task="'+t.id+'"><span class="journey-check" aria-label="'+(t.done?'已达成':'未达成')+'">'+(t.done?'◆':'◇')+'</span><div><strong>'+t.title+'</strong><p>'+esc(t.description)+'</p></div><button type="button" data-journey-go="'+t.id+'">'+(t.done?'查看':t.available===false?t.waiting:'前往')+'</button></div>').join('')+'</section>';
 }).join('');
 // Preserve focus and scroll during five-second production updates.
 if($('journeyTasks').dataset.content!==html){$('journeyTasks').innerHTML=html;$('journeyTasks').dataset.content=html}
}
function paintTips(){
 const features=state?featureIntroductions(state,catalog):[];
 document.querySelectorAll('[data-first-tip]').forEach(node=>{
  const view=node.dataset.firstTip;
  const candidate=[{id:view,text:FIRST_VISIT_TIPS[view]},...features.filter(t=>t.view===view)].find(t=>!prefs.seen[t.id]);
  node.hidden=prefs.muted||!candidate||view!==current;
  if(candidate){node.querySelector('span').textContent=candidate.text;node.querySelector('button').dataset.dismissTip=candidate.id}
 });
 $('muteFirstTips').checked=prefs.muted;
}
export function renderGuidance(s,c,view){state=s;catalog=c;current=view;paintTips();if($('cultivationGuide').open)paintJournal()}
export function mountGuidance(goToView){
 navigate=goToView;
 document.querySelectorAll('.px-system-banner .module-title,.wb-enemy>.wb-heading .module-title').forEach(title=>{
  const button=document.createElement('button');button.type='button';button.className='guide-launcher';button.dataset.guideOpen='';button.textContent='手册';button.setAttribute('aria-label','打开修行手册与引导任务');title.append(button);
 });
 for(const [view,text] of Object.entries(FIRST_VISIT_TIPS)){
  const tip=document.createElement('aside');tip.className='first-visit-tip';tip.dataset.firstTip=view;tip.hidden=true;
  const message=document.createElement('span');message.textContent=text;
  const button=document.createElement('button');button.type='button';button.dataset.dismissTip=view;button.textContent='知道了';
  tip.append(message,button);document.querySelector('[data-view-panel="'+view+'"]>.px-system-banner')?.after(tip);
 }
 const dialog=$('cultivationGuide');
 $('closeCultivationGuide').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{if(!dialog.open)opener?.focus({preventScroll:true})});
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 $('muteFirstTips').addEventListener('change',event=>{prefs.muted=event.target.checked;savePrefs();paintTips()});
 $('reviewFirstTips').addEventListener('click',()=>{prefs={muted:false,seen:{}};savePrefs();paintTips();$('journeyNext').textContent='初见提示已恢复，进入模块即可查看。'});
 document.addEventListener('click',event=>{
  const launch=event.target.closest('[data-guide-open]');
  if(launch&&state){opener=launch;paintJournal();dialog.showModal();return}
  const dismiss=event.target.closest('[data-dismiss-tip]');
  if(dismiss){prefs.seen[dismiss.dataset.dismissTip]=true;savePrefs();paintTips();return}
  const go=event.target.closest('[data-journey-go]');if(!go||!state)return;
  const task=cultivationJourney(state,catalog).tasks.find(t=>t.id===go.dataset.journeyGo);if(!task)return;
  opener=null;dialog.close();navigate(task.view);
  if(task.tab)document.querySelector('[data-fate-tab="'+task.tab+'"]')?.click();
  const target=task.packId?document.querySelector('[data-pack-id="'+task.packId+'"] button[data-count="1"]'):task.target?$(task.target):null;
  if(target){for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target.scrollIntoView({block:'center'});target.focus({preventScroll:true})}
 });
}
