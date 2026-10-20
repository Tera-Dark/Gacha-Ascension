import {loadCatalog,createSave,dispatch,heroStats,yields,progress,breakthroughRequirements,enemyPreview,combatSnapshot,fight,combatAssessment,combatLabels,packCost,farmTarget} from "./engine.mjs";
import {readGame,writeGame,backupAndReset,recoverInvalidSave} from "./storage.mjs";
import {detailModel} from "./details.mjs";
import {showReveal} from "./reveal.mjs";
import {unlockedPack} from "./modules.mjs";
import {EQUIPMENT_SLOTS,equippedMap,equipmentStats,comparison,STAT_LABELS} from "./equipment.mjs";
import {RULES} from "./combat-depth.mjs";
import {ARTIFACT_SLOTS,ARTIFACT_EFFECTS,artifactsOwned,artifactBonuses} from "./artifacts.mjs";
import {BOXES,HERBS,ITEMS,inventory,AUTO_POTION_COST} from "./treasure.mjs";
import {PAIR_SYNERGIES,activeSynergy} from "./synergy.mjs";
import {recommendLoadout,nextStep} from "./advisor.mjs";
import {combatTimeline} from "./combat-timeline.mjs";
import {noviceStep} from "./onboarding.mjs";
const $=id=>document.getElementById(id),fmt=n=>{
 if(!Number.isFinite(n))return "—";
 const a=Math.abs(n);
 return a>=1e12?(n/1e12).toFixed(2)+"兆":a>=1e8?(n/1e8).toFixed(2)+"亿":a>=1e4?(n/1e4).toFixed(2)+"万":Math.round(n).toLocaleString("zh-CN");
};
const escapeHTML=t=>String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const majors=["凡尘炼气","地脉筑基","丹成沧海","雷穹元婴","太虚化神"];
let c,s,view="explore",auto=false,autoPush=false,timer=null,playToken=0,renderToken=0,toastTimer=null,battleBusy=false,lastCombatAnalysis=null,revealBusy=false,selectedGearSlot="weapon1",selectedArtifactSlot=null,buildAdvice=null,liveTimers=[],livePreview=false,suggestedGearSlot=null;
const NOVICE_SKIP_KEY="gacha-ascension-v8-novice-skip-v1";
const QUICK_REVEAL_KEY="gacha-ascension-v8-quick-reveal-v1";
const set=(id,text)=>{const e=$(id);if(e)e.textContent=text};
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
   const result=recoverInvalidSave(c);
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
 $("moreSystems").classList.toggle("is-active",["technique","cave","pet","items","atlas","settings"].includes(target));
 const panel=document.querySelector('[data-view-panel="'+target+'"]');if(panel)panel.scrollTop=0;
 render();
}
function doCommand(type,more={}){
 if(!s||!c)return null;
 try{
  const resync=auto&&s.run.idle?.active&&!["START_IDLE","CLAIM_IDLE","STOP_IDLE","BATTLE"].includes(type);
  const out=dispatch(s,c,{type,seq:s.seq+1,now:Date.now(),...more});
  writeGame(out.state,c);s=out.state;buildAdvice=null;render();
  // A card or equipment change alters the next deterministic fight.
  if(resync)schedule();
  return out.result;
 }catch(error){toast(error.message,true);return null}
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
 $("artifactGrid").innerHTML=ARTIFACT_SLOTS.map(slot=>{
  const open=s.run.realmIndex>=slot.realmIndex,card=c.cards[equipped[slot.id]];
  return '<button type="button" class="wb-artifact-slot'+(card?" active":"")+'" data-artifact-slot="'+slot.id+'"'+(open?"":" disabled")+
   '><strong>✧ '+slot.name+'</strong><small>'+escapeHTML(open?card?.name||"空 · 点击穿戴":"境界未达成 · 待解锁")+'</small></button>';
 }).join("");
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
 $("equipmentDrawer").hidden=false;
 drawArtifactBag();
 $("closeEquipment").focus();
}
function renderItems(){
 const r=s.run,boxes=r.boxes||{},herbs=r.herbs||{},items=r.consumables||{},prepared=r.prepared||{};
 $("boxInventory").innerHTML=BOXES.map(box=>'<div class="wb-inventory-item"><div><b>'+box.name+' ×'+(boxes[box.id]||0)+'</b><small>'+
 escapeHTML(box.desc)+'</small></div><button data-open-box="'+box.id+'" '+((boxes[box.id]||0)?"":"disabled")+'>开启</button></div>').join("");
 $("herbInventory").innerHTML=HERBS.map(herb=>'<div class="wb-inventory-item"><div><b>'+herb.name+' ×'+(herbs[herb.id]||0)+'</b><small>'+herb.desc+'</small></div>'+
 '<button data-brew="'+herb.id+'" '+((herbs[herb.id]||0)>=3?"":"disabled")+'>炼1颗药</button></div>').join("");
 $("consumableInventory").innerHTML=ITEMS.map(item=>'<div class="wb-inventory-item"><div><b>'+item.name+' ×'+(items[item.id]||0)+'</b><small>'+item.desc+' · 已备战'+(prepared[item.id]||0)+'</small></div>'+
 '<button data-prepare-item="'+item.id+'" '+((items[item.id]||0)&&((prepared[item.id]||0)<3)?"":"disabled")+'>下场备战</button></div>').join("");
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
 suggestedGearSlot=upgrades[0]?.slot||null;
 const slots=new Set(upgrades.map(x=>x.slot));
 set("openGearBag",slots.size?"打开背包 · "+slots.size+"槽可提升 ›":"打开背包 ›");
 $("equipmentGrid").innerHTML=EQUIPMENT_SLOTS.map(slot=>{
  const id=equipment[slot.id],card=id?c.cards[id]:null;
  return '<button class="wb-gear-slot'+(card?" filled":"")+(slots.has(slot.id)?" can-upgrade":"")+'" type="button" data-gear-slot="'+slot.id+'" aria-label="'+
    escapeHTML(slot.name+(card?" "+card.name:" 空槽"))+'"><span class="wb-gear-icon">'+slot.icon+'</span>'+
    '<span class="wb-gear-caption">'+escapeHTML(slot.name)+'</span>'+
    '<span class="wb-gear-name">'+escapeHTML(card?.name||"空")+'</span></button>';
 }).join("");
}
function openGear(slot){
 selectedArtifactSlot=null;
 selectedGearSlot=slot;
 $("equipmentDrawer").hidden=false;
 drawGearBag();
 $("closeEquipment").focus();
}
function closeGear(){
 $("equipmentDrawer").hidden=true;
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
 if(isMiss||isHeal)return;
 const src=$(toHero?"heroSprite":"enemySprite");
 src.classList.remove("impact");void src.offsetWidth;src.classList.add("impact");
 setTimeout(()=>src.classList.remove("impact"),220);
}
/** All combat modes share one chronological event-to-HP renderer. */
function showHitEvent(event,combat,withEffects=true){
 if(event.actor==="wave"){
  set("enemyLabel",event.name+" · 第"+event.stage+"/"+event.total+"波");
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
  event.actor==="potion"?"回春丹：紧急恢复气血":
  event.actor==="regen"?"敌方恢复":
  event.actor==="pet"?"灵宠协战":
  event.actor==="counter"?"敌方反震":
  event.actor==="enemy"&&event.blocked>0&&event.amount===0?"护盾完全格挡":
  toHero?"敌方命中 · 气血减少":"我方命中 · 敌方气血减少");
}
function clearLiveTimeline(){
 for(const id of liveTimers)clearTimeout(id);
 liveTimers=[];livePreview=false;
}
function startLiveTimeline(combat,plan){
 clearLiveTimeline();
 const token=++playToken;
 livePreview=true;battleBusy=true;
 snapshot("heroHP","heroBar",combat.hero.hp,combat.hero.hp);
 const first=combat.waves?.[0]||combat.enemy;
 snapshot("enemyHP","enemyBar",first.hp,first.hp);
 set("enemyLabel",first.name);
 set("combatStatus","自动交锋进行中 · 每次命中即时显示伤害");
 $("heroAttackBar").style.animationPlayState="running";
 $("enemyAttackBar").style.animationPlayState="running";
 // Seeking after resume or a build change does not repeat past damage pops.
 for(const event of plan.past)showHitEvent(event,combat,false);
 for(const event of plan.future){
  liveTimers.push(setTimeout(()=>{
   if(token!==playToken||!auto||!s.run.idle?.active)return;
   showHitEvent(event,combat,true);
  },event.delayMs));
 }
}
function settleLiveTimeline(result){
 const hadLive=livePreview;
 clearLiveTimeline();
 if(hadLive)++playToken;
 battleBusy=false;
 const {combat}=result;
 snapshot("heroHP","heroBar",combat.heroRemaining,combat.hero.hp);
 snapshot("enemyHP","enemyBar",combat.enemyRemaining,combat.enemy.hp);
 set("enemyLabel",combat.enemy.name);
 set("combatStatus",result.won?"✓ 战斗胜利 · 每次攻击已即时呈现":combat.reason==="timeout"?"⌛ 战斗僵持 · 没有死亡掉装":"✕ 战斗失败 · 战斗结算已完成");
 if(result.won){
  $("enemySprite").classList.add("defeated");
  setTimeout(()=>$("enemySprite").classList.remove("defeated"),320);
 }
}
function animateCombat(result,onComplete=null){
 clearLiveTimeline();
 playToken++;const token=playToken,{combat}=result,logs=combat.logs||[];
 if(view!=="explore"){battleBusy=false;onComplete?.();return}
 battleBusy=true;
 snapshot("heroHP","heroBar",combat.hero.hp,combat.hero.hp);
 const first=combat.waves?.[0]||combat.enemy;
 snapshot("enemyHP","enemyBar",first.hp,first.hp);
 set("enemyLabel",first.name);
 // During a settled guardian/Boss replay, show the source map until the replay ends.
 if(result.type!=="mob"){
  const previous=c.maps[result.mapBefore];
  if(previous){
   set("mapName",previous.name);
   set("mapFlavor","战斗回放 · 第"+(result.checkpointBefore+1)+"/"+c.checkpointsPerMap+"关 · "+previous.mechanicDescription);
   set("mapBoss","本场Boss："+previous.boss.name);
   set("checkpointCount","正在回放已结算的战斗");
  }
 }
 set("combatStatus",combat.synergy?"✦ 共鸣生效："+combat.synergy.name:"逐次交锋 · 每次攻击独立扣血");
 $("heroAttackBar").style.animationPlayState="running";
 $("enemyAttackBar").style.animationPlayState="running";
 const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
 const duration=reduced?Math.min(700,Math.max(100,logs.length*12)):
  Math.min(11000,Math.max(1400,logs.length*140));
 const full=Math.max(1,combat.timeMs||1);
 logs.forEach((event,index)=>{
  const relative=Math.min(1,Math.max(0,(event.timeMs||0)/full));
  const ms=reduced?Math.round(index/(logs.length||1)*duration):
   Math.min(duration-20,Math.floor(relative*duration));
  setTimeout(()=>{
   if(playToken!==token||view!=="explore")return;
   showHitEvent(event,combat,!reduced);
  },Math.max(10,ms));
 });
 setTimeout(()=>{
  if(playToken!==token)return;
  snapshot("heroHP","heroBar",combat.heroRemaining,combat.hero.hp);
  snapshot("enemyHP","enemyBar",combat.enemyRemaining,combat.enemy.hp);
  battleBusy=false;
  set("enemyLabel",combat.enemy.name);
  set("combatStatus",result.won?"✓ 连续"+combat.totalWaves+"波胜利":
   combat.reason==="timeout"?"⌛ 行动达到上限 · 战斗未分胜负":
   "✕ 挑战失败 · 第"+Math.min(combat.totalWaves,combat.completedWaves+1)+"波");
  if(result.won){
   $("enemySprite").classList.add("defeated");
   setTimeout(()=>$("enemySprite").classList.remove("defeated"),320);
  }
  if(!auto){$("heroAttackBar").style.animationPlayState="paused";$("enemyAttackBar").style.animationPlayState="paused"}
  // Only re-render the new map after successful guardian/Boss progression.
  if(result.won&&result.type!=="mob")render();
  onComplete?.();
 },duration+100);
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
 set("topRealm",h.name);set("topNextRealm",r.realmIndex===4?"本切片最高可达筑基初期":"下一阶段 "+c.realms[r.realmIndex+1].name);
 set("topStone",fmt(r.stones));set("topStoneRate","灵石收益 +"+fmt(y.stonePct)+"%");
 set("topQi",fmt(r.qi));set("topQiNeed","突破需 "+fmt(p.realm.nextQiCost));
 set("topMap",String(r.mapIndex+1).padStart(2,"0")+" / 04");
 set("topStage",p.map.name+" · 第"+p.stage+"关");
 set("heroLabel","修士·"+h.name);
 set("heroStats","攻击 "+fmt(h.attack)+" · 防御 "+fmt(h.defense));
 set("playerStatsCompact","气血 "+fmt(h.hp)+" · 装备攻速 +"+fmt(equipmentStats(s,c).speedPct)+"%");
 set("heroAttackSpeed","出手间隔 "+(RULES.heroIntervalMs/(1+y.speedPct/100)/1000).toFixed(2)+"秒");
 $("heroAttackBar").style.animationDuration=(RULES.heroIntervalMs/(1+y.speedPct/100))+"ms";
 $("heroAttackBar").style.animationPlayState=auto||battleBusy?"running":"paused";
 $("enemyAttackBar").style.animationPlayState=auto||battleBusy?"running":"paused";
 set("wbTechnique",r.technique?c.cards[r.technique].name:"未习得");
 set("wbPet",r.pet?c.cards[r.pet].name:"未出战");
 set("sideAtk",fmt(h.attack));set("sideHp",fmt(h.hp));set("sideDef",fmt(h.defense));
 set("sideTech",r.technique?c.cards[r.technique].name:"未装备");
 set("sidePet",r.pet?c.cards[r.pet].name:"未出战");
 set("sideStone","+"+fmt(y.stonePct)+"%");
 set("sideQi","+"+fmt(y.qiPct)+"%");
 set("rightGoal",r.bossCleared?"雾隐剑冢最终Boss已击败，可以突破筑基或选择轮回。":
   "第"+p.stage+"关小怪可无限刷取。守卫失败不退层，强化后再挑战"+(p.finalGuardian?"地图Boss。":"守卫。"));
 set("autoStatus",auto?"● 自动刷怪"+(autoPush?" · 允许推关":""):"○ 待命");
 const label=$("autoFarm");label.textContent=auto?"Ⅱ 停止自动刷怪":"▶ 自动刷本关小怪";
 set("autoPush","自动冲关："+(autoPush?"开":"关"));
}
function renderBuildAdvice(){
 const pair=activeSynergy(s),r=s.run;
 set("synergyLabel",pair?"✦ "+pair.name:"尚无双修共鸣");
 set("synergyHint",pair?pair.description:
  "指定功法与灵宠出战可触发共鸣。打开功法或御兽面板查看每个组合及效果。");
 const target=r.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
 $("analyzeBuild").disabled=r.bossCleared||battleBusy;
 const apply=$("equipSuggestedBuild");
 apply.hidden=true;apply.disabled=true;
 if(r.bossCleared){set("buildAdvice","四图已经通关，当前无需守关推演。");return}
 if(!buildAdvice||buildAdvice.kind!==target){
  set("buildAdvice","对已持有的功法和灵宠用相同的16组种子模拟守关；不消耗资源，也不会读取下一场实际战斗结果。");
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
 set("noviceTitle",stage.title);set("noviceDescription",stage.description);
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
 $("challenge").disabled=p.finalGuardian||r.bossCleared||(battleBusy&&!auto)||r.realmIndex<r.mapIndex;
 $("challengeBoss").disabled=!p.finalGuardian||r.bossCleared||(battleBusy&&!auto);
 $("killMob").disabled=auto||battleBusy;
 set("mobStone","+"+fmt(inc.stones));set("mobQi","+"+fmt(inc.qi));
 $("farmFocus").value=s.run.farmFocus||"balanced";
 set("farmFocusTip",farmTarget(s,c).desc);
 const foe=combatSnapshot(s,c,r.bossCleared?"mob":p.finalGuardian?"boss":"guardian").enemy;
 const live=combatSnapshot(s,c,"mob");
 const attackMs=RULES.heroIntervalMs/(1+live.heroSpeedPct/100);
 set("heroAttackSpeed","出手间隔 "+(attackMs/1000).toFixed(2)+"秒");
 $("heroAttackBar").style.animationDuration=attackMs+"ms";
 set("heroStats","攻击 "+fmt(live.hero.attack)+" · 防御 "+fmt(live.hero.defense));
 set("playerStatsCompact","法器及备战增益已生效 · 气血 "+fmt(live.hero.hp));
 set("enemyAttackSpeed","出手间隔 "+(RULES.enemyIntervalMs/(1+r.mapIndex*.025)/1000).toFixed(2)+"秒");
 $("enemyAttackBar").style.animationDuration=(RULES.enemyIntervalMs/(1+r.mapIndex*.025))+"ms";
 set("wbWave",r.bossCleared?"可持续刷怪":p.finalGuardian?"地图Boss · 3波":"关卡守卫 · 2波");
 set("wbEnemyTraits",foe.traits.join(" · "));
 $("enemySprite").querySelector("span").textContent=["🐺","🦉","🌿","👻"][r.mapIndex]||"妖";
 renderGear();renderArtifacts();renderMapDrawer();
 if(!battleBusy){
  const e=live.enemy;
  set("enemyLabel",e.name);set("enemyStats","攻击 "+fmt(e.attack)+" · 防御 "+fmt(e.defense));
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
  const target=p.finalGuardian?"boss":"guardian",a=combatAssessment(s,c,target,24);
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
 if(!req.hasQi)needs.push("修为还差"+fmt(req.qi-r.qi));
 if(!req.hasInsight)needs.push("悟道还差"+fmt(req.insight-r.insight)+"（抽修为造化必得）");
 if(req.needsPill&&!req.hasPill)needs.push("需要筑基丹（丹道8抽内保底）");
 if(req.needMapMilestone)needs.push("先击败当前地图Boss，才能突破至下一小境界");
 if(req.needBoss)needs.push("需要先击败雾隐剑冢最终Boss");
 if(r.realmIndex>=4)needs.push("已达到切片境界上限：筑基·初期");
 set("realmGate",needs.length?needs.join("；"):("条件齐备，可以突破至"+c.realms[r.realmIndex+1]?.name));
 $("realmGate").classList.toggle("success",req.canBreak);
 $("breakthrough").disabled=!req.canBreak;
 $("realmRoute").innerHTML=c.realms.map((q,i)=>'<div class="realm-stage '+(i<r.realmIndex?"passed":i===r.realmIndex?"current":"")+'">'+escapeHTML(q.name)+'</div>').join("");
}
function renderPacks(){
 const r=s.run,step=nextStep(s,c,lastCombatAnalysis);
 const focus=step.packId||(!Object.values(r.draws).some(n=>n>0)?"battle":null);
 const labels={
  battle:"直接增加攻防气血 · 卡关时快速变强",
  wealth:"长期灵石收益 · 刷怪次数越多越划算",
  cultivation:"悟道与修为收益 · 突破境界必备",
  technique:"解锁剑术、护盾、灵宠或爆发构筑",
  cave:"洞府长期经营 · 灵石、修为、攻速收益",
  pet:"独立协战、护盾、破甲与功法共鸣",
  elixir:"筑基丹与即时修为 · 大境界冲刺",
  equipment:"永久至本世结束的穿戴装备 · 十槽配置",
  artifact:"筑基后解锁的本命法器 · 攻防与控制"
 };
 const suggested=c.packById[focus];
 set("gachaDirection",focus?
  "当前推荐："+suggested.name+"。"+labels[focus]+"。其他卡包仍可自由抽取，合理搭配能减少后续重复刷怪。":
  "当前没有唯一最优卡包。战力帮助过关，聚财和洞府提高刷怪长期收益；悟道、筑基丹关系到境界突破。");
 const packs=[...c.packs].sort((a,b)=>Number(b.id===focus)-Number(a.id===focus));
 $("packList").innerHTML=packs.map(p=>{
  const price=packCost(s,c,p.id),count=r.draws[p.id]||0,unlocked=unlockedPack(s,c,p.id),
  canSingle=unlocked&&r.stones>=price,canTen=unlocked&&r.stones>=price*10;
  return '<div class="pack'+(p.id===focus?" is-recommended":"")+'" data-pack-id="'+p.id+'"><div class="packhead"><span class="packname">'+p.icon+" "+escapeHTML(p.name)+'</span><span class="packtag">'+(p.id===focus?"★ 当前推荐":p.cards.length+"种卡")+'</span></div>'+
   '<div class="packpurpose">'+escapeHTML(labels[p.id])+'</div>'+
   '<div class="packinfo">'+escapeHTML(p.cards.map(x=>x.name).join(" / "))+'</div>'+
   '<div class="packstats">'+(unlocked?"已抽"+count+"次":"达到全局关卡 "+c.features.unlockAtGlobalCheckpoint[p.id]+" 解锁")+' · 每抽 <span class="v8-packcost">'+fmt(price)+'灵石</span>'+
   (p.id==="elixir"?" · 筑基丹保底 "+Math.max(1,c.realmPillPity-r.pillPity)+"抽":"")+
   (unlocked&&!canSingle?" · 灵石还差"+fmt(price-r.stones):"")+'</div>'+
   '<div class="packactions"><button class="action-btn primary-action" data-draw="'+p.id+'" data-count="1" '+(canSingle?"":"disabled")+'>单抽 ◆'+fmt(price)+'</button>'+
   '<button class="action-btn" data-draw="'+p.id+'" data-count="10" '+(canTen?"":"disabled")+'>十连 ◆'+fmt(price*10)+'</button></div></div>';
 }).join("");
}
function renderInventory(listId,effect,slot){
 const cards=Object.values(c.cards).filter(x=>x.effect===effect);
 $(listId).innerHTML=cards.map(card=>{
  const n=s.run.cards[card.id]||0,active=slot?s.run[slot]===card.id:false;
  const paired=PAIR_SYNERGIES.find(x=>effect==="technique"?x.technique===card.id:effect==="pet"&&x.pet===card.id);
  const partner=paired?(effect==="technique"?paired.pet:paired.technique):null;
  const pairing=partner?" · 共鸣「"+paired.name+"」搭配 "+c.cards[partner].name+"： "+paired.description:"";
  return '<div class="v8-item '+(active?"active":n?"":"missing")+'"><div class="v8-item-name">'+escapeHTML(card.name)+
   '<span>×'+n+'</span></div><div class="v8-item-desc">'+escapeHTML((card.description||card.style||"卡牌效果实际参与战斗")+pairing)+
   '</div><div class="v8-item-meta">效果强度 +'+fmt(card.value*n)+(effect==="cave"?"%":"")+'</div>'+
   (slot?'<button data-equip="'+slot+'" data-card="'+card.id+'" '+(!n||active?"disabled":"")+">"+(active?"当前已装配":n?"装配出战":"尚未抽到")+'</button>':"")+'</div>';
 }).join("");
}
function renderFate(){
 set("reincarnations",fmt(s.meta.reincarnations));set("fatePoints",fmt(s.meta.fate));set("bestMap","第"+s.meta.bestMap+"图");
 $("reincarnate").disabled=!s.run.bossCleared;
 $("openRelic").disabled=s.meta.fate<c.fate.price;
 const earned=55+Math.max(0,s.run.realmIndex-3)*10;
 set("reincarnationHint",s.run.bossCleared?
  "本次轮回可得"+earned+"因果；先看清损失和永久收益，确定后再开始下一世。":
  "先击败第四张地图Boss。轮回自愿进行；境界、当世卡牌与装备都将重置。");
 set("reincarnationChoice",s.run.bossCleared?
  s.run.realmIndex<4?
  "目前55因果；完成筑基可得65因果（多10），刚好可购买40因果天命箱并解锁25因果自动吃药。建议先筑基，再轮回。":
  "筑基圆满准备完成！本次获得65因果，可选择40因果天命箱＋25因果自动吃药。遗物永久保留，但具体效果取决于抽中内容。":
  "未来轮回奖励：Boss通关后55因果；若先突破到筑基初期则为65因果。第一次轮回还会重置本世全部装备与卡牌。");
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
 $("relicList").innerHTML=regular+apex+ultra;
}
function renderAtlas(){
 const card=m=>'<div class="v8-atlas-entry '+(m.index<=c.playableMaps?"playable":"")+'"><div><b>'+
   String(m.index).padStart(2,"0")+" "+escapeHTML(m.name)+'</b><small>'+
   escapeHTML(m.mechanicDescription)+" · Boss "+escapeHTML(m.boss.name)+'</small></div><span>'+
   (m.index>c.playableMaps?"规划中":m.index<=s.meta.bestMap?"已抵达":"可玩待解锁")+'</span></div>';
 $("mapAtlas").innerHTML=c.allMaps.slice(0,c.playableMaps).map(card).join("");
 $("mapAtlasFuture").innerHTML=c.allMaps.slice(c.playableMaps).map(card).join("");
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
 renderToken++;renderTop();renderExplore();renderNovice();renderCultivate();renderPacks();
 renderInventory("techniqueList","technique","technique");
 renderInventory("caveList","cave",null);renderInventory("petList","pet","pet");
 renderItems();renderFate();renderAtlas();renderDetailPanels();
}
async function drawPack(packId,count){
 if(revealBusy)return;
 revealBusy=true;
 try{
  const before=heroStats(s,c),previousDraws=s.run.draws[packId]||0,result=doCommand("DRAW",{packId,count});
  if(!result)return;
  const after=heroStats(s,c);
  const items=result.items.map(x=>'<span class="v8-draw-card '+x.rarity+'">'+escapeHTML(x.name)+'</span>').join("");
  $("drawResults").innerHTML='<div>本次消耗灵石 '+fmt(result.cost)+'，获得：</div>'+items+
   '<div>攻击 '+fmt(before.attack)+' → '+fmt(after.attack)+' · 气血 '+fmt(before.hp)+' → '+fmt(after.hp)+
   ' · 悟道 '+fmt(s.run.insight)+' · 现存灵石 '+fmt(s.run.stones)+'</div>';
  const quick=$("quickReveal").checked&&previousDraws>0&&
   result.items.every(x=>["huang","xuan"].includes(x.rarity));
  if(!quick)await showReveal({packId,items:result.items,title:count===10?"十道机缘 · 天命已定":"机缘已至"});
  toast("已收下 "+result.items.length+" 张机缘");
 }finally{revealBusy=false}
}
function afterBattle(result,{replay=true,onComplete=null}={}){
 if(!result)return;
 set("combatReport",result.won?(result.type==="mob"?"本关小怪":"挑战")+"胜利 · "+result.combat.turns+"回合":result.combat.reason==="timeout"?"战斗僵持 · 未死亡不扣装备":"挑战失败 · 仍在当前关刷小怪");
 set("rewardLabel","◆ +"+fmt(result.stones)+" / 修为 +"+fmt(result.qi));
 const boxDrops=(result.boxes||[]).map(x=>x.name).join("、");
 set("combatLootResult",result.lostGear?"☠ 战败遗失装备："+result.lostGear.name+"（已从持有量扣除）":
   boxDrops?"🎁 本次额外获得："+boxDrops+" · 前往道具行囊开箱":
   result.won?"本场仅获得灵石与修为；装备箱/药草箱为独立概率掉落":"挑战失败，未获得奖励");
 if(result.lostGear)toast("战败：遗失了 "+result.lostGear.name,true);
 if(replay)animateCombat(result,onComplete);
 else settleLiveTimeline(result);
 if(result.won&&result.type==="boss")toast(result.bossCleared?"雾隐剑冢已通关！可以轮回或突破筑基。":"地图Boss已击败，下一张地图开放！");
 else if(result.combat.reason==="timeout")toast("战斗僵持：未死亡，不触发掉装惩罚。");
 else if(!result.won&&result.type!=="mob"&&!result.lostGear)toast("守卫仍很强。继续刷本关小怪进行抽卡成长。",true);
}
function stopAuto(){
 if(timer!==null)clearTimeout(timer);timer=null;
 const wasLive=livePreview;
 clearLiveTimeline();
 if(wasLive){++playToken;battleBusy=false}
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
 if(recovered.capped)toast("超过离线上限的时间未计入收益（首世15分钟，轮回后2小时）");
 if(!recovered.active){auto=false;toast(recovered.failureReason==="timeout"?"战斗达到行动上限，挂机已暂停；没有死亡掉装。":recovered.lostGear?"挂机死亡 · 遗失 "+recovered.lostGear.name:"小怪挑战失败，安全挂机已暂停，进度没有倒退。",true)}
}
function schedule(){
 if(timer!==null)clearTimeout(timer);timer=null;
 if(!auto||document.hidden)return;
 const next=fight(s,c,"mob",{seed:s.seed});
 // Do not restart the countdown after rerender, resuming or an equipment change.
 const idle=s.run.idle;
 const elapsed=(idle?.carryMs||0)+Math.max(0,Date.now()-(idle?.at||Date.now()));
 const timeline=combatTimeline(next,elapsed);
 if(timeline.remainingMs===0){
  const recovered=doCommand("CLAIM_IDLE");
  if(!recovered){stopAuto();return}
  if(recovered.lastBattle)afterBattle(recovered.lastBattle,{replay:false});
  if(!recovered.active){auto=false;reportIdle(recovered);renderTop();return}
  timer=setTimeout(schedule,0);return;
 }
 set("fightTimer","本场 "+(next.timeMs/1000).toFixed(2)+"秒 · 攻击与扣血同步");
 const fill=$("intervalFill");fill.classList.remove("running");void fill.offsetWidth;
 fill.style.setProperty("--interval-duration",timeline.remainingMs+"ms");fill.classList.add("running");
 startLiveTimeline(next,timeline);
 timer=setTimeout(()=>{
  timer=null;if(!auto||document.hidden)return;
  const summary=doCommand("CLAIM_IDLE");
  if(!summary){stopAuto();return}
  if(summary.lastBattle)afterBattle(summary.lastBattle,{replay:false});
  if(!summary.active){auto=false;reportIdle(summary);renderTop();return}
  if(autoPush&&!s.run.bossCleared){
   const target=s.run.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
   const risk=combatAssessment(s,c,target,24);
   if(risk.safeToAuto){
    const challenge=doCommand("BATTLE",{enemyType:target});
    if(challenge){
     // A new mob fight must not overwrite the ongoing guardian/Boss replay.
     afterBattle(challenge,{onComplete:()=>{
      if(!auto)return;
      const recovered=doCommand("CLAIM_IDLE");
      if(!recovered){stopAuto();return}
      if(recovered.lastBattle)afterBattle(recovered.lastBattle,{replay:false});
      if(!recovered.active){auto=false;reportIdle(recovered);renderTop();return}
      schedule();
     }});
     if(!challenge.won){autoPush=false;toast("守关失败，自动冲关关闭，继续刷本关小怪。",true)}
     return;
    }
   }
  }
  schedule();
 },Math.max(10,Math.ceil(timeline.remainingMs)));
}
function startAuto(){
 if(auto){stopAuto();return}
 if(battleBusy){toast("当前战斗演出尚未结束，不能重叠启动挂机。",true);return}
 const result=doCommand("START_IDLE");
 if(!result)return;
 auto=true;renderTop();schedule();toast("正在挂机刷当前关小怪；关闭页面后仅进行安全小怪离线结算");
}
function exportSave(){
 const b=new Blob([JSON.stringify(s,null,2)],{type:"application/json;charset=utf-8"});
 const url=URL.createObjectURL(b),link=document.createElement("a");link.href=url;
 link.download="gacha-ascension-v0.8-slice.json";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
}
async function init(){
 try{
  const [w,p]=await Promise.all([
   fetch(new URL("../../data/realms-maps.v0.8.proposal.json",import.meta.url)).then(x=>{if(!x.ok)throw Error("地图数据加载失败");return x.json()}),
   fetch(new URL("../../data/v8-slice.json",import.meta.url)).then(x=>{if(!x.ok)throw Error("卡包配置加载失败");return x.json()})
  ]);
  c=loadCatalog(w,p);
  const loaded=readGame(c);
  if(loaded.status==="invalid"){offerInvalidSaveRecovery(loaded.raw,loaded.message);set("saveStatus",loaded.message);return}
  s=loaded.state;
  try{$("quickReveal").checked=localStorage.getItem(QUICK_REVEAL_KEY)==="1"}catch{}
  set("saveStatus",loaded.status==="restored"?"已恢复v0.8独立存档":"全新v0.8独立存档已就绪");
  render();
  for(const detail of document.querySelectorAll("details.v8-disclosure")){
   detail.addEventListener("toggle",()=>{
    if(detail.open)renderDetailPanels();
    else if(detail.id&&$("detail-"+detail.id))$("detail-"+detail.id).replaceChildren();
   });
  }
  $("moreSystems").addEventListener("click",toggleMobileSheet);
  $("landscapeNavToggle").addEventListener("click",()=>document.body.classList.contains("wb-nav-open")?closeLandscapeNav():openLandscapeNav());
  $("openMapDrawer").addEventListener("click",openLandscapeNav);
  $("landscapeBackdrop").addEventListener("click",closeLandscapeNav);
  $("openGearBag").addEventListener("click",()=>openGear(suggestedGearSlot||"weapon1"));
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
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeMobileSheet();closeLandscapeNav();closeGear()}});
  document.addEventListener("click",e=>{
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
    if(result)toast("炼制成功："+ITEMS.find(x=>x.id===result.item)?.name);
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
      if(id){$(id)?.scrollIntoView({behavior:"auto",block:"center"});$(id)?.focus({preventScroll:true})}
     }
     return}
   const draw=e.target.closest("button[data-draw]");
   if(draw&&!draw.disabled){drawPack(draw.dataset.draw,Number(draw.dataset.count));return}
   const equip=e.target.closest("button[data-equip]");
   if(equip&&!equip.disabled){const slot=equip.dataset.equip;const result=doCommand(slot==="pet"?"EQUIP_PET":"EQUIP_TECH",{id:equip.dataset.card});
    if(result)toast("装配成功，下一次战斗即刻生效。");}
  });
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
  $("killMob").addEventListener("click",()=>{
   if(auto||battleBusy){toast("当前战斗尚未结束，请勿叠加新的攻击。");return}
   afterBattle(doCommand("BATTLE",{enemyType:"mob"}));
  });
  $("challenge").addEventListener("click",()=>{
   if(battleBusy&&!auto){toast("先完成当前战斗，再挑战守卫。");return}
   if(auto)stopAuto();
   afterBattle(doCommand("BATTLE",{enemyType:"guardian"}));
  });
  $("challengeBoss").addEventListener("click",()=>{
   if(battleBusy&&!auto){toast("先完成当前战斗，再挑战Boss。");return}
   if(auto)stopAuto();
   afterBattle(doCommand("BATTLE",{enemyType:"boss"}));
  });
  $("autoPush").addEventListener("click",()=>{autoPush=!autoPush;render();toast("自动冲关已"+(autoPush?"开启，战斗风险评估通过才进行挑战。":"关闭。"))});
  $("farmFocus").addEventListener("change",event=>{
   const result=doCommand("SET_FARM_FOCUS",{id:event.target.value});
   if(result)toast("已将当前关小怪调整为："+farmTarget(s,c).name+"。进度保持不变。");
  });
  $("breakthrough").addEventListener("click",()=>{const r=doCommand("BREAKTHROUGH");if(r){toast("突破成功："+r.name+"！");changeView("cultivate")}});
  $("reincarnate").addEventListener("click",()=>{
   const earned=55+Math.max(0,s.run.realmIndex-3)*10;
   const alternative=s.run.realmIndex<4?"\n注意：先筑基再轮回能额外获得10因果，并凑足40因果遗物箱＋25因果自动服药。":"";
   if(!window.confirm("确定轮回获得"+earned+"因果？当世地图、修为、灵石、装备和卡牌会全部清空；已拥有的永久遗物及因果保留。"+alternative))return;
   stopAuto();const r=doCommand("REINCARNATE");if(r){playToken++;toast("轮回成功！获得"+r.earned+"因果，永久遗物继续生效。");changeView("fate")}});
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
  $("exportSave").addEventListener("click",exportSave);
  $("resetSave").addEventListener("click",()=>{if(!window.confirm("确认备份当前v0.8存档并从炼气初期重开？旧版存档不会被修改。"))return;
   stopAuto();playToken++;s=backupAndReset(c);try{localStorage.removeItem(NOVICE_SKIP_KEY)}catch{}set("saveStatus","已备份旧存档并重新开始");render();changeView("explore")});
  document.addEventListener("visibilitychange",()=>{
   if(document.hidden&&auto){
    if(timer!==null)clearTimeout(timer);timer=null;
    clearLiveTimeline();++playToken;battleBusy=false;return;
   }
   if(!document.hidden&&auto){
    const claim=doCommand("CLAIM_IDLE");
    reportIdle(claim);
    if(auto)schedule();else renderTop();
   }
  });
  if(s.run.idle?.active){
   auto=true;
   const resumed=doCommand("CLAIM_IDLE");
   reportIdle(resumed);
   if(auto){renderTop();schedule()}
  }
 }catch(error){toast("初始化失败："+error.message,true);set("saveStatus",error.stack||error.message)}
}
init();
