import {mountBank,renderBank} from './bank.mjs';
import {mountHelp} from './module-help.mjs';
import {loadCatalog,dispatch,heroStats,yields,progress,breakthroughRequirements,combatSnapshot,fight,reincarnationPreview,packCost,farmTarget,pendingRealmGate} from "./engine.mjs";
import {readGame,writeGame,backupAndReset,recoverInvalidSave,parseImport,importGame} from "./storage.mjs";
import {openSession} from './session.mjs';
import {diagnosticSummary} from './diagnostics.mjs';
import {restoreInWorker} from './restore.mjs';
import {isMuted,setMuted,unlockAudio,pauseAudio,sound} from './audio.mjs';
import {renderReturns} from './return-ui.mjs';
import {failureEvidence,renderBuildRoadmap} from './build-guide.mjs';
import {detailModel} from "./details.mjs";
import {showReveal} from "./reveal.mjs";
import {unlockedPack} from "./modules.mjs";
import {EQUIPMENT_SLOTS,equippedMap,comparison,STAT_LABELS} from "./equipment.mjs";
import {RULES,assessEncounter} from "./combat-depth.mjs";
import {ARTIFACT_SLOTS,ARTIFACT_EFFECTS,artifactsOwned,artifactBonuses} from "./artifacts.mjs";
import {ITEMS,AUTO_POTION_COST} from "./treasure.mjs";
import {activeSynergy} from "./synergy.mjs";
import {recommendLoadout,nextStep} from "./advisor.mjs";
import {combatTimeline,combatCues,attackPresentation} from "./combat-timeline.mjs";
import {noviceStep} from "./onboarding.mjs";
import {mountGuidance,renderGuidance} from './guidance-ui.mjs';
import {mountStory,renderStory} from './story-ui.mjs';
import {storyUnlockHint,cardRevelation,noteworthyDraw} from './story.mjs';
import {loadPixelAssets,renderPixelScene,renderPixelFrame,pixelBattleEvent} from "./pixel-scene.mjs";
import {mountManagement,renderManagement,growthDescription} from "./management-ui.mjs";
import {pixelIcon,packIcons,initPixelUI} from "./pixel-ui.mjs";
const $=id=>document.getElementById(id),fmt=n=>{
 if(!Number.isFinite(n))return "—";
 const a=Math.abs(n);
 return a>=1e12?(n/1e12).toFixed(2)+"兆":a>=1e8?(n/1e8).toFixed(2)+"亿":a>=1e4?(n/1e4).toFixed(2)+"万":Math.round(n).toLocaleString("zh-CN");
};
const escapeHTML=t=>String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const majors=["凡尘炼气","地脉筑基","丹成沧海","雷穹元婴","太虚化神"];
let c,s,view="explore",auto=false,autoPush=false,timer=null,toastTimer=null,battleBusy=false,lastCombatAnalysis=null,revealBusy=false,selectedGearSlot="weapon1",selectedArtifactSlot=null,buildAdvice=null,liveClock=null,settledPose=null,livePreview=false,manualTimer=null,manualResumeAuto=false;
let hostHidden=false;
let session=null,restoring=false,saveFailed=false;
let gearOpener=null;
const platformAllowed=()=>!window.GachaAndroid?.isPlayAllowed||window.GachaAndroid.isPlayAllowed()===true;
function sessionMessage(text){$('sessionNotice').hidden=!text;set('sessionMessage',text)}
function pausePlayback(){clearTimeout(timer);clearTimeout(manualTimer);timer=manualTimer=null;clearLiveTimeline();battleBusy=false}
function commitState(state,{persist=true}={}){
 try{
  if(!platformAllowed())throw Error('平台认证受限，已停止前台游戏');
  if(persist){session.assert();writeGame(state,c,session.storage)}
  else if(!session?.writable)throw Error('此页面为只读：请关闭其他游戏页面，再接管存档');
  s=state;
 }catch(error){saveFailed=true;pausePlayback();sessionMessage('保存停止：'+error.message+'。原存档保留，请导出或重新载入。');throw error}
}
async function recoverSession(){
 if(!session?.writable||restoring||saveFailed)return;
 restoring=true;pausePlayback();sessionMessage('正在整理离线修行记录…');
 try{
  session.assert();const out=await restoreInWorker(s,c,Date.now());
  session.assert();commitState(out.state);buildAdvice=null;render();reportIdle(out.result);sessionMessage('');
 }catch(error){saveFailed=true;sessionMessage(error.message+' · 请重新载入后重试');throw error}
 finally{restoring=false}
}

let combatReceiptUntil=0;
const pageHidden=()=>document.hidden||hostHidden;
const NOVICE_SKIP_KEY="gacha-ascension-v8-novice-skip-v1";
const QUICK_REVEAL_KEY="gacha-ascension-v8-quick-reveal-v1";
const set=(id,text)=>{const e=$(id);if(e&&e.textContent!==String(text))e.textContent=text};
/** innerHTML is only touched when the produced markup actually changed; a kill
 * during auto farming must not re-parse nine pack cards and 24 atlas rows. */
