import {loadCatalog,createSave,dispatch,heroStats,yields,progress,breakthroughRequirements,enemyPreview,fight,packCost} from "./engine.mjs";
import {readGame,writeGame,backupAndReset} from "./storage.mjs";
const $=id=>document.getElementById(id),fmt=n=>{
 if(!Number.isFinite(n))return "—";
 const a=Math.abs(n);
 return a>=1e12?(n/1e12).toFixed(2)+"兆":a>=1e8?(n/1e8).toFixed(2)+"亿":a>=1e4?(n/1e4).toFixed(2)+"万":Math.round(n).toLocaleString("zh-CN");
};
const escapeHTML=t=>String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const majors=["凡尘炼气","地脉筑基","丹成沧海","雷穹元婴","太虚化神"];
let c,s,view="explore",auto=false,autoPush=false,timer=null,playToken=0,renderToken=0,toastTimer=null,battleBusy=false;
const set=(id,text)=>{const e=$(id);if(e)e.textContent=text};
function toast(message,failure=false){
 const el=$("toast");el.textContent=message;el.classList.toggle("failure",failure);el.classList.add("visible");
 if(toastTimer)clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),3400);
}
function changeView(target){
 if(!["explore","cultivate","gacha","technique","cave","pet","fate","atlas","settings"].includes(target))return;
 view=target;
 for(const el of document.querySelectorAll("[data-view-panel]"))el.classList.toggle("is-active",el.dataset.viewPanel===target);
 for(const el of document.querySelectorAll("button[data-view]")){
  const active=el.dataset.view===target;el.classList.toggle("is-active",active);
  if(active)el.setAttribute("aria-current","page");else el.removeAttribute("aria-current");
 }
 const names={explore:"地图探索",cultivate:"境界突破",gacha:"机缘抽卡",technique:"功法",cave:"洞府经营",pet:"御兽灵契",fate:"轮回天命",atlas:"世界图鉴",settings:"存档设置"};
 set("screenTitle",names[target]);
 const panel=document.querySelector('[data-view-panel="'+target+'"]');if(panel)panel.scrollTop=0;
 render();
}
function doCommand(type,more={}){
 if(!s||!c)return null;
 try{
  const out=dispatch(s,c,{type,seq:s.seq+1,...more});
  writeGame(out.state,c);s=out.state;render();
  return out.result;
 }catch(error){toast(error.message,true);return null}
}
function snapshot(hpId,barId,current,max){
 set(hpId,fmt(current)+" / "+fmt(max));
 const el=$(barId);if(el)el.style.width=Math.max(0,Math.min(100,100*current/max||0))+"%";
}
function damagePop(actor,amount){
 const layer=$("damageLayer"),el=document.createElement("span");
 const side=actor==="enemy"?"hero-dmg":actor==="regen"?"heal-dmg":"enemy-dmg";
 el.className="damage-pop "+side;
 el.textContent=(actor==="regen"?"+":"−")+fmt(amount);
 layer.append(el);setTimeout(()=>el.remove(),650);
 const src=$(actor==="enemy"?"enemySprite":"heroSprite");
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
 const items=logs.length<=8?logs:[...logs.slice(0,4),...logs.slice(-4)];
 const duration=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches?30:780;
 items.forEach((event,index)=>{
  setTimeout(()=>{
   if(playToken!==token)return;
   const hero=event.actor==="enemy",regen=event.actor==="regen";
   if(hero)snapshot("heroHP","heroBar",event.hp,event.max);
   else snapshot("enemyHP","enemyBar",event.hp,event.max);
   damagePop(event.actor,event.amount);
   set("combatStatus",event.actor==="pet"?"灵宠追击":event.actor==="regen"?"妖物恢复":hero?"妖物反击":"剑气交锋");
  },50+Math.floor(duration*(index/Math.max(items.length,1))));
 });
 setTimeout(()=>{
  if(playToken!==token)return;
  snapshot("heroHP","heroBar",combat.heroRemaining,combat.hero.hp);
  snapshot("enemyHP","enemyBar",combat.enemyRemaining,combat.enemy.hp);
  battleBusy=false;set("combatStatus",result.won?"✓ 战斗胜利":"✕ 守卫未破 · 原地刷怪");
 },duration+90);
}
function incomePreview(){
 const map=s.run.mapIndex,k=s.run.checkpoint,b=c.balance,y=yields(s,c);
 const stones=Math.round(b.stonesPerKill*Math.pow(b.mapRewardFactor,map)*Math.pow(b.checkpointRewardFactor,k)*(1+y.stonePct/100));
 const qi=Math.round(b.qiPerKill*Math.pow(1.67,map)*Math.pow(1.07,k)*(1+y.qiPct/100));
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
 if(!battleBusy){
  const e=enemyPreview(s,c,"mob");
  set("enemyLabel",e.name);set("enemyStats","攻击 "+fmt(e.attack)+" · 防御 "+fmt(e.defense));
  snapshot("heroHP","heroBar",h.hp,h.hp);snapshot("enemyHP","enemyBar",e.hp,e.hp);
 }
 if(r.bossCleared){
  set("guardForecast","四图已经完成");
  set("goalHint","恭喜击败雾隐剑冢Boss！前往境界页面突破筑基，或通过轮回天命进入下一世。");
 }else{
  const target=p.finalGuardian?"boss":"guardian",predict=fight(s,c,target);
  set("guardForecast",predict.won?"可挑战 · 预计"+predict.turns+"回合":"暂时困难 · 优先积累");
  set("goalHint",predict.won?
   "现在的构筑有希望击败"+(p.finalGuardian?"地图Boss":"守卫")+"。击败后进入新关卡；当前关小怪依旧是基础资源来源。":
   "当前"+(p.finalGuardian?"地图Boss":"守卫")+"强于你的构筑。保持自动刷本关小怪、抽卡或调整功法与灵宠，不会退关。");
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
  const price=packCost(s,c,p.id),count=r.draws[p.id]||0,canSingle=r.stones>=price,canTen=r.stones>=price*10;
  return '<div class="pack"><div class="packhead"><span class="packname">'+p.icon+" "+escapeHTML(p.name)+'</span><span class="packtag">'+p.cards.length+'种卡</span></div>'+
  '<div class="packinfo">'+escapeHTML(p.cards.map(x=>x.name).join(" / "))+'</div>'+
  '<div class="packstats">已抽'+count+'次 · 每抽 <span class="v8-packcost">'+fmt(price)+'灵石</span>'+
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
 set("reincarnationHint",s.run.bossCleared?"已击败第四图Boss。轮回可以获得55～65因果，当前世全部修炼与抽卡重置。":
 "还未击败第四张地图Boss。轮回只在本切片全部完成后开启。");
 $("relicList").innerHTML=c.relics.map(x=>{
  const n=s.meta.relics[x.id]||0;return '<div class="v8-item '+(n?"":"missing")+'"><div class="v8-item-name">'+
   escapeHTML(x.name)+"<span>×"+n+"</span></div><div class='v8-item-desc'>永久 "+x.stat+" +"+x.value+"% / 份，最高"+x.max+"份</div></div>";
 }).join("")+c.ultras.filter(x=>s.meta.ultras[x.id]).map(x=>'<div class="v8-item active"><div class="v8-item-name">鸿蒙 · '+escapeHTML(x.name)+'</div><div class="v8-item-desc">全世生效 · 专项×'+x.value+'</div></div>').join("");
}
function renderAtlas(){
 $("mapAtlas").innerHTML=c.allMaps.map(m=>
  '<div class="v8-atlas-entry '+(m.index<=c.playableMaps?"playable":"")+'"><div><b>'+
  String(m.index).padStart(2,"0")+" "+escapeHTML(m.name)+'</b><small>'+
  escapeHTML(m.mechanicDescription)+" · Boss "+escapeHTML(m.boss.name)+'</small></div><span>'+
  (m.index>c.playableMaps?"待扩展":m.index<=s.meta.bestMap?"已抵达":"可玩待解锁")+'</span></div>').join("");
}
function render(){
 if(!c||!s)return;
 renderToken++;renderTop();renderExplore();renderCultivate();renderPacks();
 renderInventory("techniqueList","technique","technique");
 renderInventory("caveList","cave",null);renderInventory("petList","pet","pet");
 renderFate();renderAtlas();
}
function drawPack(packId,count){
 const before=heroStats(s,c),result=doCommand("DRAW",{packId,count});
 if(!result)return;
 const after=heroStats(s,c);
 const items=result.items.map(x=>'<span class="v8-draw-card '+x.rarity+'">'+escapeHTML(x.name)+'</span>').join("");
 $("drawResults").innerHTML='<div>本次消耗灵石 '+fmt(result.cost)+'，获得：</div>'+items+
   '<div>攻击 '+fmt(before.attack)+' → '+fmt(after.attack)+' · 气血 '+fmt(before.hp)+' → '+fmt(after.hp)+
   ' · 觉悟 '+fmt(s.run.insight)+' · 现存灵石 '+fmt(s.run.stones)+'</div>';
 toast("抽卡成功 · "+result.items.length+"张机缘已结算");
}
function afterBattle(result){
 if(!result)return;
 set("combatReport",result.won?(result.type==="mob"?"本关小怪":"挑战")+"胜利 · "+result.combat.turns+"回合":"挑战失败 · 仍在当前关刷小怪");
 set("rewardLabel","◆ +"+fmt(result.stones)+" / 修为 +"+fmt(result.qi));
 animateCombat(result);
 if(result.won&&result.type==="boss")toast(result.bossCleared?"雾隐剑冢已通关！可以轮回或突破筑基。":"地图Boss已击败，下一张地图开放！");
 else if(!result.won&&result.type!=="mob")toast("守卫仍很强。继续刷本关小怪进行抽卡成长。",true);
}
function stopAuto(){auto=false;if(timer!==null)clearTimeout(timer);timer=null;$("intervalFill").classList.remove("running");renderTop()}
function schedule(){
 if(!auto||document.hidden)return;
 const y=yields(s,c),delay=Math.max(900,1550*(1-y.speedPct/100));
 const fill=$("intervalFill");fill.classList.remove("running");void fill.offsetWidth;
 fill.style.setProperty("--interval-duration",delay+"ms");fill.classList.add("running");
 timer=setTimeout(()=>{
  if(!auto||document.hidden)return;
  const result=doCommand("BATTLE",{enemyType:"mob"});
  afterBattle(result);
  if(!result){stopAuto();return}
  if(autoPush&&!s.run.bossCleared){
   const target=s.run.checkpoint===c.checkpointsPerMap-1?"boss":"guardian",predict=fight(s,c,target);
   if(predict.won){
    const advance=doCommand("BATTLE",{enemyType:target});afterBattle(advance);
    if(!advance?.won){autoPush=false;toast("当前守卫失败，已关闭自动冲关并继续原地刷怪。",true)}
   }
  }
  schedule();
 },delay);
}
function startAuto(){
 if(auto){stopAuto();return}
 if(s.run.bossCleared)toast("已通关四图：继续刷最后一关小怪，积累突破丹药或因果准备。");
 auto=true;renderTop();schedule();toast("已开始当前关卡小怪自动刷取");
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
  $("mapAtlas").addEventListener("click",()=>{});
  document.addEventListener("click",e=>{
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
  $("autoPush").addEventListener("click",()=>{autoPush=!autoPush;render();toast("自动冲关已"+(autoPush?"开启，战斗预测通过才进行挑战。":"关闭。"))});
  $("breakthrough").addEventListener("click",()=>{const r=doCommand("BREAKTHROUGH");if(r){toast("突破成功："+r.name+"！");changeView("cultivate")}});
  $("reincarnate").addEventListener("click",()=>{if(!window.confirm("确认轮回？会清空本世地图、修为、灵石和全部当世卡牌，但保留天命与因果。"))return;
   stopAuto();const r=doCommand("REINCARNATE");if(r){playToken++;toast("轮回成功！获得"+r.earned+"因果，永久遗物继续生效。");changeView("fate")}});
  $("openRelic").addEventListener("click",()=>{const r=doCommand("OPEN_RELIC");if(r){
   $("relicResult").innerHTML='获得 <strong>'+escapeHTML(r.relic.name)+'</strong> ×'+r.stacks+
    (r.ultra?'<div class="v8-draw-card tian">鸿蒙异宝追加获得：'+escapeHTML(r.ultra.name)+'</div>':"");
   toast("天命箱开启成功，永久加成已写入跨世存档！")
  }});
  $("exportSave").addEventListener("click",exportSave);
  $("resetSave").addEventListener("click",()=>{if(!window.confirm("确认备份当前v0.8存档并从炼气初期重开？旧版存档不会被修改。"))return;
   stopAuto();playToken++;s=backupAndReset(c);set("saveStatus","已备份旧存档并重新开始");render();changeView("explore")});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&auto){stopAuto();toast("页面转后台已暂停。此版本不会凭空发放离线收益。")}});
 }catch(error){toast("初始化失败："+error.message,true);set("saveStatus",error.stack||error.message)}
}
init();
