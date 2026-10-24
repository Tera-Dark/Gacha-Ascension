/** Short conversations over the real game, with optional replay. No game writes. */
import {storyChapter,storyHistory} from './story.mjs';
import {introducedView} from './modules.mjs';
const KEY='gacha-ascension-v8-story-reader-v1',SKIP='gacha-ascension-v8-novice-skip-v1';
const $=id=>document.getElementById(id);
let prefs={read:{}},state,catalog,scene,line=0,origin=null,navigate,objective;
try{const raw=JSON.parse(localStorage.getItem(KEY));if(raw?.read&&typeof raw.read==='object')prefs.read=raw.read}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs))}catch{}};
const sceneKey=ch=>ch.id==='return'?'return-'+state.meta.reincarnations:ch.id;
function paint(){
 const [speaker,text]=scene.lines[line];
 $('storyChapterTitle').textContent=scene.title;
 $('storySpeaker').textContent=speaker==='你'?'你':catalog.story.speaker+' · '+catalog.story.role;
 $('storySpeech').textContent=text;$('storySeal').textContent=speaker==='你'?'我':'烬';
 $('storyPage').textContent=(line+1)+' / '+scene.lines.length;
 $('storyPrevious').disabled=line===0;
 const last=line===scene.lines.length-1,current=scene.id===storyChapter(state,catalog).id;
 const step=objective(),responses={awakening:'照亮第一道命痕', 'borrowed-blade':'去山路试剑','first-gate':'前往山门',return:'踏上这一世'};
 $('storyContinue').textContent=!last?'继续 →':!current?'回到当前主线':(responses[scene.id]|| (step.packId?'前往寻缘':step.action))+' →';
 $('storyConversation').dataset.speaker=speaker==='你'?'player':'keeper';
}
function open(ch,source){scene=ch;line=0;origin=source;paint();if(!$('storyConversation').open)$('storyConversation').showModal()}
export function renderStory(s,c){
 state=s;catalog=c;const chapter=storyChapter(s,c);
 $('openStory').textContent=prefs.read[sceneKey(chapter)]?'残卷':'残卷 · 新';
 $('openStory').setAttribute('aria-label','与阿烬交谈：'+chapter.title);
 $('storyCurrentTitle').textContent=chapter.title;
 document.querySelectorAll('.nav-item[data-view],.mobile-tabs [data-view],#mobileSheet [data-view]').forEach(button=>button.classList.toggle('is-unintroduced',!introducedView(s,c,button.dataset.view)));
 const available=storyHistory(s,c);
 const key=available.map(ch=>ch.id).join('|');
 if($('storyArchive').dataset.content!==key){$('storyArchive').replaceChildren(...available.map(ch=>{const button=document.createElement('button');button.type='button';button.dataset.storyReplay=ch.id;button.textContent=ch.title;return button}));$('storyArchive').dataset.content=key}
 // Only a genuinely fresh first life opens automatically. Existing skips are respected.
 let skipped=false;try{skipped=localStorage.getItem(SKIP)==='1'}catch{}
 if(chapter.id==='awakening'&&!prefs.read.awakening&&!skipped&&!s.meta.reincarnations&&!s.run.mobKills&&!s.run.guardianWins&&!s.run.lastBattle){
  if(!$('storyConversation').open&&!document.querySelector('dialog[open]')&&$('revealOverlay').hidden)open(chapter,$('openStory'));
 }
}
export function mountStory(goToObjective,getObjective){
 navigate=goToObjective;objective=getObjective;
 $('openStory').addEventListener('click',()=>{if(state)open(storyChapter(state,catalog),$('openStory'))});
 $('storyFromGuide').addEventListener('click',()=>{$('cultivationGuide').close();open(storyChapter(state,catalog),$('openStory'))});
 $('storyPrevious').addEventListener('click',()=>{if(line>0){line--;paint()}});
 $('storyContinue').addEventListener('click',()=>{
  if(line<scene.lines.length-1){line++;paint();return}
  if(scene.id!==storyChapter(state,catalog).id){open(storyChapter(state,catalog),origin);return}
  prefs.read[sceneKey(scene)]=true;save();origin=null;$('storyConversation').close();navigate(objective());
 });
 $('skipStory').addEventListener('click',()=>$('storyConversation').close());
 $('storyArchive').addEventListener('click',event=>{const b=event.target.closest('[data-story-replay]');const ch=catalog&&[...catalog.story.chapters,catalog.story.return].find(x=>x.id===b?.dataset.storyReplay);if(ch)open(ch,origin)});
 $('storyConversation').addEventListener('close',()=>{if(scene){prefs.read[sceneKey(scene)]=true;save()}origin?.focus({preventScroll:true});if(state)renderStory(state,catalog)});
}