const markupCache=new Map();
function setMarkup(id,content){if(markupCache.get(id)===content)return;markupCache.set(id,content);$(id).innerHTML=content}
const enemyName=name=>{const prefix=c?.maps.find(map=>String(name).startsWith(map.name+'·'));return prefix?String(name).slice(prefix.name.length+1):name};
function toast(message,failure=false){
 const el=$("toast");el.textContent=message;el.classList.toggle("failure",failure);el.classList.add("visible");
 if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),3400);
}
/** Preserve unreadable save bytes and give players a conscious recovery choice. */
function offerInvalidSaveRecovery(raw,message){
 const panel=document.createElement("section");
 panel.id="invalidSaveRecovery";panel.className="v8-save-recovery";
 panel.setAttribute("role","alert");
 const title=document.createElement("strong");
 title.textContent="存档读取失败，原始存档未被覆盖";
 const desc=document.createElement("p");
 desc.textContent=message+"。建议先导出原始数据，再选择保留备份并重开。";
 const actions=document.createElement("div");
 const exportButton=document.createElement("button");
 exportButton.type="button";exportButton.id="exportInvalidSave";
 exportButton.textContent="导出原始存档";
 exportButton.addEventListener("click",()=>{
  const blob=new Blob([raw],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="gacha-ascension-unreadable-save.json";
  document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
 });
 const resetButton=document.createElement("button");
 resetButton.type="button";resetButton.id="recoverInvalidSave";
 resetButton.textContent="保留备份并新建存档";
 resetButton.addEventListener("click",()=>{
  if(!window.confirm("原始存档将另存为独立备份，然后开始新游戏。确认继续？"))return;
  try{
   const result=recoverInvalidSave(c,session.storage);
   set("saveStatus","旧存档已备份至 "+result.backupKey);
   window.location.reload();
  }catch(error){toast("备份失败，原始存档未被覆盖："+error.message,true)}
 });
 actions.append(exportButton,resetButton);panel.append(title,desc,actions);
 document.querySelector(".game-shell")?.prepend(panel);
}
function closeMobileSheet(){
 const sheet=$("mobileSheet"),backdrop=$("mobileSheetBackdrop"),button=$("moreSystems");
 if(!sheet||!backdrop||!button)return;
 sheet.hidden=true;backdrop.hidden=true;button.setAttribute("aria-expanded","false");
}
function toggleMobileSheet(){
 const sheet=$("mobileSheet"),backdrop=$("mobileSheetBackdrop"),button=$("moreSystems");
 const shouldOpen=sheet.hidden;
 sheet.hidden=!shouldOpen;backdrop.hidden=!shouldOpen;
 button.setAttribute("aria-expanded",String(shouldOpen));
}
function changeView(target){
 closeMobileSheet();closeLandscapeNav();
 if(!["explore","cultivate","gacha","technique","cave","pet","items","fate","atlas","settings"].includes(target))return;
 view=target;
 for(const el of document.querySelectorAll("[data-view-panel]"))el.classList.toggle("is-active",el.dataset.viewPanel===target);
 for(const el of document.querySelectorAll("button[data-view]")){
  const active=el.dataset.view===target;el.classList.toggle("is-active",active);
  if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");
 }
 const names={explore:"地图探索",cultivate:"境界突破",gacha:"机缘抽卡",technique:"功法",cave:"洞府经营",pet:"御兽灵契",items:"道具行囊",fate:"轮回天命",atlas:"世界图鉴",settings:"存档设置"};
 set("screenTitle",names[target]);
 document.body.dataset.currentView=target;
 $("moreSystems").classList.toggle("is-active",["technique","cave","pet","items","atlas","settings"].includes(target));
 const panel=document.querySelector('[data-view-panel="'+target+'"]');if(panel)panel.scrollTop=0;
 render();
}
function goToStoryObjective(step){
 changeView(step.view);
 const target=step.packId?document.querySelector('[data-pack-id="'+step.packId+'"] button[data-count="1"]'):step.view==='explore'?$(step.action.includes('挑战')?(s.run.checkpoint===c.checkpointsPerMap-1?'challengeBoss':'challenge'):'autoFarm'):null;
 if(target){for(let parent=target;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;target.scrollIntoView({block:'center'});target.focus({preventScroll:true})}
}
function doCommand(type,more={}){
 if(!s||!c||restoring||saveFailed||!session?.writable||!platformAllowed())return null;
 try{
  const resync=auto&&s.run.idle?.active&&!["START_IDLE","CLAIM_IDLE","STOP_IDLE","BATTLE"].includes(type);
  const brewed=s.run.mastery.brew;
  const out=dispatch(s,c,{type,seq:s.seq+1,now:Date.now(),...more});
  commitState(out.state);buildAdvice=null;render();
  if(s.run.mastery.brew>brewed)sound('craft');if(type==='DRAW'||type==='CLAIM_DIRECTED')sound('draw');if(type==='BREAKTHROUGH')sound('breakthrough');
  // A card or equipment change alters the next deterministic fight.
  if(resync)schedule();
  return out.result;
 }catch(error){toast(error.message,true);return null}
}
/** The 5s clock settles production even when nothing finished. Rebuilding every
 * panel on each tick is the main idle CPU cost on low-end phones, so an unchanged
 * report only repaints the cheap top bar; real gains still trigger a full render. */
let lastTickKey="";
let lastPersistAt=0;
function tickKey(report){
 if(!report)return "";
 const {elapsedMs,lastBattle,...rest}=report;
 return JSON.stringify(rest);
}
function tickWorld(){
 if(!s||!c||restoring||saveFailed||!session?.writable||pageHidden()||auto)return;
 const brewed=s.run.mastery.brew;
 let out;
 try{out=dispatch(s,c,{type:'CLAIM_WORLD',seq:s.seq+1,now:Date.now()})}
 catch(error){toast(error.message,true);return}
 buildAdvice=null;
 if(s.run.mastery.brew>brewed)sound('craft');
 const key=tickKey(out.worldReport);
 const now=Date.now();
 // Persisting every five seconds regardless of progress wears the storage and
 // costs a full validate+serialize; a minute of unpersisted settlement is
 // safely recomputed on reload because nothing here consumes RNG.
 const persist=key!==lastTickKey||now-lastPersistAt>=60000;
 try{commitState(out.state,{persist})}catch{return}
 if(persist)lastPersistAt=now;
 if(key===lastTickKey){renderTop();return}
 lastTickKey=key;render();
}
/** assessEncounter runs 24 seeded fights and is deterministic for a build.
 * Cache by the snapshot that feeds it instead of resimulating on every render. */
let assessmentCache={key:"",value:null};
function combatReport(kind){
 const snap=combatSnapshot(s,c,kind),key=JSON.stringify(snap);
 if(assessmentCache.key!==key)assessmentCache={key,value:assessEncounter(snap,24)};
 return assessmentCache.value;
}

function closeLandscapeNav(){
 document.body.classList.remove("wb-nav-open");
 $("landscapeBackdrop").hidden=true;
 $("landscapeNavToggle").setAttribute("aria-expanded","false");
}
function openLandscapeNav(){
 document.body.classList.add("wb-nav-open");
 $("landscapeBackdrop").hidden=false;
 $("landscapeNavToggle").setAttribute("aria-expanded","true");
}
function renderMapDrawer(){
 $("mapDrawerList").innerHTML=c.maps.map((map,i)=>{
  const current=s.run.mapIndex===i,available=i+1<=s.meta.bestMap;
  return '<button class="wb-map-choice'+(current?" current":"")+'" type="button" data-map-info="'+i+'" '+
   (!available?"disabled":"")+'><strong>'+escapeHTML(map.name)+'</strong><small>'+
   (current?"当前探索 · 第"+(s.run.checkpoint+1)+"关":available?"已解锁 · 可查看资料":"尚未解锁")+
   '</small></button>';
 }).join("");
 $("drawerCheckpointTrack").innerHTML=Array.from({length:c.checkpointsPerMap},(_,i)=>{
  const active=i===s.run.checkpoint,done=i<s.run.checkpoint;
  return '<button class="wb-drawer-stage'+(active?" active":done?" cleared":"")+'" type="button" data-stage-info="'+i+'">'+
   (i===7?"最终Boss":("关卡 "+(i+1)))+(active?" · 当前":"")+'</button>';
 }).join("");
}

function renderArtifacts(){
 const equipped=artifactsOwned(s),bonus=artifactBonuses(s,c);
 setMarkup("artifactGrid",ARTIFACT_SLOTS.map(slot=>{
  const open=s.run.realmIndex>=slot.realmIndex,card=c.cards[equipped[slot.id]];
  return '<button type="button" class="wb-artifact-slot'+(card?" active":"")+'" data-artifact-slot="'+slot.id+'"'+(open?"":" disabled")+
   '><strong>✧ '+slot.name+'</strong><small>'+escapeHTML(open?card?.name||"空 · 点击穿戴":"境界未达成 · 待解锁")+'</small></button>';
 }).join(""));
 set("artifactSlotsInfo","已开放 "+ARTIFACT_SLOTS.filter(x=>s.run.realmIndex>=x.realmIndex).length+"/4 · 攻击+"+bonus.strike+"% · 减敌攻"+bonus.curse+"%");
}
function drawArtifactBag(){
 const slot=ARTIFACT_SLOTS.find(x=>x.id===selectedArtifactSlot);
 if(!slot)return;
 $("equipmentDrawerTitle").textContent=slot.name+" · 本命法器";
 const equipped=artifactsOwned(s),used=Object.values(equipped);
 const options=Object.values(c.cards).filter(x=>x.effect==="artifact");
 $("equipmentChoices").innerHTML='<button class="wb-equipment-choice" data-select-artifact="none">卸下法器</button>'+
  options.map(card=>{
   const count=s.run.cards[card.id]||0,active=equipped[slot.id]===card.id;
   const available=active||count>used.filter(id=>id===card.id).length;
   return '<button type="button" class="wb-equipment-choice'+(active?" selected":"")+'" data-select-artifact="'+card.id+'"'+
    (available?"":" disabled")+'><strong>'+escapeHTML(card.name)+(active?" · 已装备":"")+
    '</strong><small>'+escapeHTML(ARTIFACT_EFFECTS[card.artifactKind])+' +'+card.artifactValue+'% · 持有'+count+'</small></button>';
  }).join("");
 $("equipmentCompare").textContent="独立于10个装备槽。筑基、金丹、元婴、化神依次新增1个法器槽；效果参与实际战斗。";
}
function openArtifact(slot){
 selectedArtifactSlot=slot;
 gearOpener=document.activeElement;
 $("equipmentDrawer").hidden=false;
 drawArtifactBag();
 $("closeEquipment").focus();
}
function renderItems(){
 renderBank(s,c,fmt);
 const a=s.meta.autoPotion;
 set("autoPotionStatus",a?.unlocked?(a.enabled?"自动吃药运行中 · 气血≤"+Math.round(a.threshold*100)+"%触发":"已解锁，当前关闭"):"尚未解锁 · 消耗 "+AUTO_POTION_COST+" 因果可永久获得");
 $("unlockAutoPotion").hidden=!!a?.unlocked;
 $("unlockAutoPotion").disabled=!!a?.unlocked||s.meta.fate<AUTO_POTION_COST;
 $("toggleAutoPotion").disabled=!a?.unlocked;
 $("toggleAutoPotion").textContent=a?.enabled?"关闭自动吃药":"开启自动吃药";
 $("autoPotionThreshold").disabled=!a?.unlocked;
 $("autoPotionThreshold").value=String(a?.threshold??.35);
}

function safeGearUpgrades(){
 const eq=equippedMap(s),used=Object.values(eq),found=[];
 for(const slot of EQUIPMENT_SLOTS){
  const cards=Object.values(c.cards).filter(x=>x.effect==="equipment"&&x.equipmentSlot===slot.type);
  const candidates=cards.filter(x=>eq[slot.id]!==x.id&&
    (s.run.cards[x.id]||0)>used.filter(id=>id===x.id).length);
  for(const card of candidates){
   const diff=comparison(s,c,slot.id,card.id).difference;
   if(Object.values(diff).some(n=>n>0)&&Object.values(diff).every(n=>n>=0)){
    found.push({slot:slot.id,card:card.id,
     score:diff.attack*8+diff.hp*.25+diff.defense*6+diff.speedPct*3});
   }
  }
 }
 found.sort((a,b)=>b.score-a.score);
 return found;
}
function renderGear(){
 const equipment=equippedMap(s);
 const upgrades=safeGearUpgrades();
 const slots=new Set(upgrades.map(x=>x.slot));
 set("openGearBag",slots.size?"行囊 · "+slots.size+"槽可提升 ↗":"行囊 ↗");
 setMarkup("equipmentGrid",EQUIPMENT_SLOTS.map(slot=>{
  const id=equipment[slot.id],card=id?c.cards[id]:null;
  return '<button class="wb-gear-slot'+(card?" filled":"")+(slots.has(slot.id)?" can-upgrade":"")+'" type="button" data-gear-slot="'+slot.id+'" aria-label="'+
    escapeHTML(slot.name+(card?" "+card.name:" 空槽"))+'"><span class="wb-gear-icon">'+slot.icon+'</span>'+
    '<span class="wb-gear-caption">'+escapeHTML(slot.name)+'</span>'+
    '<span class="wb-gear-name">'+escapeHTML(card?.name||"空")+'</span></button>';
 }).join(""));
}
function openGear(slot){
 selectedArtifactSlot=null;
 selectedGearSlot=slot;
 gearOpener=document.activeElement;
 $("equipmentDrawer").hidden=false;
 drawGearBag();
 $("closeEquipment").focus();
}
function closeGear(){
 const drawer=$("equipmentDrawer");
 if(!drawer||drawer.hidden)return;
 drawer.hidden=true;
 if(gearOpener&&gearOpener.isConnected)gearOpener.focus({preventScroll:true});
 gearOpener=null;
}
function dismissReveal(){
 const overlay=$("revealOverlay");
 if(!overlay||overlay.hidden)return false;
 $("closeReveal").click();
 return true;
}
function drawGearBag(){
 if(selectedArtifactSlot){drawArtifactBag();return}
 const slot=EQUIPMENT_SLOTS.find(x=>x.id===selectedGearSlot);
 if(!slot)return;
 $("equipmentDrawerTitle").textContent=slot.name+" · 装备选择";
 const equipped=equippedMap(s),same=Object.values(equipped);
 const options=Object.values(c.cards).filter(x=>x.effect==="equipment"&&x.equipmentSlot===slot.type);
 const eligible=card=>(s.run.cards[card.id]||0)>same.filter(x=>x===card.id).length;
 $("equipmentChoices").innerHTML=
  '<button type="button" class="wb-equipment-choice'+(!equipped[slot.id]?" selected":"")+'" data-select-gear="none"><strong>卸下装备</strong><small>清空本槽位</small></button>'+
  options.map(card=>{
   const own=s.run.cards[card.id]||0,active=equipped[slot.id]===card.id,can=active||eligible(card);
   const affix=Object.entries(card.stats).map(([k,v])=>STAT_LABELS[k]+" +"+v+(k==="speedPct"?"%":"")).join(" · ");
   const diff=can&&!active?comparison(s,c,slot.id,card.id).difference:null;
   const delta=diff?Object.entries(diff).filter(([,v])=>v!==0).map(([k,v])=>STAT_LABELS[k]+" "+(v>0?"+":"")+v+(k==="speedPct"?"%":"")).join(" · "):active?"当前已穿戴":"数量不足";
   return '<button type="button" class="wb-equipment-choice'+(active?" selected":"")+'" data-select-gear="'+card.id+'"'+(!can?" disabled":"")+
    '><strong>'+escapeHTML(card.name)+(active?" · 已穿戴":"")+'</strong><small>'+escapeHTML(affix)+" · 库存"+own+
    '</small><small>装配变化：'+escapeHTML(delta)+'</small></button>';
  }).join("");
 $("equipmentCompare").textContent="当前槽位："+(equipped[slot.id]?c.cards[equipped[slot.id]].name:"空")+
  "。每件装备最多两条词条，装配后属性即时参与战斗，轮回时清空。";
}

function snapshot(hpId,barId,current,max){
 set(hpId,fmt(current)+" / "+fmt(max));
 const el=$(barId);if(el)el.style.width=Math.max(0,Math.min(100,100*current/max||0))+"%";
}
function damagePop(event){
 const layer=$("damageLayer"),el=document.createElement("span");
 const isMiss=event.actor==="miss",isHeal=["potion","regen"].includes(event.actor);
 const toHero=event.actor==="enemy"||event.actor==="counter"||event.actor==="potion"||
  (isMiss&&event.owner==="enemy");
 el.className="damage-pop "+(isHeal?"heal-dmg":toHero?"hero-dmg":"enemy-dmg");
 el.textContent=isMiss?"闪避":event.actor==="enemy"&&event.blocked>0&&event.amount===0?"格挡 "+fmt(event.blocked):(isHeal?"+":"−")+fmt(event.amount||0);
 el.style.left=(toHero? "21%":"68%");
 layer.append(el);setTimeout(()=>el.remove(),800);
 // Damage numbers provide impact feedback without flashing the whole sprite.
}
/** All combat modes share one chronological event-to-HP renderer. */
function showHitEvent(event,combat,withEffects=true){
 if(withEffects){pixelBattleEvent(event,s);if(['hero','pet','retaliation'].includes(event.actor))sound('attack');else if(event.actor==='enemy')sound('enemy');else if(event.actor==='warning')sound('warning')}
 if(event.actor==="warning"){set("combatStatus",event.name);return}
 if(event.actor==="wave"){
  set("enemyLabel",enemyName(event.name)+(event.total>1?" · "+event.stage+"/"+event.total:""));
  set("wbWave","第"+event.stage+"/"+event.total+"波");
  snapshot("enemyHP","enemyBar",event.hp,event.max);
  set("combatStatus","进入第"+event.stage+"/"+event.total+"波");
  return;
 }
 const toHero=event.actor==="enemy"||event.actor==="counter"||event.actor==="potion"||
  event.actor==="miss"&&event.owner==="enemy";
 if(toHero)snapshot("heroHP","heroBar",event.hp,event.max);
 else snapshot("enemyHP","enemyBar",event.hp,event.max);
 if(withEffects&&!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)damagePop(event);
 const resonance=combat.synergy;
 const resonanceHit=resonance&&(
  event.actor==="hero"&&event.amount>0&&(resonance.strike||resonance.burst&&event.turn%3===0)||
  event.actor==="pet"&&event.amount>0&&resonance.petDamage||
  event.actor==="enemy"&&event.blocked>0&&resonance.shieldHp);
 set("combatStatus",resonanceHit?"✦ "+resonance.name+" · 共鸣触发":
  event.actor==="miss"?"攻击落空":
  event.actor==="potion"?(event.source==="bond"?"灵契回春 · 恢复气血":"回春丹：紧急恢复气血"):
  event.actor==="retaliation"?"玄甲反击 · 护盾转化伤害":
  event.mechanic?event.mechanic:
  event.actor==="regen"?"敌方恢复":
  event.actor==="pet"?"灵宠协战":
  event.actor==="counter"?"敌方反震":
  event.actor==="enemy"&&event.blocked>0&&event.amount===0?"护盾完全格挡":
  toHero?"敌方命中 · 气血减少":"我方命中 · 敌方气血减少");
}
function clearLiveTimeline(){
 liveClock=null;livePreview=false;
 $("heroAttackBar").style.width="0%";$("enemyAttackBar").style.width="0%";
}
function advanceLiveClock(){
 const clock=liveClock;if(!clock)return null;
 const elapsed=Math.min(clock.combat.timeMs,Math.max(0,Date.now()-clock.origin));
 while(clock.cursor<clock.combat.logs.length&&clock.combat.logs[clock.cursor].timeMs<=elapsed)
  showHitEvent(clock.combat.logs[clock.cursor++],clock.combat,true);
 const motions={hero:attackPresentation(clock.cues.hero,elapsed),enemy:attackPresentation(clock.cues.enemy,elapsed)};
 for(const owner of ["hero","enemy"]){
  const bar=$(owner+"AttackBar");bar.style.width=(motions[owner].progress*100)+"%";
 }
 $("intervalFill").style.width=(100*elapsed/clock.combat.timeMs)+"%";
 set("fightTimer","战斗剩余 "+(Math.max(0,clock.combat.timeMs-elapsed)/1000).toFixed(1)+"秒 · 最后一击后结算");
 renderPixelFrame(motions);
 return motions;
}
function presentationFrame(now){
 // Canvas sprites only need repainting while a fight is on screen; idling on
 // another panel must not keep redrawing 60 times a second on mobile.
 const visible=!!liveClock||(document.body.dataset.currentView||'explore')==='explore'||
  !!(settledPose&&Date.now()<settledPose.until);
 if(visible&&!advanceLiveClock())
  renderPixelFrame(settledPose&&Date.now()<settledPose.until?settledPose.motions:null,now);
 requestAnimationFrame(presentationFrame);
}
function startLiveTimeline(combat,plan,mode="auto",origin=Date.now()-plan.elapsedMs){
 clearLiveTimeline();
 combatReceiptUntil=0;
 settledPose=null;livePreview=true;battleBusy=true;
 snapshot("heroHP","heroBar",combat.hero.hp,combat.hero.hp);
 const first=combat.waves?.[0]||combat.enemy;
 snapshot("enemyHP","enemyBar",first.hp,first.hp);
 set("enemyLabel",enemyName(first.name));
 set("combatStatus",mode==="manual"?"战斗进行中 · 每次出手按真实间隔扣血":"自动交锋进行中 · 每次命中即时显示伤害");
 // Seeking after resume or a build change does not repeat past damage pops.
 for(const event of plan.past)showHitEvent(event,combat,false);
 liveClock={combat,origin,cues:combatCues(combat),cursor:plan.past.length};
 advanceLiveClock();
}
/** A prepared encounter is replay-free. HP follows deterministic hit events
 * while the persistent authoritative battle transaction remains uncommitted.
 * Switching tabs or refreshing only seeks the same encounter clock.
 */
let manualRetries=0;
function finishManual(){
 if(saveFailed||restoring||!session?.writable)return;
 if(manualTimer!==null){clearTimeout(manualTimer);manualTimer=null}
 const pending=s?.run?.pendingBattle;
 if(!pending)return;
 const remaining=pending.startedAt+pending.durationMs-Date.now();
 if(remaining>0){manualTimer=setTimeout(finishManual,remaining+15);return}
 advanceLiveClock();
 const result=doCommand("FINISH_BATTLE");
 if(!result){
  // Retry with backoff, then leave a documented escape hatch instead of
  // keeping the save locked forever behind a pending battle.
  if(++manualRetries<=3){manualTimer=setTimeout(finishManual,250*manualRetries);return}
  const abandoned=doCommand("ABANDON_BATTLE");
  manualRetries=0;
  if(abandoned){toast("本场战斗记录无法复核，已放弃结算并恢复操作；本场未发放奖励。",true);render();return}
  sessionMessage("战斗记录异常，无法结算。请先导出存档并反馈；重新载入后可继续其他操作。");
  return;
 }
 manualRetries=0;
 afterBattle(result);
 set("fightTimer","战斗已按时间线完成 · 资源和掉落已结算");
 const resume=manualResumeAuto;
 manualResumeAuto=false;
 if(resume){
  if(!result.won){autoPush=false;toast("自动冲关失败，已关闭冲关，恢复安全刷怪。",true)}
  startAuto();
 }
}
function scheduleManual(){
 if(manualTimer!==null){clearTimeout(manualTimer);manualTimer=null}
 if(!s?.run?.pendingBattle||pageHidden()||saveFailed||restoring||!session?.writable)return;
 const pending=s.run.pendingBattle;
 const combat=fight(s,c,pending.kind,{seed:pending.seed});
 if(Math.ceil(combat.timeMs)!==pending.durationMs){
  // Deploying or migrating can change the combat rules under a saved fight.
  // The stored record stays authoritative, so settle on its own clock rather
  // than refusing to settle and locking every other command.
  toast("战斗参数已更新，将按存档记录的时间结算本场。",true);
  set("fightTimer","按存档时间线结算中…");
  manualTimer=setTimeout(finishManual,Math.max(0,pending.startedAt+pending.durationMs-Date.now())+15);
  return;
 }
 const timeline=combatTimeline(combat,Math.max(0,Date.now()-pending.startedAt));
 if(!timeline.remainingMs){finishManual();return}
 set("fightTimer","实时战斗 · "+(timeline.remainingMs/1000).toFixed(1)+"秒后结算");
 startLiveTimeline(combat,timeline,"manual",pending.startedAt);
 manualTimer=setTimeout(finishManual,Math.max(0,pending.startedAt+pending.durationMs-Date.now()));
}
function startManualBattle(kind,resumeAuto=false){
 if(s?.run?.pendingBattle||battleBusy&&!auto){
  toast("一场战斗正在进行，请等当前攻击逐次结束。",true);return
 }
 if(auto)stopAuto();
 const prepared=doCommand("PREPARE_BATTLE",{enemyType:kind});
 if(!prepared)return;
 manualResumeAuto=resumeAuto;
 scheduleManual();
}
function refreshCombatButtons(){
 const r=s.run,p=progress(s,c),pending=!!r.pendingBattle,busy=battleBusy&&!auto;
 $("killMob").disabled=auto||busy||pending;
 $("challenge").disabled=p.finalGuardian||r.bossCleared||busy||pending||!!pendingRealmGate(s,c);
 $("challengeBoss").disabled=!p.finalGuardian||r.bossCleared||busy||pending;
 $("analyzeBuild").disabled=r.bossCleared||battleBusy||pending;
}
function settleLiveTimeline(result){
 const motions=advanceLiveClock();
 if(motions)settledPose={motions,until:Date.now()+180};
 clearLiveTimeline();
 battleBusy=false;
 combatReceiptUntil=Date.now()+850;
 const {combat}=result;
 snapshot("heroHP","heroBar",combat.heroRemaining,combat.hero.hp);
 snapshot("enemyHP","enemyBar",combat.enemyRemaining,combat.enemy.hp);
 set("enemyLabel",enemyName(combat.enemy.name));
 set("combatStatus",result.won?"✓ 战斗胜利 · 每次攻击已即时呈现":combat.reason==="timeout"?"⌛ 战斗僵持 · 没有死亡掉装":"✕ 战斗失败 · 战斗结算已完成");
 $("intervalFill").style.width="100%";
 refreshCombatButtons();
 // Give the player a moment to read the final hit and loot before restoring
 // the next target's full HP; never overwrite another fight's live timeline.
 setTimeout(()=>{
  if(!battleBusy&&!auto&&!s.run.pendingBattle&&view==="explore")render();
 },850);
}
function incomePreview(){
 const map=s.run.mapIndex,k=s.run.checkpoint,b=c.balance,y=yields(s,c);
 const focus=farmTarget(s,c);
 const stones=Math.max(1,Math.round(b.stonesPerKill*Math.pow(b.mapRewardFactor,map)*Math.pow(b.checkpointRewardFactor,k)*(1+y.stonePct/100)*focus.stoneFactor));
 const qi=Math.max(1,Math.round(b.qiPerKill*Math.pow(1.67,map)*Math.pow(1.07,k)*(1+y.qiPct/100)*focus.qiFactor));
 return {stones,qi};
}
function renderTop(){
 const p=progress(s,c),h=heroStats(s,c),y=yields(s,c),r=s.run;
 set("headerStones",fmt(r.stones));set("headerRealm",h.name);
 set("headerQi",fmt(r.qi));set("headerInsight",fmt(r.insight));set("headerFate",fmt(s.meta.fate));
 set("topRealm",h.name);set("topNextRealm",r.realmIndex===4?"本切片最高可达筑基初期":"下一阶段 "+c.realms[r.realmIndex+1].name);
 set("topStone",fmt(r.stones));set("topStoneRate","灵石收益 +"+fmt(y.stonePct)+"%");
 set("topQi",fmt(r.qi));set("topQiNeed","突破需 "+fmt(breakthroughRequirements(s,c).qi));
 set("topMap",String(r.mapIndex+1).padStart(2,"0")+" / 04");
 set("topStage",p.map.name+" · 第"+p.stage+"关");
 set("heroLabel",h.name);
 set("heroStats","攻击 "+fmt(h.attack)+" · 防御 "+fmt(h.defense));
 set("playerStatsCompact","气血 "+fmt(h.hp));
 set("heroAttackSpeed","出手间隔 "+(RULES.heroIntervalMs/(1+y.speedPct/100)/1000).toFixed(2)+"秒");
 $("heroAttackBar").style.animationDuration=(RULES.heroIntervalMs/(1+y.speedPct/100))+"ms";
 $("heroAttackBar").style.animationPlayState=auto||battleBusy?"running":"paused";
 $("enemyAttackBar").style.animationPlayState=auto||battleBusy?"running":"paused";
 set("wbTechnique",r.technique?c.cards[r.technique].name:"未习得");
 set("wbPet",r.pet?c.cards[r.pet].name:"未出战");
 set("loadoutSummary",[r.technique?c.cards[r.technique].name:null,r.pet?c.cards[r.pet].name:null].filter(Boolean).join(" / ")||"未装配");
 set("sideAtk",fmt(h.attack));set("sideHp",fmt(h.hp));set("sideDef",fmt(h.defense));
 set("sideTech",r.technique?c.cards[r.technique].name:"未装备");
 set("sidePet",r.pet?c.cards[r.pet].name:"未出战");
 set("sideStone","+"+fmt(y.stonePct)+"%");
 set("sideQi","+"+fmt(y.qiPct)+"%");
 set("rightGoal",r.bossCleared?"雾隐剑冢最终Boss已击败，可以突破筑基或选择轮回。":
   "第"+p.stage+"关小怪可无限刷取。守卫失败不退层，强化后再挑战"+(p.finalGuardian?"地图Boss。":"守卫。"));
 set("autoStatus",auto?"探索中":s.run.world.activity.kind==="gather"?"采药中":s.run.world.activity.kind==="meditate"?"闭关中":"待命");
 const label=$("autoFarm");label.textContent=auto?"Ⅱ 停止探索":"▶ 开始探索";
 set("autoPush","自动冲关："+(autoPush?"开":"关"));
}
function renderBuildAdvice(){
 const pair=activeSynergy(s,false,c),r=s.run;
 set("synergyLabel",pair?"✦ "+pair.name:"尚无双修共鸣");
 set("synergyHint",pair?pair.description:
  "尚无共鸣");
 const target=r.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
 $("analyzeBuild").disabled=r.bossCleared||battleBusy;
 const apply=$("equipSuggestedBuild");
 apply.hidden=true;apply.disabled=true;
 if(r.bossCleared){set("buildAdvice","四图已经通关，当前无需守关推演。");return}
 if(!buildAdvice||buildAdvice.kind!==target){
  set("buildAdvice","");
  return;
 }
 const {current,best,improved,caution,combinations}=buildAdvice;
 const techName=best.technique?c.cards[best.technique].name:"无功法";
 const petName=best.pet?c.cards[best.pet].name:"无灵宠";
 const summary="已比对"+combinations+"套 · 当前 "+Math.round(current.score.rate*100)+
  "% → 推荐 "+Math.round(best.score.rate*100)+"%（16次模拟）。";
 if(improved){
  set("buildAdvice",summary+" 推荐："+techName+" + "+petName+"。"+(caution||""));
  apply.hidden=false;apply.disabled=battleBusy;
  apply.textContent="一键装配推荐构筑";
 }else set("buildAdvice",summary+" 当前配置在样本中已是较优选择。"+(caution||""));
}
function renderNovice(){
 let skipped=false;try{skipped=localStorage.getItem(NOVICE_SKIP_KEY)==="1"}catch{}
 const stage=skipped?null:noviceStep(s);
 $("noviceGuide").hidden=!stage;
 document.body.classList.toggle("novice-mode",!!stage);
 if(!stage)return;
 set("noviceStep","入门修行 · 第"+stage.index+"/3步");
 set("noviceTitle",['','阿烬 · 借你一剑','阿烬 · 试试这道命痕','阿烬 · 山门后的传承'][stage.index]);set("noviceDescription",['','“用灵石照亮残卷，借前人的剑走这一世。”','“斩来的灵石，能照亮下一页。”','“赢过守卫，残卷便能听见新的传承。”'][stage.index]);
 set("noviceAction",stage.action+" →");
}
function renderExplore(){
 const p=progress(s,c),r=s.run,h=heroStats(s,c),inc=incomePreview();
 set("mapTag","第"+(r.mapIndex+1)+"图 · "+majors[r.mapIndex<4?0:r.mapIndex] );
 set("mapName",p.map.name);
 set("mapFlavor","第"+p.stage+"/"+c.checkpointsPerMap+"关 · "+p.map.mechanicDescription);
 set("mapBoss","最终Boss："+p.map.boss.name);
 set("checkpointCount",r.bossCleared?"四图切片已通关":"第"+p.stage+"/"+c.checkpointsPerMap+"关");
 $("checkpointTrack").innerHTML=Array.from({length:c.checkpointsPerMap},(_,i)=>
  '<div class="checkpoint-node '+(i<r.checkpoint?"passed":i===r.checkpoint?"current":"")+'">'+(i===c.checkpointsPerMap-1?"B":i+1)+'</div>').join("");
 const gate=pendingRealmGate(s,c);
 $("challenge").disabled=p.finalGuardian||r.bossCleared||(battleBusy&&!auto)||!!gate||!!r.pendingBattle;
 $("challengeBoss").disabled=!p.finalGuardian||r.bossCleared||(battleBusy&&!auto)||!!r.pendingBattle;
 $("challenge").hidden=p.finalGuardian;$("challengeBoss").hidden=!p.finalGuardian;
 $("killMob").disabled=auto||battleBusy||!!r.pendingBattle;
 set("mobStone","+"+fmt(inc.stones));set("mobQi","+"+fmt(inc.qi));
 $("farmFocus").value=s.run.farmFocus||"balanced";
 set("farmFocusTip",farmTarget(s,c).desc);
 const foe=combatSnapshot(s,c,r.bossCleared?"mob":p.finalGuardian?"boss":"guardian").enemy;
 const live=combatSnapshot(s,c,"mob");
 const attackMs=RULES.heroIntervalMs/(1+live.heroSpeedPct/100);
 set("heroAttackSpeed","出手间隔 "+(attackMs/1000).toFixed(2)+"秒");
 $("heroAttackBar").style.animationDuration=attackMs+"ms";
 set("heroStats","攻击 "+fmt(live.hero.attack)+" · 防御 "+fmt(live.hero.defense));
 set("playerStatsCompact","气血 "+fmt(live.hero.hp));
 set("enemyAttackSpeed","出手间隔 "+(RULES.enemyIntervalMs/(1+r.mapIndex*.025)/1000).toFixed(2)+"秒");
 $("enemyAttackBar").style.animationDuration=(RULES.enemyIntervalMs/(1+r.mapIndex*.025))+"ms";
 set("wbWave",r.bossCleared?"可持续刷怪":p.finalGuardian?"地图Boss · 3波":"关卡守卫 · 2波");
 set("wbEnemyTraits",foe.traits.join(" · "));
 $("enemySprite").querySelector("span").textContent=["🐺","🦉","🌿","👻"][r.mapIndex]||"妖";
 renderGear();renderArtifacts();renderMapDrawer();
 if(!battleBusy&&!r.pendingBattle&&(!r.lastBattle||Date.now()>=combatReceiptUntil)){
  const e=live.enemy;
  set("enemyLabel",enemyName(e.name));set("enemyStats","攻击 "+fmt(e.attack)+" · 防御 "+fmt(e.defense));
  snapshot("heroHP","heroBar",live.hero.hp,live.hero.hp);snapshot("enemyHP","enemyBar",e.hp,e.hp);
 }
 if(r.bossCleared){
  lastCombatAnalysis=null;
  set("guardForecast","四图已经完成");
  set("combatStyles","已通关");set("hitRates","—");set("survivalRisk","—");
  set("waveSummary","四图终章完成");
  set("combatAdvice","可以在当前关刷怪，满足筑基条件或自愿轮回。");
  set("goalHint","恭喜击败雾隐剑冢Boss！前往境界页面突破筑基，或通过轮回天命进入下一世。");
 }else{
  const target=p.finalGuardian?"boss":"guardian",a=combatReport(target);
  lastCombatAnalysis=a;
  set("guardForecast",Math.round(a.winRate*100)+"% · "+a.risk);
  set("combatStyles",a.heroStyle+" / "+a.enemyStyle+" · "+a.matchup);
  set("hitRates",Math.round(a.heroHitChance*100)+"% / "+Math.round(a.enemyHitChance*100)+"%");
  set("survivalRisk",Math.round(a.damageReduction*100)+"% / 最大单击约"+fmt(a.maxThreatHit));
  set("waveSummary",a.waveCount+"波 · 预计"+fmt(a.averageTurns)+"次行动");
  set("combatAdvice",a.opportunity+"。胜率来自24次独立模拟，不读取下一场的真实随机结果。");
  set("goalHint",a.safeToAuto?
   "当前构筑适合连续挑战"+(p.finalGuardian?"地图Boss":"守卫")+"。自动冲关将按风险判断执行。":
   "请在本关刷小怪、抽卡强化攻防与减伤，或装配克制敌人流派的功法；失败不会退关。");
 }
 if(gate){
  set("guardForecast","境界未达 · 暂停挑战");
  set("combatAdvice","已经抵达新地图，但需先突破至"+gate.realm+"才能挑战守卫；当前地图小怪仍能继续刷取修为和灵石。");
  set("goalHint","进入"+gate.map+"后，先完成"+gate.realm+"突破，再继续挑战守卫。积累修为和抽取悟道的入口不会锁死。");
 }
 if(r.mapIndex===3&&!r.bossCleared&&!r.pills.D004){
  set("goalHint",gate?
   "先突破至"+gate.realm+"，同时提前准备筑基丹：丹道宝匣最多还需"+Math.max(1,c.realmPillPity-r.pillPity)+"抽。":
   "最终地图提示：击败Boss后筑基还需筑基丹，丹道宝匣保底最多还需"+Math.max(1,c.realmPillPity-r.pillPity)+"抽，可现在开始准备。");
 }
 const step=nextStep(s,c,lastCombatAnalysis);
 set("nextGoalTitle",step.title);set("nextGoalDesc",step.description);
 set("rightGoal",step.description);
 $("goalAction").dataset.view=step.view;
 if(step.packId)$("goalAction").dataset.packId=step.packId;else delete $("goalAction").dataset.packId;
 set("goalAction",step.action+" →");
 renderBuildAdvice();
 if(r.lastBattle){set("combatReport",r.lastBattle.won?"上场"+(r.lastBattle.type==="mob"?"小怪":"挑战")+"胜利 · "+r.lastBattle.turns+"回合":r.lastBattle.failureReason==="timeout"?"上场战斗僵持 · 未死亡":"上场挑战失败 · 留在当前关刷小怪");
  set("rewardLabel","◆ +"+fmt(r.lastBattle.stones)+" · 修为 +"+fmt(r.lastBattle.qi));
  const loss=r.lastBattle.lostGear,loot=r.lastBattle.boxes||[];
  set("combatLootResult",loss?"☠ 上次战败遗失："+(loss.name||"装备"):loot.length?"🎁 上场战利品："+loot.map(x=>x.name).join("、"):"本场战斗无额外宝箱");
 }
}
function renderCultivate(){
 const p=progress(s,c),req=breakthroughRequirements(s,c),r=s.run;
 set("realmName",p.realm.name);set("currentQi",fmt(r.qi));set("neededQi",fmt(req.qi));
 set("currentInsight",fmt(r.insight));set("neededInsight",fmt(req.insight));
 $("qiProgress").style.width=(Math.min(100,100*r.qi/req.qi))+"%";
 $("insightProgress").style.width=(Math.min(100,100*r.insight/req.insight))+"%";
 const needs=[];
 if(!req.hasQi)needs.push("修为不足");
 if(!req.hasInsight)needs.push("悟道不足，可抽修为造化");
 if(req.needsPill&&!req.hasPill)needs.push("缺少筑基丹（丹道8抽内保底）");
 if(req.needMapMilestone)needs.push("需通关当前地图");
 if(req.needBoss)needs.push("需通关雾隐剑冢");
 if(r.realmIndex>=4)needs.push("已达当前开放上限");
 set("realmGate",needs.length?needs.join(" · "):("可突破至"+c.realms[r.realmIndex+1]?.name));
 $("realmGate").classList.toggle("success",req.canBreak);
 $("breakthrough").disabled=!req.canBreak;
 setMarkup("realmRoute",c.realms.map((q,i)=>'<div class="realm-stage '+(i<r.realmIndex?"passed":i===r.realmIndex?"current":"")+'">'+escapeHTML(q.name)+'</div>').join(""));
}
function renderPacks(){
 const r=s.run,step=nextStep(s,c,lastCombatAnalysis);
 const focus=step.packId||(r.mapIndex===3&&r.realmIndex===3&&!r.pills.D004?'elixir':!Object.values(r.draws).some(n=>n>0)?'battle':null);
 const labels={battle:'提升攻击、气血与防御',wealth:'提高灵石收益',cultivation:'获得悟道与修为加成',technique:'解锁战斗流派',cave:'开启经营产线',pet:'灵宠协战与共鸣',elixir:'丹药与高级配方',equipment:'十槽装备',artifact:'本命法器'};
 set('gachaDirection',focus?'推荐 · '+c.packById[focus].name+' · '+labels[focus]:'选择你的机缘');
 const packCard=p=>{
  const price=packCost(s,c,p.id),count=r.draws[p.id]||0,unlocked=unlockedPack(s,c,p.id),canSingle=unlocked&&r.stones>=price,canTen=unlocked&&r.stones>=price*10;
  return '<article class="pack'+(p.id===focus?' is-recommended':'')+'" data-pack-id="'+p.id+'"><div class="packhead">'+pixelIcon(packIcons[p.id])+'<span class="packname">'+escapeHTML(p.name)+'</span><span class="packtag">'+(p.id===focus?'本章机缘':unlocked?count+'抽':'未开放')+'</span></div><p class="packpurpose">'+labels[p.id]+'</p><div class="packstats">'+(unlocked?(p.id==='elixir'?'筑基丹保底 '+Math.max(1,c.realmPillPity-r.pillPity)+' 抽':'含 '+p.cards.length+' 种机缘'):'主线 · '+storyUnlockHint(c,p.id))+'</div><div class="packactions"><button class="action-btn primary-action" data-draw="'+p.id+'" data-count="1" '+(canSingle?'':'disabled')+'>寻缘 <span>◆ '+fmt(price)+'</span></button><button class="action-btn" data-draw="'+p.id+'" data-count="10" '+(canTen?'':'disabled')+'>十连 <span>◆ '+fmt(price*10)+'</span></button></div></article>';
 };
 const groups=['基础成长','战斗构筑','洞府经营'];
 const available=c.packs.filter(p=>unlockedPack(s,c,p.id)),locked=c.packs.filter(p=>!unlockedPack(s,c,p.id));
 const lockedOpen=$('packList').querySelector('.locked-packs')?.open;
 setMarkup('packList',groups.map(group=>{const packs=available.filter(p=>c.management.groups[p.id]===group);return packs.length?'<section class="pack-group"><h3>'+group+'</h3><div class="pack-group-grid">'+packs.map(packCard).join('')+'</div></section>':''}).join('')+(locked.length?'<details class="quiet-disclosure locked-packs" '+(lockedOpen?'open':'')+'><summary>未开放卡包 <span>'+locked.length+'</span></summary><div class="pack-group-grid">'+locked.map(packCard).join('')+'</div></details>':''));
}
const inventoryMarkup=new Map();
function renderInventory(listId,effect,slot){
 const cards=Object.values(c.cards).filter(x=>x.effect===effect),owned=cards.filter(x=>s.run.cards[x.id]>0),missing=cards.filter(x=>!s.run.cards[x.id]);
 const item=card=>{
  const n=s.run.cards[card.id]||0,active=slot?s.run[slot]===card.id:false;
  return '<div class="v8-item '+(active?'active':n?'':'missing')+'" data-inventory-card="'+card.id+'" data-rarity="'+card.rarity+'"><div class="px-item-emblem">'+pixelIcon({technique:'book',pet:'fox',cave:'cave'}[effect])+'</div><div class="v8-item-name">'+escapeHTML(card.name)+'<span>×'+n+'</span></div><div class="v8-item-desc">'+escapeHTML(card.description||card.style||'自动生效')+'</div>'+growthDescription(card,n)+(slot?'<button data-equip="'+slot+'" data-card="'+card.id+'" '+(!n||active?'disabled':'')+'>'+(active?'已出战':n?'出战':'未发现')+'</button>':'<span class="core-status">'+(n?'自动生效':'未发现')+'</span>')+'</div>';
 };
 const content=(owned.length?'<div class="owned-cards">'+owned.map(item).join('')+'</div>':'<div class="collection-empty">'+pixelIcon({technique:'book',pet:'fox',cave:'cave'}[effect])+'<strong>尚未发现'+({technique:'功法',pet:'灵宠',cave:'洞府'}[effect])+'</strong><button class="action-btn" data-view="gacha">前往抽卡 ↗</button></div>')+(missing.length?'<details class="quiet-disclosure collection-missing"><summary>未发现 <span>'+missing.length+'</span></summary><div class="owned-cards">'+missing.map(item).join('')+'</div></details>':'');
 if(inventoryMarkup.get(listId)!==content){
  const node=$(listId),openMissing=node.querySelector('.collection-missing')?.open,openCards=[...node.querySelectorAll('.v10-growth[open]')].map(x=>x.closest('[data-inventory-card]').dataset.inventoryCard);
  node.innerHTML=content;inventoryMarkup.set(listId,content);
  if(openMissing&&node.querySelector('.collection-missing'))node.querySelector('.collection-missing').open=true;
  for(const id of openCards){const detail=node.querySelector('[data-inventory-card="'+id+'"] .v10-growth');if(detail)detail.open=true}
 }
}
function renderFate(){
 set("reincarnations",fmt(s.meta.reincarnations));set("fatePoints",fmt(s.meta.fate));set("bestMap","第"+s.meta.bestMap+"图");
 $("reincarnate").disabled=!s.run.bossCleared;
 $("openRelic").disabled=s.meta.fate<c.fate.price;
 const earned=55+Math.max(0,s.run.realmIndex-3)*10;
 set("reincarnationHint",s.run.bossCleared?'本世可得 '+earned+' 因果':'通关雾隐剑冢后开放轮回');
 set("reincarnationChoice",s.run.bossCleared&&s.run.realmIndex<4?'先突破筑基，可多得10因果。':s.run.bossCleared?'已完成筑基，可开启下一世。':'可提前选择两张传承机缘。');
 const regular=c.relics.map(x=>{
  const n=s.meta.relics[x.id]||0,amount=x.stat==="flatAttack"||x.stat==="flatHp"?"点":"%";
  return '<div class="v8-item '+(n?"":"missing")+'"><div class="v8-item-name">'+
   escapeHTML(x.name)+"<span>×"+n+"</span></div><div class='v8-item-desc'>"+
   (x.max==null?"永久无上限叠加":"最高"+x.max+"份（满级退出池）")+
   " · 单份 "+x.stat+" +"+x.value+amount+"</div></div>";
 }).join("");
 const apex=c.apex.map(x=>'<div class="v8-item '+(s.meta.apex?.[x.id]?"active":"missing")+'"><div class="v8-item-name">太古 · '+escapeHTML(x.name)+'</div><div class="v8-item-desc">'+
  (s.meta.apex?.[x.id]?"已拥有 · ":"十万分之一 · ")+escapeHTML(x.description)+'</div></div>').join("");
 const ultra=c.ultras.map(x=>'<div class="v8-item '+(s.meta.ultras[x.id]?"active":"missing")+'"><div class="v8-item-name">鸿蒙 · '+escapeHTML(x.name)+'</div><div class="v8-item-desc">'+
  (s.meta.ultras[x.id]?"已拥有 · ":"百万分之一 · ")+escapeHTML(x.description)+'</div></div>').join("");
 setMarkup("relicList",regular+apex+ultra);
}
function renderAtlas(){
 const card=m=>'<div class="v8-atlas-entry '+(m.index<=c.playableMaps?"playable":"")+'"><div><b>'+
   String(m.index).padStart(2,"0")+" "+escapeHTML(m.name)+'</b><small>'+
   escapeHTML(m.mechanicDescription)+" · Boss "+escapeHTML(m.boss.name)+'</small></div><span>'+
   (m.index>c.playableMaps?"规划中":m.index<=s.meta.bestMap?"已抵达":"可玩待解锁")+'</span></div>';
 setMarkup("mapAtlas",c.allMaps.slice(0,c.playableMaps).map(card).join(""));
 setMarkup("mapAtlasFuture",c.allMaps.slice(c.playableMaps).map(card).join(""));
}
function renderDetailPanels(){
 const keys=["explore","cultivate","gacha","technique","cave","pet","items","fate","atlas","settings"];
 const opened=keys.filter(key=>$(key)?.open);
 if(!opened.length)return;
 const model=detailModel(s,c,lastCombatAnalysis);
 for(const key of opened){
  const groups=model[key],parent=$("detail-"+key);if(!parent)continue;
  parent.innerHTML=groups.map(group=>
   '<section class="v8-detail-section"><h4>'+escapeHTML(group.title)+'</h4>'+
   '<dl class="v8-data-table">'+group.rows.map(item=>
    '<div class="v8-data-row"><dt>'+escapeHTML(item.label)+'</dt>'+
    '<dd>'+escapeHTML(item.value)+(item.note?'<small>'+escapeHTML(item.note)+'</small>':"")+'</dd></div>'
   ).join("")+'</dl>'+
   (group.note?'<p class="v8-detail-note">'+escapeHTML(group.note)+'</p>':"")+
   '</section>').join("");
 }
}
function render(){
 if(!c||!s)return;
 renderTop();renderExplore();renderNovice();renderCultivate();renderPacks();renderGuidance(s,c,view);
 renderInventory("techniqueList","technique","technique");
 renderInventory("caveList","cave",null);renderInventory("petList","pet","pet");
 renderItems();renderFate();renderAtlas();renderDetailPanels();renderPixelScene(s);renderManagement(s,c,fmt);renderStory(s,c);renderReturns(s);renderBuildRoadmap(s,c);
}
async function drawPack(packId,count){
 if(revealBusy)return;
 revealBusy=true;
 try{
  const before=heroStats(s,c),previousDraws=s.run.draws[packId]||0,previousCopies={...s.run.cards,...s.run.pills},previousKnown={...s.meta.knowledge.cards},result=doCommand("DRAW",{packId,count});
  if(!result)return;
  const after=heroStats(s,c);
  const items=result.items.map(x=>'<span class="v8-draw-card '+x.rarity+'">'+escapeHTML(x.name)+'</span>').join("");
  $("drawResults").innerHTML='<div>本次消耗灵石 '+fmt(result.cost)+'，获得：</div>'+items+
   '<div>攻击 '+fmt(before.attack)+' → '+fmt(after.attack)+' · 气血 '+fmt(before.hp)+' → '+fmt(after.hp)+
   ' · 悟道 '+fmt(s.run.insight)+' · 现存灵石 '+fmt(s.run.stones)+'</div>';
  const revealed=result.items.map(x=>({...x,description:cardRevelation(x,previousCopies[x.id]||0)}));
  const quick=$("quickReveal").checked&&previousDraws>0&&!noteworthyDraw(result.items,previousCopies,previousKnown);
  const promoted=result.items.filter(x=>['technique','pet','cave'].includes(x.effect)&&[3,6].some(n=>(previousCopies[x.id]||0)<n&&x.copies>=n)).sort((a,b)=>b.copies-a.copies)[0];
  const revealTitle=promoted?'命痕'+(promoted.copies>=6?'精通':'熟练')+' · '+promoted.name:previousDraws===0?'残卷初照 · '+c.packById[packId].name:count===10?"十道命痕 · 机缘相逢":"命痕相逢";
  if(!quick)await showReveal({packId,items:revealed,title:revealTitle});
  const impact=previousDraws===0?revealed[0].description:'已收下 '+result.items.length+' 张机缘';
  set('drawImpact',impact+' · 攻击 '+fmt(before.attack)+' → '+fmt(after.attack));$('drawImpact').hidden=false;
  toast(impact);renderStory(s,c);
 }finally{revealBusy=false}
}
function afterBattle(result){
 if(!result)return;
 set("combatReport",result.won?(result.type==="mob"?"本关小怪":"挑战")+"胜利 · "+result.combat.turns+"回合":result.combat.reason==="timeout"?"战斗僵持 · 未死亡不扣装备":"挑战失败 · 仍在当前关刷小怪");
 set("rewardLabel","◆ +"+fmt(result.stones)+" / 修为 +"+fmt(result.qi));
 const boxDrops=(result.boxes||[]).map(x=>x.name).join("、");
 $("combatLootResult").hidden=result.won&&!result.lostGear&&!result.boxes?.length;
 set("combatLootResult",result.lostGear?"☠ 战败遗失装备："+result.lostGear.name+"（已从持有量扣除）":
   boxDrops?"🎁 本次额外获得："+boxDrops+" · 前往道具行囊开箱":
   result.won?"本场仅获得灵石与修为；装备箱/药草箱为独立概率掉落":"挑战失败，未获得奖励");
 if(!result.won){
  const why=failureEvidence(result.combat,s.run.mapIndex);
  set("combatLootResult",$("combatLootResult").textContent+" · "+why.text);
  const action=document.createElement('button');action.className='text-action';action.dataset.view=why.view;action.textContent=why.action+' ↗';$('combatLootResult').append(action);
 }
 if(result.lostGear)toast("战败：遗失了 "+result.lostGear.name,true);
 settleLiveTimeline(result);
 if(result.won&&result.type==="boss")toast(result.bossCleared?"雾隐剑冢已通关！可以轮回或突破筑基。":"地图Boss已击败，下一张地图开放！");
 else if(result.combat.reason==="timeout")toast("战斗僵持：未死亡，不触发掉装惩罚。");
 else if(!result.won&&result.type!=="mob"&&!result.lostGear)toast("守卫仍很强。继续刷本关小怪进行抽卡成长。",true);
}
function stopAuto(){
 if(timer!==null)clearTimeout(timer);timer=null;
 const wasLive=livePreview;
 clearLiveTimeline();
 if(wasLive){battleBusy=false}
 const wasActive=auto;auto=false;
 if(wasActive&&s?.run?.idle?.active){
  const claim=doCommand("STOP_IDLE");
  if(claim?.attempts>1)toast("已结算 "+claim.wins+" 场小怪战斗，获得灵石 "+fmt(claim.stones));
 }
 $("intervalFill").classList.remove("running");renderTop();
}
function reportIdle(recovered){
 if(!recovered||recovered.attempts<1)return;
 set("combatReport","安全挂机已结算："+recovered.wins+"胜 / "+recovered.attempts+"战");
 set("rewardLabel","◆ +"+fmt(recovered.stones)+" / 修为 +"+fmt(recovered.qi));
 const found=[];
 if(recovered.gearBoxes)found.push("装备箱×"+recovered.gearBoxes);
 if(recovered.herbBoxes)found.push("药草箱×"+recovered.herbBoxes);
 if(recovered.potionsUsed)found.push("服药×"+recovered.potionsUsed);
 if(recovered.lostGear)found.push("☠ 遗失："+recovered.lostGear.name);
 if(found.length)set("combatLootResult","安全挂机记录："+found.join(" · "));
 if(recovered.attempts>1)toast("离线/后台安全刷怪 "+recovered.wins+"场，灵石 +"+fmt(recovered.stones)+"、修为 +"+fmt(recovered.qi));
 if(recovered.capped)toast("超过24小时离线上限的时间未计入收益");
 if(!recovered.active){auto=false;toast(recovered.failureReason==="timeout"?"战斗达到行动上限，挂机已暂停；没有死亡掉装。":recovered.lostGear?"挂机死亡 · 遗失 "+recovered.lostGear.name:"小怪挑战失败，安全挂机已暂停，进度没有倒退。",true)}
}
function schedule(){
 if(timer!==null)clearTimeout(timer);timer=null;
 if(!auto||pageHidden()||restoring||saveFailed||!session?.writable)return;
 const next=fight(s,c,"mob",{seed:s.seed});
 // Do not restart the countdown after rerender, resuming or an equipment change.
 const idle=s.run.idle;
 const elapsed=(idle?.carryMs||0)+Math.max(0,Date.now()-(idle?.at||Date.now()));
 const timeline=combatTimeline(next,elapsed);
 if(timeline.remainingMs===0){
  const recovered=doCommand("CLAIM_IDLE");
  if(!recovered){stopAuto();return}
  if(recovered.lastBattle)afterBattle(recovered.lastBattle);
  if(!recovered.active){auto=false;reportIdle(recovered);renderTop();return}
  timer=setTimeout(schedule,0);return;
 }
 set("fightTimer","本场 "+(next.timeMs/1000).toFixed(2)+"秒 · 攻击与扣血同步");
 const origin=idle.at-(idle.carryMs||0);
 startLiveTimeline(next,timeline,"auto",origin);
 timer=setTimeout(()=>{
  timer=null;if(!auto||pageHidden()||restoring||saveFailed||!session?.writable)return;
  advanceLiveClock();
  const summary=doCommand("CLAIM_IDLE");
  if(!summary){stopAuto();return}
  if(summary.lastBattle)afterBattle(summary.lastBattle);
  if(!summary.active){auto=false;reportIdle(summary);renderTop();return}
  if(autoPush&&!s.run.bossCleared&&!s.run.pendingBattle){
   const target=s.run.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
   if(!(target==="guardian"&&pendingRealmGate(s,c))){
    const risk=combatReport(target);
    if(risk.safeToAuto){
     // Stop the idle transaction before preparing a real-time Boss/guardian
     // encounter. The last idle fractional interval is safely banked.
     startManualBattle(target,true);
     return;
    }
   }
  }
  schedule();
 },Math.max(1,Math.ceil(origin+timeline.totalMs-Date.now())));
}
function startAuto(){
 if(auto){stopAuto();return}
 if(battleBusy||s.run.pendingBattle){toast("当前实时战斗尚未结束，不能重叠启动挂机。",true);return}
 const result=doCommand("START_IDLE");
 if(!result)return;
 auto=true;renderTop();schedule();toast("正在挂机刷当前关小怪；关闭页面后仅进行安全小怪离线结算");
}
function exportSave(){
 if(window.GachaAndroid?.exportSave){window.GachaAndroid.exportSave(JSON.stringify(s,null,2));return}
 const b=new Blob([JSON.stringify(s,null,2)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(b),link=document.createElement("a");link.href=url;
 link.download="gacha-ascension-v0.10-save.json";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
async function acceptImport(raw){
 try{
  if(restoring||saveFailed)throw Error('请先完成恢复或重新载入');session.assert();
  if(s.run.pendingBattle){toast("请等待当前战斗结束后导入存档",true);return}
  const candidate=parseImport(raw,c);
  if(!window.confirm("导入第"+(candidate.meta.reincarnations+1)+"世 · "+c.realms[candidate.run.realmIndex].name+"？当前进度会先备份，然后载入所选存档。"))return;
  importGame(raw,c,session.storage);clearTimeout(timer);clearTimeout(manualTimer);clearLiveTimeline();window.location.reload();
 }catch(error){toast("导入失败："+error.message,true)}
}
async function init(){
 try{
  const [w,p]=await Promise.all([
   fetch(new URL("../../data/realms-maps.v0.8.proposal.json",import.meta.url)).then(x=>{if(!x.ok)throw Error("地图数据加载失败");return x.json()}),
   fetch(new URL("../../data/v8-slice.json",import.meta.url)).then(x=>{if(!x.ok)throw Error("卡包配置加载失败");return x.json()})
  ]);
  c=loadCatalog(w,p);
  session=await openSession();
  window.addEventListener('pagehide',()=>session.close(),{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload()});
  $('retrySession').onclick=()=>window.location.reload();
  const loaded=readGame(c,session.storage,{readOnly:!session.writable});
  if(loaded.status==="invalid"){offerInvalidSaveRecovery(loaded.raw,loaded.message);set("saveStatus",loaded.message);return}
  s=loaded.state;
  $('exportSave').onclick=exportSave;
  if(loaded.status==='blocked'){saveFailed=true;sessionMessage(loaded.message+'。原档保留，请导出或重新载入。')}
  else if(session.writable){try{await recoverSession()}catch{ /* Keep navigation/export available after failed recovery. */ }}
  else sessionMessage(session.supported?'此页面只读：关闭其他游戏页面后，重新载入即可接管。':'浏览器不支持安全写入，请更新 Chrome 或 Android System WebView。');
  try{$("quickReveal").checked=localStorage.getItem(QUICK_REVEAL_KEY)==="1"}catch{}
  set("saveStatus",saveFailed?'恢复未提交 · 原档保留':!session.writable?'只读页面 · 不写入进度':loaded.status==="migrated"?"旧档已升级并备份":loaded.status==="restored"?"进度已恢复 · 自动保存":"新旅程已就绪 · 自动保存");
  render();
  $('muteSound').checked=isMuted();$('muteSound').onchange=event=>setMuted(event.target.checked);
  $('copyDiagnostics').onclick=async()=>{
   const summary=diagnosticSummary(s,{writer:session.writable,restoring,saveFailed,platformAllowed:platformAllowed()});
   const raw=JSON.stringify(summary,null,2);$('diagnosticText').value=raw;$('diagnosticText').hidden=false;
   try{await navigator.clipboard.writeText(raw);toast('已复制脱敏诊断，请由你决定是否提交')}catch{toast('诊断已显示，可长按复制')}
  };
  $('sendFeedback').onclick=()=>{if(window.GachaAndroid?.openFeedback)window.GachaAndroid.openFeedback();else window.open('https://github.com/Tera-Dark/Gacha-Ascension/issues/new','_blank','noopener')};
  document.addEventListener('pointerdown',unlockAudio,{passive:true});
  $('openReturns').onclick=$('reviewReturn').onclick=()=>$('returnLedger').showModal();
  $('ackReturn').onclick=()=>{const row=s.meta.returns[0];if(row)doCommand('ACK_RETURN',{id:row.id})};
  for(const detail of document.querySelectorAll("details.v8-disclosure")){
   detail.addEventListener("toggle",()=>{
    if(detail.open)renderDetailPanels();
    else if(detail.id&&$("detail-"+detail.id))$("detail-"+detail.id).replaceChildren();
   });
  }
  $("moreSystems").addEventListener("click",toggleMobileSheet);
  $("landscapeNavToggle").addEventListener("click",()=>document.body.classList.contains("wb-nav-open")?closeLandscapeNav():openLandscapeNav());
  $("landscapeBackdrop").addEventListener("click",closeLandscapeNav);
  $("openGearBag").addEventListener("click",()=>changeView("items"));
  $("closeEquipment").addEventListener("click",closeGear);
  let swipe=null;
  document.addEventListener("touchstart",event=>{const t=event.touches[0];swipe=t.clientX<24?{x:t.clientX,y:t.clientY}:null},{passive:true});
  document.addEventListener("touchend",event=>{if(!swipe)return;const t=event.changedTouches[0],dx=t.clientX-swipe.x,dy=Math.abs(t.clientY-swipe.y);if(dx>65&&dy<45)openLandscapeNav();swipe=null},{passive:true});
  $("noviceAction").addEventListener("click",()=>{
   const stage=noviceStep(s);if(!stage)return;
   changeView(stage.view);
   if(stage.packId){
    const first=document.querySelector('[data-pack-id="'+stage.packId+'"] button[data-count="1"]');
    first?.scrollIntoView({behavior:"auto",block:"center"});first?.focus({preventScroll:true});
   }else if(stage.index===2){
    if(!auto&&!battleBusy)startAuto();
    $("autoFarm")?.scrollIntoView({behavior:"auto",block:"center"});
   }else if(stage.target){
    const button=$(stage.target);
    button?.scrollIntoView({behavior:"auto",block:"center"});
    button?.focus({preventScroll:true});
   }
  });
  $("noviceSkip").addEventListener("click",()=>{
   try{localStorage.setItem(NOVICE_SKIP_KEY,"1")}catch{}
   render();
   toast("已跳过入门指引，随时可按修行目标继续游戏。");
  });
  $("quickReveal").addEventListener("change",event=>{
   try{localStorage.setItem(QUICK_REVEAL_KEY,event.target.checked?"1":"0")}catch{}
   toast(event.target.checked?"普通重复机缘已启用快捷揭晓，首次和高品质仍保留仪式。":"已恢复完整的机缘揭晓演出。");
  });
  $("closeMobileSheet").addEventListener("click",closeMobileSheet);
  $("mobileSheetBackdrop").addEventListener("click",closeMobileSheet);
  document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(dismissReveal())return;closeMobileSheet();closeLandscapeNav();closeGear()});
  document.addEventListener("click",e=>{
   const main=e.target.closest('button[data-main]');
   if(main){
    if(main.dataset.main==='explore'){if(!auto)startAuto()}
    else{if(auto)stopAuto();doCommand('START_ACTIVITY',{activity:main.dataset.main,herb:main.closest('#productionPanel')?$('brewHerb').value:$('gatherHerb').value})}
    return;
   }
   const task=e.target.closest('button[data-remove-task]');
   if(task){doCommand('REMOVE_BREW',{index:Number(task.dataset.removeTask)});return}
   const node=e.target.closest('button[data-learn-dao]');
   if(node){doCommand('LEARN_DAO',{id:node.dataset.learnDao});return}

   const artifactSlot=e.target.closest("button[data-artifact-slot]");
   if(artifactSlot&&!artifactSlot.disabled){openArtifact(artifactSlot.dataset.artifactSlot);return}
   const artifactChoice=e.target.closest("button[data-select-artifact]");
   if(artifactChoice&&!artifactChoice.disabled){
    const id=artifactChoice.dataset.selectArtifact==="none"?null:artifactChoice.dataset.selectArtifact;
    const result=doCommand("EQUIP_ARTIFACT",{slot:selectedArtifactSlot,id});
    if(result){drawArtifactBag();toast("本命法器已装配，战斗增益即时生效")}
    return
   }
   const box=e.target.closest("button[data-open-box]");
   if(box&&!box.disabled){
    const result=doCommand("OPEN_BOX",{id:box.dataset.openBox});
    if(result)toast("开启宝箱："+result.reward.name+" ×"+result.reward.count);
    return
   }
   const brew=e.target.closest("button[data-brew]");
   if(brew&&!brew.disabled){
    const result=doCommand("BREW",{id:brew.dataset.brew,count:1});
    if(result)toast("已加入丹炉排程，药草在实际炼制时消耗。");
    return
   }
   const prep=e.target.closest("button[data-prepare-item]");
   if(prep&&!prep.disabled){
    const result=doCommand("PREPARE_ITEM",{id:prep.dataset.prepareItem});
    if(result)toast("已准备"+ITEMS.find(x=>x.id===result.id)?.name+"，在下一场战斗中生效");
    return
   }
   const gearSlot=e.target.closest("button[data-gear-slot]");
   if(gearSlot){openGear(gearSlot.dataset.gearSlot);return}
   const gearChoice=e.target.closest("button[data-select-gear]");
   if(gearChoice&&!gearChoice.disabled){
    const id=gearChoice.dataset.selectGear==="none"?null:gearChoice.dataset.selectGear;
    const old=heroStats(s,c),result=doCommand("EQUIP_ITEM",{slot:selectedGearSlot,id});
    if(result){const next=heroStats(s,c);drawGearBag();toast("穿戴已生效 · 攻击 "+fmt(old.attack)+" → "+fmt(next.attack)+"，气血 "+fmt(old.hp)+" → "+fmt(next.hp))}
    return
   }
   const mapInfo=e.target.closest("button[data-map-info]");
   if(mapInfo){const i=Number(mapInfo.dataset.mapInfo);toast(i===s.run.mapIndex?"当前正在探索此地图":c.maps[i].name+"已解锁。此版本仅在当前推进位置继续战斗。");return}
   const stageInfo=e.target.closest("button[data-stage-info]");
   if(stageInfo){const i=Number(stageInfo.dataset.stageInfo);toast(i===s.run.checkpoint?"当前第"+(i+1)+"关":i<s.run.checkpoint?"已通过的守卫关卡，当前无法回退刷关":"请先击败前面的守卫。");return}
   const nav=e.target.closest("button[data-view]");
   if(nav){
     const goal=nav.id==="goalAction";
     const pack=goal?nav.dataset.packId:null,action=goal?nav.textContent:"";
     changeView(nav.dataset.view);
     if(pack)document.querySelector('[data-pack-id="'+pack+'"]')?.scrollIntoView({behavior:"auto",block:"nearest"});
     if(goal&&nav.dataset.view==="explore"){
      const id=action.includes("前往挑战")?(s.run.checkpoint===c.checkpointsPerMap-1?"challengeBoss":"challenge"):
       action.includes("战前推演")?"analyzeBuild":action.includes("刷怪")?"autoFarm":null;
      if(id){let parent=$(id)?.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement}$(id)?.scrollIntoView({behavior:"auto",block:"center"});$(id)?.focus({preventScroll:true})}
     }
     return}
   const draw=e.target.closest("button[data-draw]");
   if(draw&&!draw.disabled){drawPack(draw.dataset.draw,Number(draw.dataset.count));return}
   const equip=e.target.closest("button[data-equip]");
   if(equip&&!equip.disabled){const slot=equip.dataset.equip;const result=doCommand(slot==="pet"?"EQUIP_PET":"EQUIP_TECH",{id:equip.dataset.card});
    if(result)toast("装配成功，下一次战斗即刻生效。");}
  });
  $('toggleField').addEventListener('click',()=>doCommand('SET_FIELD',{enabled:!s.run.world.field.enabled,herb:$('fieldHerb').value}));
  $('queueBrew').addEventListener('click',()=>doCommand('QUEUE_BREW',{herb:$('brewHerb').value,mode:$('brewMode').value,amount:Number($('brewAmount').value)}));
  $('claimDirected').addEventListener('click',()=>{const r=doCommand('CLAIM_DIRECTED',{id:$('directedCard').value});if(r)toast('定向机缘已获得：'+r.card.name)});
  $('inheritanceChoices').addEventListener('change',event=>{
   const ids=[...document.querySelectorAll('[data-inherit]:checked')].map(x=>x.dataset.inherit);
   if(!doCommand('SET_INHERITANCE',{ids}))event.target.checked=!event.target.checked;
  });
  setInterval(tickWorld,5000);
  $("unlockAutoPotion").addEventListener("click",()=>{
   const result=doCommand("UNLOCK_AUTO_POTION");
   if(result)toast("已永久解锁回春自律 · 因果 -"+result.spent);
  });
  $("toggleAutoPotion").addEventListener("click",()=>{
   const old=s.meta.autoPotion;
   if(!old?.unlocked)return;
   const result=doCommand("SET_AUTO_POTION",{enabled:!old.enabled,threshold:Number($("autoPotionThreshold").value)});
   if(result)toast(result.enabled?"自动吃药已开启":"自动吃药已关闭");
  });
  $("autoPotionThreshold").addEventListener("change",event=>{
   if(!s.meta.autoPotion?.unlocked)return;
   doCommand("SET_AUTO_POTION",{enabled:s.meta.autoPotion.enabled,threshold:Number(event.target.value)});
  });
  $("analyzeBuild").addEventListener("click",()=>{
   if(battleBusy||s.run.bossCleared)return;
   const kind=s.run.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
   buildAdvice=recommendLoadout(s,c,kind);
   renderBuildAdvice();
   toast("已模拟对比 "+buildAdvice.combinations+" 套已持有构筑");
  });
  $("equipSuggestedBuild").addEventListener("click",()=>{
   if(!buildAdvice?.improved||battleBusy)return;
   const chosen=buildAdvice.best;
   if(auto)stopAuto();
   const applied=doCommand("EQUIP_LOADOUT",{technique:chosen.technique,pet:chosen.pet});
   if(applied)toast("功法与灵宠已联合装配，战斗增益即时生效");
  });
  $("autoFarm").addEventListener("click",startAuto);
  $("killMob").addEventListener("click",()=>startManualBattle("mob"));
  $("challenge").addEventListener("click",()=>startManualBattle("guardian"));
  $("challengeBoss").addEventListener("click",()=>startManualBattle("boss"));
  $("autoPush").addEventListener("click",()=>{autoPush=!autoPush;render();toast("自动冲关已"+(autoPush?"开启，战斗风险评估通过才进行挑战。":"关闭。"))});
  $("farmFocus").addEventListener("change",event=>{
   const result=doCommand("SET_FARM_FOCUS",{id:event.target.value});
   if(result)toast("已将当前关小怪调整为："+farmTarget(s,c).name+"。进度保持不变。");
  });
  $("breakthrough").addEventListener("click",()=>{const r=doCommand("BREAKTHROUGH");if(r){toast("突破成功："+r.name+"！");changeView("cultivate")}});
  $("reincarnate").addEventListener("click",()=>{
   const earned=55+Math.max(0,s.run.realmIndex-3)*10;
   const alternative=s.run.realmIndex<4?"\n注意：先筑基再轮回能额外获得10因果，并凑足40因果遗物箱＋25因果自动服药。":"";
   const preview=reincarnationPreview(s,c);
   if(!window.confirm("确定轮回获得"+earned+"因果？\n清空："+preview.cleared+"。\n保留："+preview.kept+"。\n传承："+(preview.inheritance.map(x=>x.name).join("、")||"未选择")+"，每张"+preview.copies+"份。\n已修过境界所需修为降至60%。"+alternative))return;
   stopAuto();const r=doCommand("REINCARNATE");if(r){toast("轮回成功！获得"+r.earned+"因果，永久遗物继续生效。");changeView("fate")}});
  $("openRelic").addEventListener("click",async()=>{
   if(revealBusy)return;
   revealBusy=true;
   try{
    const r=doCommand("OPEN_RELIC");if(!r)return;
    $("relicResult").innerHTML='常规：<strong>'+escapeHTML(r.relic.name)+'</strong> ×'+r.stacks+
     (r.apex?'<div class="v8-draw-card tian">太古奇珍：'+escapeHTML(r.apex.name)+'</div>':"")+
     (r.ultra?'<div class="v8-draw-card tian">鸿蒙异宝：'+escapeHTML(r.ultra.name)+'</div>':"");
    const items=[{...r.relic,rarity:r.rarity,description:r.relic.max==null?"无上限永久叠加":"永久遗物 ×"+r.stacks}];
    if(r.apex)items.push({...r.apex,rarity:"taigu"});
    if(r.ultra)items.push({...r.ultra,rarity:"hongmeng"});
    await showReveal({packId:"fate",items,title:r.ultra?"鸿蒙降世":r.apex?"太古奇珍":"天命遗物"});
    toast("天命箱已结算，永久加成保留至下一世");
   }finally{revealBusy=false}
  });
  $("importSave").addEventListener("click",()=>{
   if(s.run.pendingBattle){toast("请等待当前战斗结束后导入存档",true);return}
   if(window.GachaAndroid?.selectSave)window.GachaAndroid.selectSave();else $("importSaveFile").click();
  });
  $("importSaveFile").addEventListener("change",async event=>{const file=event.target.files[0];if(file){if(file.size>2*1024*1024)toast("存档文件需小于2MB",true);else await acceptImport(await file.text())}event.target.value=""});
  window.addEventListener("gacha:import",event=>{if(typeof event.detail==='string')acceptImport(event.detail)});
  $("resetSave").addEventListener("click",()=>{if(!session?.writable||restoring||saveFailed)return;if(!window.confirm("确认备份当前v0.8存档并从炼气初期重开？旧版存档不会被修改。"))return;
   try{stopAuto();s=backupAndReset(c,session.storage);try{localStorage.removeItem(NOVICE_SKIP_KEY)}catch{}set("saveStatus","已备份旧存档并重新开始");render();changeView("explore")}catch(error){saveFailed=true;pausePlayback();sessionMessage("备份或保存失败："+error.message+"。原档保留，请重新载入。")}});
  const syncVisibility=async()=>{
   // Pausing audio/playback must also work for read-only tabs and after a
   // failed save; those pages otherwise keep playing in the background.
   if(pageHidden()){pausePlayback();pauseAudio(true);return}
   pauseAudio(false);
   if(!session?.writable||saveFailed)return;
   if(restoring)return;
   try{await recoverSession()}catch{return}
   if(pageHidden())return;
   if(s.run.pendingBattle){scheduleManual();return}
   auto=!!s.run.idle?.active;if(auto)schedule();else renderTop();
  };
  document.addEventListener("visibilitychange",syncVisibility);
  window.addEventListener("gacha:visibility",event=>{if(typeof event.detail?.hidden==='boolean'){hostHidden=event.detail.hidden;syncVisibility()}});
  window.addEventListener("gacha:back",()=>{
   let handled=true;
   const help=$("moduleHelp"),map=$("explorationMap");
   if(dismissReveal()){window.GachaAndroid?.backHandled(true);return}
   if($('returnLedger').open)$('returnLedger').close();else if($("storyConversation").open)$("storyConversation").close();else if($("cultivationGuide").open)$("cultivationGuide").close();else if($("combatOptions").open)$("combatOptions").close();else if(help.open)help.close();else if(map.open)map.close();else if(!$("equipmentDrawer").hidden)closeGear();
   else if(document.body.classList.contains("wb-nav-open"))closeLandscapeNav();else if(!$("mobileSheet").hidden)closeMobileSheet();
   else if(view!=="explore")changeView("explore");else handled=false;
   window.GachaAndroid?.backHandled(handled);
  });
  if(session.writable&&s.run.pendingBattle){
   // A crashed or refreshed tab retains the pending encounter, without
   // granting rewards or changing its RNG seed before the last hit.
   scheduleManual();
  }else if(session.writable&&s.run.idle?.active){
   auto=true;
   const resumed=doCommand("CLAIM_IDLE");
   reportIdle(resumed);
   if(auto){renderTop();schedule()}
  }
 }catch(error){toast("初始化失败："+error.message,true);set("saveStatus",error.stack||error.message)}
}
loadPixelAssets().then(()=>{if(s)renderPixelScene(s)});
initPixelUI();
mountManagement();
mountHelp(()=>view);
mountGuidance(changeView);
mountStory(goToStoryObjective,()=>nextStep(s,c,lastCombatAnalysis));
mountBank({command:doCommand,navigate:changeView,notify:toast});
requestAnimationFrame(presentationFrame);
init();
