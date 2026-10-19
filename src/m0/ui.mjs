import {loadM0Catalog,STAGE_LIMIT,PACK_ORDER,RARITIES,packUnlocked} from "./catalog.mjs";
import {createM0Save,getHeroStats,effects,levelCap,M0_SAVE_KEY} from "./state.mjs";
import {executeM0,battlePreview} from "./engine.mjs";
import {loadM0Save,saveM0Save,resetM0Save} from "./storage.mjs";

const el=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString("zh-CN");
const safe=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const rates="黄54% · 玄31% · 地12% · 天3%";
let catalog,save,auto=false,busy=false,timer=null,storageOkay=true,lastBattle=null;
let loglines=[],modalVisible=false;
const icons={battle:"⚔",wealth:"◈",cultivation:"☯",elixir:"✦"};
function setStatus(msg,bad=false){el("saveStatus").textContent=msg;el("saveStatus").style.color=bad?"var(--red)":"var(--muted)";}
function transaction(command){
 if(!save||!catalog)return null;
 const action={...command,txnId:"tx:"+(save.txSequence+1)};
 const out=executeM0(save,action,catalog);
 if(storageOkay)saveM0Save(out.state);
 save=out.state;
 recordEvents(out.events);
 paint();
 return out;
}
function recordEvents(events){
 for(const evt of events){
  let msg="",cls="";
  switch(evt.type){
   case "BattleResolved":msg=(evt.won?"击败":"未击败")+"第"+evt.floor+"层 · "+evt.turns+"回合"+(evt.procs?" · 战斗特性触发"+evt.procs+"次":"")+(evt.absorbed?" · 吸收"+evt.absorbed+"伤害":"")+(evt.regen?" · 敌人回血"+evt.regen:"");cls=evt.won?"positive":"negative";break;
   case "Reward":msg="灵石 +"+evt.stones+" · 修为 +"+evt.xp+(evt.firstClear?" · 首通额外奖励":"");break;
   case "NewDepth":msg="主线推进到第 "+evt.depth+" 层";cls="positive";break;
   case "PackUnlocked":msg="新卡包解锁："+evt.name+"！";cls="positive";break;
   case "RealmGate":msg="境界锁！击败守关后需要抽到筑基丹、达到Lv."+evt.level+"才能继续";cls="negative";break;
   case "AutoFarm":msg="卡关，自动退至第"+evt.floor+"层发育";cls="negative";break;
   case "AutoRetry":msg="抽卡提升战力，自动重新挑战第"+evt.floor+"层";cls="positive";break;
   case "PackDrawn":msg="开启"+catalog.packs[evt.packId].name+" "+evt.count+"抽 · 消耗"+evt.cost+"灵石";cls="positive";break;
   case "RealmBreakthrough":msg="消耗筑基丹，突破至筑基境！新的关卡开放";cls="positive";break;
   case "PrototypeComplete":msg="青云山麓30层全部挑战完成；继续扫荡试验卡包";cls="positive";break;
   case "ModeChanged":msg="探索模式："+({push:"冲关",farm:"扫荡",paused:"暂停"}[evt.mode]);break;
   case "TraitEquipped":msg="主战特性："+evt.name;cls="positive";break;
   case "FarmTargetChanged":msg="扫荡第"+evt.floor+"层";break;
  }
  if(msg)loglines.unshift({msg,cls});
 }
 loglines=loglines.slice(0,36);
 el("logs").innerHTML=loglines.length?loglines.slice(0,11).map(l=>'<div class="log '+l.cls+'">'+safe(l.msg)+'</div>').join(""):'<div class="log">开始自动探索或抽一张战力卡。</div>';
}
function paint(){
 if(!save||!catalog)return;
 const e=save.run.exploration,h=save.run.hero,stats=getHeroStats(save,catalog),
   p=battlePreview(save,catalog),levelLimit=levelCap(save,catalog);
 el("level").textContent=(e.ascended?"筑基":"练气")+" · Lv."+h.level;
 el("cap").textContent="当前修炼上限 Lv."+levelLimit+(h.level>=levelLimit?" · 已达上限，抽修为包提高":"");
 el("stones").textContent=fmt(save.run.stones);
 el("experience").textContent=fmt(save.run.cultivationXp)+" / "+(h.level>=levelLimit?"已封顶":fmt(p.xpRequired));
 el("xpbar").style.width=(h.level>=levelLimit?100:Math.min(100,save.run.cultivationXp/p.xpRequired*100))+"%";
 el("depth").textContent=e.highestCleared+" / 30";
 el("speed").textContent="灵石 +"+p.stoneBonusPct+"% / 修为 +"+p.xpBonusPct+"% / 速度 +"+p.speedPct+"%";
 el("stage").textContent="普通 · 第 "+p.stage.floor+" 层"+(p.stage.floor%10===0?" · 守关":"");
 el("enemyName").textContent=p.special?.name||p.stage.enemyName;
 el("enemyStats").textContent=(p.special?.hint||"普通敌人 · 资源稳定产出")+" · 参考掉落"+Math.floor(p.stage.stones*catalog.economy.stoneScale*(p.special?.rewardScale||1))+"灵石";
 el("heroStats").textContent="攻"+fmt(stats.attack)+" · 血"+fmt(stats.hp)+" · 防"+fmt(stats.defense);
 el("enemyCompact").textContent="攻"+fmt(p.enemy.attack)+" · 血"+fmt(p.enemy.hp)+" · 防"+fmt(p.enemy.defense);
 el("preview").textContent=(p.predicted.won?"预计能够获胜":"预计难以获胜")+" · 回合数"+p.predicted.turns+(p.mechanic?" · "+catalog.traitDefinitions[p.mechanic.id].name:"")+(p.predicted.absorbed?" · 护盾吸收"+p.predicted.absorbed:"")+(p.predicted.regenTotal?" · 敌人回复"+p.predicted.regenTotal:"");
 el("preview").className="combatline "+(p.predicted.won?"flag":"danger");
 const rec=p.diagnosis,rp=rec.packId?catalog.packs[rec.packId]:null;
 el("diagnosis").innerHTML="<strong>"+safe(rec.heading)+"</strong>"+safe(rec.detail)+(rp?"<div class='focus-pack'>建议抽："+safe(rp.name)+" · "+rp.cost+"灵石/抽</div>":"");
 const modes={push:"继续冲关",farm:e.farmReason==="gate"?"境界锁 · 扫荡修炼":e.farmReason==="defeat"?"战败 · 自动退层发育":"旧层扫荡",paused:"已暂停"};
 el("mode").textContent=(auto?"自动 · ":"")+modes[e.mode];
 el("battles").textContent=e.battleCount+"战 · "+e.winCount+"胜";
 el("auto").textContent=auto?"停止自动":"开启自动推图";
 el("auto").disabled=false;
 el("push").disabled=e.highestCleared>=STAGE_LIMIT || p.gateLocked;
 el("farm").disabled=e.highestCleared<1;
 const selector=el("farmTarget");
 selector.disabled=e.highestCleared<1;
 if(selector.options.length!==e.highestCleared){
  selector.innerHTML=Array.from({length:e.highestCleared},(_,i)=>'<option value="'+(i+1)+'">第'+(i+1)+'层</option>').join("")||
   '<option value="0">先通关第1层</option>';
 }
 if(e.highestCleared>0)selector.value=String(e.mode==="farm"?e.farmFloor:e.highestCleared);
 el("single").textContent=e.mode==="farm"?"扫荡一场":"挑战一场";
 if(!el("progress").children.length){
   el("progress").innerHTML=Array.from({length:STAGE_LIMIT},(_,i)=>'<span class="floor" data-floor="'+(i+1)+'">'+(i+1)+'</span>').join("");
 }
 for(const mark of el("progress").children){
   const n=Number(mark.dataset.floor);
   mark.className="floor"+(n%10===0?" boss":"")+(n<=e.highestCleared?" done":n===e.highestCleared+1?" next":"");
 }
 const nextPack=PACK_ORDER.map(id=>catalog.packs[id]).find(pack=>!packUnlocked(save,pack));
 el("nextUnlock").textContent=nextPack?"第"+nextPack.unlockedAt+"层解锁："+nextPack.name:p.gateLocked?"下一目标：筑基突破":"当前已开放全部M0卡包";
 const req=catalog.ascension,pills=save.run.gacha.pills[req.requiredPill]||0;
 el("pillCounter").textContent="筑基丹 ×"+pills;el("gateLevel").textContent="修为等级 Lv."+h.level+" / "+req.requiredLevel;
 const reqs=[];
 if(e.highestCleared<req.requiredCleared)reqs.push("先击破第"+req.requiredCleared+"层守关");
 if(h.level<req.requiredLevel)reqs.push("修炼等级还差"+(req.requiredLevel-h.level)+"级（修为造化包）");
 if(!pills)reqs.push("缺少筑基丹（丹道宝匣）");
 el("gateStatus").textContent=e.ascended?"已筑基":e.highestCleared>=req.requiredCleared?"待突破":"第20层开启";
 el("gateDescription").textContent=e.ascended?"筑基突破成功！此后可继续挑战第21–30层。":
  "境界锁：第20层守关击破后，必须满足Lv.12和筑基丹×1。"+(reqs.length?" 当前条件："+reqs.join("；"):" 条件已满足，点击突破。");
 el("breakthrough").disabled=e.ascended||reqs.length>0;
 el("breakthrough").textContent=e.ascended?"筑基完成":reqs.length?"尚需满足突破条件":"消耗筑基丹 · 突破筑基";
 el("packs").innerHTML=PACK_ORDER.map(id=>{
   const pack=catalog.packs[id],unlocked=packUnlocked(save,pack),draws=save.run.gacha.packDraws[id];
   const info=pack.pityTarget?"筑基丹："+(save.run.gacha.pills[pack.pityTarget]||0)+"枚 · 距保底最多"+Math.max(1,pack.pityAt-save.run.gacha.sinceKeyPill)+"抽":rates;
   return '<article class="pack'+(unlocked?"":" locked")+'"><div class="packhead"><span class="packname">'+icons[id]+" "+safe(pack.name)+'</span><span class="packtag">'+(unlocked?"已开放":"第"+pack.unlockedAt+"层解锁")+'</span></div><div class="packinfo">'+safe(pack.description)+'</div>'+
     '<div class="packstats">累计 '+draws+" 抽 · "+safe(info)+'</div>'+
     '<div class="packactions"><button class="btn '+(id==="battle"?"primary":"secondary")+'" data-pack="'+id+'" data-count="1" '+(!unlocked||save.run.stones<pack.cost?"disabled":"")+'>单抽 · '+pack.cost+'</button>'+
     '<button class="btn secondary" data-pack="'+id+'" data-count="10" '+(!unlocked||save.run.stones<pack.cost*10?"disabled":"")+'>十连 · '+(pack.cost*10)+'</button></div>'+
     (!unlocked?'<div class="lockedhint">推进主线，自动解锁本卡包。</div>':"")+'</article>';
 }).join("");
 const owned=Object.entries(save.run.gacha.cards).filter(([id,n])=>n>0);
 const items=owned.sort((a,b)=>Object.keys(RARITIES).indexOf(catalog.cards[b[0]].rarity)-Object.keys(RARITIES).indexOf(catalog.cards[a[0]].rarity))
  .map(([id,n])=>{
   const card=catalog.cards[id],trait=card.effect==="battleTrait",selected=save.run.gacha.equippedTrait===id;
   return '<div class="owned'+(trait?' trait-item':'')+'"><div><b class="rare-'+card.rarity+'">'+safe(card.name)+'</b>'+
    '<small>'+safe(card.description)+'</small>'+(trait?'<button class="equip-btn '+(selected?'active':'')+'" data-equip="'+id+'" '+(selected?'disabled':'')+'>'+(selected?'当前主战特性':'装备此特性')+'</button>':'')+
    '</div><span class="count">×'+n+'</span></div>';
  });
 if(pills)items.unshift('<div class="owned"><div><b class="rare-xuan">筑基丹</b><small>境界突破时消耗1枚</small></div><span class="count">×'+pills+'</span></div>');
 el("collectionCount").textContent=owned.length+"种卡 · "+pills+"枚筑基丹";
 el("collection").innerHTML=items.length?items.join(""):'<div class="empty">尚未获得任何卡牌，建议先抽战力秘藏。</div>';
 if(lastBattle)el("lastBattle").textContent=(lastBattle.won?"获胜":"战败")+" · "+lastBattle.enemyName+" · "+lastBattle.combat.turns+"回合 · 灵石+"+lastBattle.stones+" · 修为+"+lastBattle.xp+
    (lastBattle.firstClear?"（首通奖励）":"")+(e.farmReason==="defeat"?" · 已退上一层发育":"");
}
function mode(mode){if(save.run.exploration.mode!==mode)transaction({type:"SET_MODE",mode});}
function oneBattle(){
 if(busy||modalVisible||!catalog||!save)return;
 busy=true;
 try{
  if(save.run.exploration.mode==="paused"){
   const e=save.run.exploration;
   mode(e.highestCleared===STAGE_LIMIT||e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended?"farm":"push");
  }
  lastBattle=transaction({type:"BATTLE"})?.result;
 }catch(e){stopAuto();setStatus("战斗异常："+e.message,true);}
 finally{busy=false;}
}
function stopAuto(){auto=false;if(timer!==null)clearTimeout(timer);timer=null;if(save&&catalog)paint();}
function schedule(){
 if(!auto)return;
 if(timer!==null)clearTimeout(timer);
 const delay=Math.max(420,1150*(1-battlePreview(save,catalog).speedPct/100));
 timer=setTimeout(()=>{timer=null;if(!auto)return;if(document.hidden||modalVisible){schedule();return;}oneBattle();if(auto)schedule();},delay);
}
function startAuto(){
 if(auto){stopAuto();return;}
 try{
  const e=save.run.exploration;
  if(e.mode==="paused")mode(e.highestCleared===STAGE_LIMIT||e.highestCleared>=catalog.ascension.requiredCleared&&!e.ascended?"farm":"push");
  auto=true;paint();oneBattle();schedule();
 }catch(e){stopAuto();setStatus("不能开始自动探索："+e.message,true);}
}
function openResults(result,before,after){
 const pack=catalog.packs[result.packId];
 el("modalTitle").textContent=pack.name+" · "+result.count+"次机缘";
 const changes=before&&after?
  '<div class="diagnosis"><strong>抽卡后的真实变化</strong>'+
  '攻击 '+fmt(before.hero.attack)+' → '+fmt(after.hero.attack)+
  ' · 气血 '+fmt(before.hero.hp)+' → '+fmt(after.hero.hp)+
  ' · 防御 '+fmt(before.hero.defense)+' → '+fmt(after.hero.defense)+
  ' · 灵石收益 +'+before.stoneBonusPct+'% → +'+after.stoneBonusPct+'%'+
  ' · 修为收益 +'+before.xpBonusPct+'% → +'+after.xpBonusPct+'%'+
  (before.stage.floor===after.stage.floor?
   ' · 本关推演 '+(before.predicted.won?'可赢':'未过')+' → '+(after.predicted.won?'可赢':'未过'):
   ' · 已自动切回下一层冲关')+'</div>':'';
 el("modalResults").innerHTML='<p class="subtle">已花费'+result.cost+'灵石。卡牌与丹药已即时结算，同名卡叠层。</p>'+changes+
  '<div class="draw-grid">'+result.items.map(item=>'<div class="draw-card rare-'+item.rarity+'"><div class="rarity">'+RARITIES[item.rarity]+'</div><strong>'+safe(item.name)+'</strong><small>'+safe(item.description)+'</small></div>').join("")+'</div>';
 modalVisible=true;el("drawModal").classList.add("open");el("drawModal").setAttribute("aria-hidden","false");el("modalDone").focus();
}
function closeModal(){modalVisible=false;el("drawModal").classList.remove("open");el("drawModal").setAttribute("aria-hidden","true");}
async function init(){
 try{
  const [stages,packs,encounters]=await Promise.all([
   fetch(new URL("../../data/codex/codex.v0.5.json",import.meta.url)).then(r=>{if(!r.ok)throw Error("关卡JSON HTTP "+r.status);return r.json()}),
   fetch(new URL("../../data/m0-packs.v0.7.json",import.meta.url)).then(r=>{if(!r.ok)throw Error("卡包JSON HTTP "+r.status);return r.json()}),
   fetch(new URL("../../data/m0-encounters.v0.7.json",import.meta.url)).then(r=>{if(!r.ok)throw Error("机制JSON HTTP "+r.status);return r.json()})
  ]);
  catalog=loadM0Catalog(stages,packs,encounters);
  let loaded;try{loaded=loadM0Save();}catch(e){storageOkay=false;loaded={state:createM0Save(),status:"memory",error:String(e)};}
  save=loaded.state;
  if(loaded.status==="invalid"){storageOkay=false;setStatus("检测到损坏的新存档：已在内存开启临时新档，原存档未覆盖。",true);}
  else setStatus(loaded.status==="restored"?"已恢复 M0.2 抽卡存档":"全新抽卡存档已就绪。首次战力抽卡可立即进行。");
  recordEvents([]);paint();
 }catch(e){setStatus("加载失败："+e.message,true);for(const id of ["single","auto","push","farm","stop","breakthrough"])el(id).disabled=true;}
}
el("collection").addEventListener("click",e=>{
 const btn=e.target.closest("[data-equip]");if(!btn||btn.disabled||!save)return;
 try{transaction({type:"EQUIP_TRAIT",cardId:btn.dataset.equip});}
 catch(error){setStatus("装配失败："+error.message,true);}
});
el("goExplore").addEventListener("click",()=>el("battlePanel").scrollIntoView({behavior:"smooth",block:"start"}));
el("goGacha").addEventListener("click",()=>el("packPanel").scrollIntoView({behavior:"smooth",block:"start"}));
el("packs").addEventListener("click",e=>{
 const btn=e.target.closest("[data-pack]");if(!btn||btn.disabled||!save)return;
 try{const beforeSave=structuredClone(save);const result=transaction({type:"DRAW",packId:btn.dataset.pack,count:Number(btn.dataset.count)});beforeSave.seed=save.seed;const before=battlePreview(beforeSave,catalog),after=battlePreview(save,catalog);openResults(result.result,before,after);}
 catch(err){setStatus("抽卡失败："+err.message,true);}
});
el("single").addEventListener("click",()=>{stopAuto();oneBattle();});
el("auto").addEventListener("click",startAuto);
el("farmTarget").addEventListener("change",event=>{
 if(!save||!catalog)return;
 try{transaction({type:"SET_FARM_TARGET",floor:Number(event.target.value)});}
 catch(error){setStatus("无法切换扫荡层："+error.message,true);}
});
el("farm").addEventListener("click",()=>{if(!save)return;try{mode("farm");if(!auto)startAuto();}catch(e){setStatus(e.message,true);}});
el("push").addEventListener("click",()=>{if(!save)return;try{mode("push");if(!auto)startAuto();}catch(e){setStatus(e.message,true);}});
el("stop").addEventListener("click",()=>{stopAuto();if(save)mode("paused");});
el("breakthrough").addEventListener("click",()=>{
 try{transaction({type:"BREAKTHROUGH"});if(auto)schedule();}catch(e){setStatus("无法突破："+e.message,true);}
});
el("closeModal").addEventListener("click",closeModal);el("modalDone").addEventListener("click",closeModal);
el("drawModal").addEventListener("click",e=>{if(e.target===el("drawModal"))closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});
el("reset").addEventListener("click",()=>{
 if(!confirm("备份当前抽卡版存档并重新开始？历史 v0.1 与 M0初版存档不会修改。"))return;
 stopAuto();
 try{save=resetM0Save();storageOkay=true;loglines=[];lastBattle=null;recordEvents([]);setStatus("已备份新旧进度，重新开始抽卡版。");paint();}
 catch(e){setStatus("重开失败："+e.message,true);}
});
el("export").addEventListener("click",()=>{
 if(!save)return;const blob=new Blob([JSON.stringify(save,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="gacha-ascension-v0.7-save.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&auto){stopAuto();setStatus("切到后台，已暂停自动战斗；不会累计离线资源。");}});
init();
