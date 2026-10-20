import {loadCatalog,createSave,dispatch,heroStats,yields,progress,breakthroughRequirements,enemyPreview,fight,combatAssessment,combatLabels,packCost,farmTarget} from "./engine.mjs";
import {readGame,writeGame,backupAndReset} from "./storage.mjs";
import {detailModel} from "./details.mjs";
import {showReveal} from "./reveal.mjs";
import {unlockedPack} from "./modules.mjs";
import {EQUIPMENT_SLOTS,equippedMap,equipmentStats,comparison,STAT_LABELS} from "./equipment.mjs";
import {RULES} from "./combat-depth.mjs";
const $=id=>document.getElementById(id),fmt=n=>{
 if(!Number.isFinite(n))return "—";
 const a=Math.abs(n);
 return a>=1e12?(n/1e12).toFixed(2)+"兆":a>=1e8?(n/1e8).toFixed(2)+"亿":a>=1e4?(n/1e4).toFixed(2)+"万":Math.round(n).toLocaleString("zh-CN");
};
const escapeHTML=t=>String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const majors=["凡尘炼气","地脉筑基","丹成沧海","雷穹元婴","太虚化神"];
let c,s,view="explore",auto=false,autoPush=false,timer=null,playToken=0,renderToken=0,toastTimer=null,battleBusy=false,lastCombatAnalysis=null,revealBusy=false,selectedGearSlot="weapon1";
const set=(id,text)=>{const e=$(id);if(e)e.textContent=text};
function toast(message,failure=false){
 const el=$("toast");el.textContent=message;el.classList.toggle("failure",failure);el.classList.add("visible");
 if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),3400);
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
 if(!["explore","cultivate","gacha","technique","cave","pet","fate","atlas","settings"].includes(target))return;
 view=target;
 for(const el of document.querySelectorAll("[data-view-panel]"))el.classList.toggle("is-active",el.dataset.viewPanel===target);
 for(const el of document.querySelectorAll("button[data-view]")){
  const active=el.dataset.view===target;el.classList.toggle("is-active",active);
  if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");
 }
 const names={explore:"地图探索",cultivate:"境界突破",gacha:"机缘抽卡",technique:"功法",cave:"洞府经营",pet:"御兽灵契",fate:"轮回天命",atlas:"世界图鉴",settings:"存档设置"};
 set("screenTitle",names[target]);
 $("moreSystems").classList.toggle("is-active",["technique","cave","pet","atlas","settings"].includes(target));
 const panel=document.querySelector('[data-view-panel="'+target+'"]');if(panel)panel.scrollTop=0;
 render();
}
function doCommand(type,more={}){
 if(!s||!c)return null;
 try{
  const out=dispatch(s,c,{type,seq:s.seq+1,now:Date.now(),...more});
  writeGame(out.state,c);s=out.state;render();
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
function renderGear(){
 const equipment=equippedMap(s);
 $("equipmentGrid").innerHTML=EQUIPMENT_SLOTS.map(slot=>{
  const id=equipment[slot.id],card=id?c.cards[id]:null;
  return '<button class="wb-gear-slot'+(card?" filled":"")+'" type="button" data-gear-slot="'+slot.id+'" aria-label="'+
    escapeHTML(slot.name+(card?" "+card.name:" 空槽"))+'"><span class="wb-gear-icon">'+slot.icon+'</span>'+
    '<span class="wb-gear-caption">'+escapeHTML(slot.name)+'</span>'+
    '<span class="wb-gear-name">'+escapeHTML(card?.name||"空")+'</span></button>';
 }).join("");
}
function openGear(slot){
 selectedGearSlot=slot;
 $("equipmentDrawer").hidden=false;
 drawGearBag();
 $("closeEquipment").focus();
}
function closeGear(){
 $("equipmentDrawer").hidden=true;
}
function drawGearBag(){
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
function damagePop(actor,amount){
 const layer=$("damageLayer"),el=document.createElement("span");
 const side=actor==="enemy"||actor==="counter"?"hero-dmg":actor==="regen"?"heal-dmg":"enemy-dmg";
 el.className="damage-pop "+side;
 el.textContent=actor==="miss"?"闪避":(actor==="regen"?"+":"−")+fmt(amount);
 layer.append(el);setTimeout(()=>el.remove(),650);
 const src=$(actor==="enemy"||actor==="counter"?"heroSprite":"enemySprite");
 src.classList.remove("impact");void src.offsetWidth;src.classList.add("impact");
 setTimeout(()=>src.classList.remove("impact"),250);
}
function animateCombat(result){
 playToken++;const token=playToken;
 const {combat}=result,logs=combat.logs;
 if(view!=="explore"){battleBusy=false;return}
 battleBusy=true;
 snapshot("heroHP","heroBar",combat.hero.hp,combat.hero.hp);
 snapshot("enemyHP","enemyBar",combat.enemy.hp,combat.enemy.hp);
 set("enemyLabel",combat.enemy.name);
 set("combatStatus","交锋中");
 $("heroAttackBar").style.animationPlayState="running";$("enemyAttackBar").style.animationPlayState="running";
 const important=new Set();
 for(let i=0;i<logs.length;i++)if(logs[i].actor==="wave")important.add(i);
 for(const i of [0,1,2,logs.length-3,logs.length-2,logs.length-1])
  if(i>=0&&i<logs.length)important.add(i);
 for(let i=3;i<logs.length-3&&important.size<10;i+=3)important.add(i);
 const items=[...important].sort((a,b)=>a-b).map(i=>logs[i]);
 const duration=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches?30:780;
 items.forEach((event,index)=>{
  setTimeout(()=>{
   if(playToken!==token)return;
   if(event.actor==="wave"){
    set("enemyLabel",event.name+" · 第"+event.stage+"/"+event.total+"波");
    set("wbWave","第"+event.stage+"/"+event.total+"波");
    snapshot("enemyHP","enemyBar",event.hp,event.max);
    set("combatStatus","连续守关 · 第"+event.stage+"/"+event.total+"波");
    return;
   }
   const hero=event.actor==="enemy"||event.actor==="counter"||
    event.actor==="miss"&&event.owner==="enemy";
   if(hero)snapshot("heroHP","heroBar",event.hp,event.max);
   else snapshot("enemyHP","enemyBar",event.hp,event.max);
   damagePop(event.actor,event.amount);
   set("combatStatus",event.actor==="miss"?"攻击落空":event.actor==="pet"?"灵宠追击":
    event.actor==="regen"?"敌人恢复":event.actor==="counter"?"剑气反震":hero?"敌人攻击":"剑气交锋");
  },50+Math.floor(duration*(index/Math.max(items.length,1))));
 });
 setTimeout(()=>{
  if(playToken!==token)return;
  snapshot("heroHP","heroBar",combat.heroRemaining,combat.hero.hp);
  snapshot("enemyHP","enemyBar",combat.enemyRemaining,combat.enemy.hp);
  battleBusy=false;
  set("enemyLabel",combat.enemy.name);
  set("combatStatus",result.won?"✓ 连续"+combat.totalWaves+"波胜利":"✕ 第"+Math.min(combat.totalWaves,combat.completedWaves+1)+"波挑战失败");
  if(result.won){$("enemySprite").classList.add("defeated");setTimeout(()=>$("enemySprite").classList.remove("defeated"),340)}
  if(!auto){$("heroAttackBar").style.animationPlayState="paused";$("enemyAttackBar").style.animationPlayState="paused"}
 },duration+90);
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
function renderExplore(){
 const p=progress(s,c),r=s.run,h=heroStats(s,c),inc=incomePreview();
 set("mapTag","第"+(r.mapIndex+1)+"图 · "+majors[r.mapIndex<4?0:r.mapIndex] );
 set("mapName",p.map.name);
 set("mapFlavor","第"+p.stage+"/"+c.checkpointsPerMap+"关 · "+p.map.mechanicDescription);
 set("mapBoss","最终Boss："+p.map.boss.name);
 set("checkpointCount",r.bossCleared?"四图切片已通关":"第"+p.stage+"/"+c.checkpointsPerMap+"关");
 $("checkpointTrack").innerHTML=Array.from({length:c.checkpointsPerMap},(_,i)=>
  '<div class="checkpoint-node '+(i<r.checkpoint?"passed":i===r.checkpoint?"current":"")+'">'+(i===c.checkpointsPerMap-1?"B":i+1)+'</div>').join("");
 $("challenge").disabled=p.finalGuardian||r.bossCleared;
 $("challengeBoss").disabled=!p.finalGuardian||r.bossCleared;
 $("killMob").disabled=false;
 set("mobStone","+"+fmt(inc.stones));set("mobQi","+"+fmt(inc.qi));
 $("farmFocus").value=s.run.farmFocus||"balanced";
 set("farmFocusTip",farmTarget(s,c).desc);
 const foe=enemyPreview(s,c,r.bossCleared?"mob":p.finalGuardian?"boss":"guardian");
 set("enemyAttackSpeed","出手间隔 "+(RULES.enemyIntervalMs/(1+r.mapIndex*.025)/1000).toFixed(2)+"秒");
 $("enemyAttackBar").style.animationDuration=(RULES.enemyIntervalMs/(1+r.mapIndex*.025))+"ms";
 set("wbWave",r.bossCleared?"可持续刷怪":p.finalGuardian?"地图Boss · 3波":"关卡守卫 · 2波");
 set("wbEnemyTraits",foe.traits.join(" · "));
 $("enemySprite").querySelector("span").textContent=["🐺","🦉","🌿","👻"][r.mapIndex]||"妖";
 renderGear();renderMapDrawer();
 if(!battleBusy){
  const e=enemyPreview(s,c,"mob");
  set("enemyLabel",e.name);set("enemyStats","攻击 "+fmt(e.attack)+" · 防御 "+fmt(e.defense));
  snapshot("heroHP","heroBar",h.hp,h.hp);snapshot("enemyHP","enemyBar",e.hp,e.hp);
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
 if(r.lastBattle){set("combatReport",r.lastBattle.won?"上场"+(r.lastBattle.type==="mob"?"小怪":"挑战")+"胜利 · "+r.lastBattle.turns+"回合":"上场挑战失败 · 留在当前关刷小怪");
  set("rewardLabel","◆ +"+fmt(r.lastBattle.stones)+" · 修为 +"+fmt(r.lastBattle.qi));}
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
 const r=s.run;
 $("packList").innerHTML=c.packs.map(p=>{
  const price=packCost(s,c,p.id),count=r.draws[p.id]||0,unlocked=unlockedPack(s,c,p.id),canSingle=unlocked&&r.stones>=price,canTen=unlocked&&r.stones>=price*10;
  return '<div class="pack"><div class="packhead"><span class="packname">'+p.icon+" "+escapeHTML(p.name)+'</span><span class="packtag">'+p.cards.length+'种卡</span></div>'+
  '<div class="packinfo">'+escapeHTML(p.cards.map(x=>x.name).join(" / "))+'</div>'+
  '<div class="packstats">'+(unlocked?"已抽"+count+"次":"达到全局关卡 "+c.features.unlockAtGlobalCheckpoint[p.id]+" 解锁")+' · 每抽 <span class="v8-packcost">'+fmt(price)+'灵石</span>'+
  (p.id==="elixir"?" · 筑基丹保底 "+Math.max(1,c.realmPillPity-r.pillPity)+"抽":"")+'</div>'+
  '<div class="packactions"><button class="action-btn primary-action" data-draw="'+p.id+'" data-count="1" '+(canSingle?"":"disabled")+'>单抽 ◆'+fmt(price)+'</button>'+
  '<button class="action-btn" data-draw="'+p.id+'" data-count="10" '+(canTen?"":"disabled")+'>十连 ◆'+fmt(price*10)+'</button></div></div>';
 }).join("");
}
function renderInventory(listId,effect,slot){
 const cards=Object.values(c.cards).filter(x=>x.effect===effect);
 $(listId).innerHTML=cards.map(card=>{
  const n=s.run.cards[card.id]||0,active=slot?s.run[slot]===card.id:false;
  return '<div class="v8-item '+(active?"active":n?"":"missing")+'"><div class="v8-item-name">'+escapeHTML(card.name)+
   '<span>×'+n+'</span></div><div class="v8-item-desc">'+escapeHTML(card.description||card.style||"卡牌效果实际参与战斗")+
   '</div><div class="v8-item-meta">效果强度 +'+fmt(card.value*n)+(effect==="cave"?"%":"")+'</div>'+
   (slot?'<button data-equip="'+slot+'" data-card="'+card.id+'" '+(!n||active?"disabled":"")+">"+(active?"当前已装配":n?"装配出战":"尚未抽到")+'</button>':"")+'</div>';
 }).join("");
}
function renderFate(){
 set("reincarnations",fmt(s.meta.reincarnations));set("fatePoints",fmt(s.meta.fate));set("bestMap","第"+s.meta.bestMap+"图");
 $("reincarnate").disabled=!s.run.bossCleared;
 $("openRelic").disabled=s.meta.fate<c.fate.price;
 set("reincarnationHint",s.run.bossCleared?"已击败第四图Boss。轮回获得55～65因果，卡牌与境界重置。":
 "需要先击败第四张地图Boss。轮回是自由选择，不会自动触发。");
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
 const keys=["explore","cultivate","gacha","technique","cave","pet","fate","atlas","settings"];
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
 renderToken++;renderTop();renderExplore();renderCultivate();renderPacks();
 renderInventory("techniqueList","technique","technique");
 renderInventory("caveList","cave",null);renderInventory("petList","pet","pet");
 renderFate();renderAtlas();renderDetailPanels();
}
async function drawPack(packId,count){
 if(revealBusy)return;
 revealBusy=true;
 try{
  const before=heroStats(s,c),result=doCommand("DRAW",{packId,count});
  if(!result)return;
  const after=heroStats(s,c);
  const items=result.items.map(x=>'<span class="v8-draw-card '+x.rarity+'">'+escapeHTML(x.name)+'</span>').join("");
  $("drawResults").innerHTML='<div>本次消耗灵石 '+fmt(result.cost)+'，获得：</div>'+items+
   '<div>攻击 '+fmt(before.attack)+' → '+fmt(after.attack)+' · 气血 '+fmt(before.hp)+' → '+fmt(after.hp)+
   ' · 悟道 '+fmt(s.run.insight)+' · 现存灵石 '+fmt(s.run.stones)+'</div>';
  await showReveal({packId,items:result.items,title:count===10?"十道机缘 · 天命已定":"机缘已至"});
  toast("已收下 "+result.items.length+" 张机缘");
 }finally{revealBusy=false}
}
function afterBattle(result){
 if(!result)return;
 set("combatReport",result.won?(result.type==="mob"?"本关小怪":"挑战")+"胜利 · "+result.combat.turns+"回合":"挑战失败 · 仍在当前关刷小怪");
 set("rewardLabel","◆ +"+fmt(result.stones)+" / 修为 +"+fmt(result.qi));
 animateCombat(result);
 if(result.won&&result.type==="boss")toast(result.bossCleared?"雾隐剑冢已通关！可以轮回或突破筑基。":"地图Boss已击败，下一张地图开放！");
 else if(!result.won&&result.type!=="mob")toast("守卫仍很强。继续刷本关小怪进行抽卡成长。",true);
}
function stopAuto(){
 if(timer!==null)clearTimeout(timer);timer=null;
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
 if(recovered.attempts>1)toast("离线/后台安全刷怪 "+recovered.wins+"场，灵石 +"+fmt(recovered.stones)+"、修为 +"+fmt(recovered.qi));
 if(recovered.capped)toast("超过离线上限的时间未计入收益（首世15分钟，轮回后2小时）");
 if(!recovered.active){auto=false;toast("小怪挑战失败，安全挂机已暂停，进度没有倒退。",true)}
}
function schedule(){
 if(timer!==null)clearTimeout(timer);timer=null;
 if(!auto||document.hidden)return;
 const next=fight(s,c,"mob",{seed:s.seed});
 const delay=Math.max(100,Math.ceil(next.timeMs-(s.run.idle?.carryMs||0)));
 set("fightTimer","本场预计 "+(next.timeMs/1000).toFixed(2)+"秒 · 真实攻速结算");
 const fill=$("intervalFill");fill.classList.remove("running");void fill.offsetWidth;
 fill.style.setProperty("--interval-duration",delay+"ms");fill.classList.add("running");
 timer=setTimeout(()=>{
  timer=null;if(!auto||document.hidden)return;
  const summary=doCommand("CLAIM_IDLE");
  if(!summary){stopAuto();return}
  if(summary.lastBattle)afterBattle(summary.lastBattle);
  if(!summary.active){auto=false;reportIdle(summary);renderTop();return}
  if(autoPush&&!s.run.bossCleared){
   const target=s.run.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
   const risk=combatAssessment(s,c,target,24);
   if(risk.safeToAuto){
    const next=doCommand("BATTLE",{enemyType:target});
    afterBattle(next);
    if(!next?.won){autoPush=false;toast("守关失败，自动冲关关闭，继续刷本关小怪。",true)}
   }
  }
  schedule();
 },delay);
}
function startAuto(){
 if(auto){stopAuto();return}
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
  if(loaded.status==="invalid"){toast("旧v0.8预览存档格式不匹配，请先导出或备份，不能直接覆盖。",true);set("saveStatus",loaded.message);return}
  s=loaded.state;
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
  $("openGearBag").addEventListener("click",()=>openGear("weapon1"));
  $("closeEquipment").addEventListener("click",closeGear);
  let swipe=null;
  document.addEventListener("touchstart",event=>{const t=event.touches[0];swipe=t.clientX<24?{x:t.clientX,y:t.clientY}:null},{passive:true});
  document.addEventListener("touchend",event=>{if(!swipe)return;const t=event.changedTouches[0],dx=t.clientX-swipe.x,dy=Math.abs(t.clientY-swipe.y);if(dx>65&&dy<45)openLandscapeNav();swipe=null},{passive:true});
  $("closeMobileSheet").addEventListener("click",closeMobileSheet);
  $("mobileSheetBackdrop").addEventListener("click",closeMobileSheet);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeMobileSheet();closeLandscapeNav();closeGear()}});
  document.addEventListener("click",e=>{
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
   if(nav){changeView(nav.dataset.view);return}
   const draw=e.target.closest("button[data-draw]");
   if(draw&&!draw.disabled){drawPack(draw.dataset.draw,Number(draw.dataset.count));return}
   const equip=e.target.closest("button[data-equip]");
   if(equip&&!equip.disabled){const slot=equip.dataset.equip;const result=doCommand(slot==="pet"?"EQUIP_PET":"EQUIP_TECH",{id:equip.dataset.card});
    if(result)toast("装配成功，下一次战斗即刻生效。");}
  });
  $("autoFarm").addEventListener("click",startAuto);
  $("killMob").addEventListener("click",()=>afterBattle(doCommand("BATTLE",{enemyType:"mob"})));
  $("challenge").addEventListener("click",()=>afterBattle(doCommand("BATTLE",{enemyType:"guardian"})));
  $("challengeBoss").addEventListener("click",()=>afterBattle(doCommand("BATTLE",{enemyType:"boss"})));
  $("autoPush").addEventListener("click",()=>{autoPush=!autoPush;render();toast("自动冲关已"+(autoPush?"开启，战斗风险评估通过才进行挑战。":"关闭。"))});
  $("farmFocus").addEventListener("change",event=>{
   const result=doCommand("SET_FARM_FOCUS",{id:event.target.value});
   if(result)toast("已将当前关小怪调整为："+farmTarget(s,c).name+"。进度保持不变。");
  });
  $("breakthrough").addEventListener("click",()=>{const r=doCommand("BREAKTHROUGH");if(r){toast("突破成功："+r.name+"！");changeView("cultivate")}});
  $("reincarnate").addEventListener("click",()=>{if(!window.confirm("确认轮回？会清空本世地图、修为、灵石和全部当世卡牌，但保留天命与因果。"))return;
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
   stopAuto();playToken++;s=backupAndReset(c);set("saveStatus","已备份旧存档并重新开始");render();changeView("explore")});
  document.addEventListener("visibilitychange",()=>{
   if(document.hidden&&auto){if(timer!==null)clearTimeout(timer);timer=null;return}
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
