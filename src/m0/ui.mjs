import {loadM0Catalog,STAGE_LIMIT,TRAINING} from "./catalog.mjs";
import {createM0Save,getHeroStats,getTrainingPreview,M0_SAVE_KEY} from "./state.mjs";
import {executeM0,battlePreview} from "./engine.mjs";
import {loadM0Save,saveM0Save,resetM0Save} from "./storage.mjs";

const el=id=>document.getElementById(id);
const fmt=n=>Number(n).toLocaleString("zh-CN");
let catalog,save,auto=false,busy=false,timer=null,serial=0,lastEvents=[],lastResult=null,storageOkay=true;
const progressEl=el("progress");
function status(message,problem=false){
  el("saveStatus").textContent=message;el("saveStatus").style.color=problem?"#ffb6a2":"var(--muted)";
}
function txid(){serial++;return "m0-"+Date.now().toString(36)+"-"+serial+"-"+Math.floor(performance.now()*1000).toString(36);}

function act(command){
  const executed=executeM0(save,{...command,txnId:txid()},catalog);
  // Persist BEFORE replacing live state to avoid an invisible uncommitted in-memory reward.
  if(storageOkay){
    saveM0Save(executed.state);
    status("本地已保存 · 独立存档键 "+M0_SAVE_KEY);
  }
  save=executed.state;
  lastEvents=executed.events;
  if(command.type==="BATTLE")lastResult=executed.result;
  render();
  return executed;
}
function modeChange(mode){
  if(save.run.exploration.mode!==mode)act({type:"SET_MODE",mode});
}
function render(){
  if(!catalog||!save)return;
  const hero=getHeroStats(save),e=save.run.exploration,p=battlePreview(save,catalog);
  const xpRequired=p.nextXp;
  el("level").textContent="练气 · Lv."+save.run.hero.level;
  el("stones").textContent=fmt(save.run.stones);
  el("experience").textContent=fmt(save.run.cultivationXp)+" / "+fmt(xpRequired);
  el("xpbar").style.width=Math.min(100,100*save.run.cultivationXp/xpRequired)+"%";
  el("depth").textContent=e.highestCleared+" / "+STAGE_LIMIT;
  el("stage").textContent="普通 · 第 "+p.stage.floor+" 层 · "+p.stage.class;
  el("enemyName").textContent=p.stage.enemyName;
  el("enemyStats").textContent="基础掉落：灵石 "+p.stage.stones+" · 修为 "+p.stage.cultivationXp;
  el("heroStats").textContent="攻 "+fmt(hero.attack)+" · 血 "+fmt(hero.hp)+" · 防 "+fmt(hero.defense);
  el("enemyCompact").textContent="攻 "+fmt(p.enemy.attack)+" · 血 "+fmt(p.enemy.hp)+" · 防 "+fmt(p.enemy.defense);
  el("preview").textContent="预计每击伤害 "+p.heroPerHit+" / 受到 "+p.enemyPerHit+
    " · 击败约 "+p.hitsToKill+" 回合 / 生存约 "+p.hitsToFall+" 回合";
  el("preview").className="combatline "+(p.likelyOutcome==="优势"?"flag":"danger");
  const modeLabel={push:"冲层",farm:"卡关扫荡",paused:"已暂停"}[e.mode];
  el("mode").textContent=(auto?"自动 · ":"")+modeLabel;
  el("battles").textContent=e.battleCount+" 战 · "+e.winCount+" 胜";
  const nextBoss=[10,20,30].find(x=>x>e.highestCleared);
  el("firstClear").textContent=nextBoss?"距离第"+nextBoss+"层守关："+(nextBoss-e.highestCleared)+"层":"青云样例已通关";
  if(!progressEl.childElementCount){
    const fragment=document.createDocumentFragment();
    for(let i=1;i<=30;i++){
      const marker=document.createElement("span");marker.textContent=i;
      marker.className="floor"+(i%10===0?" boss":"");marker.dataset.floor=String(i);
      fragment.appendChild(marker);
    }
    progressEl.appendChild(fragment);
  }
  for(const marker of progressEl.children){
    const floor=Number(marker.dataset.floor);
    marker.className="floor"+(floor%10===0?" boss":"")+
      (floor<=e.highestCleared?" done":floor===e.highestCleared+1?" next":"");
  }
  const unlocked=!!save.meta.featureUnlocks.hero_training;
  el("trainingLock").textContent=unlocked?"已解锁":"第3层解锁";
  for(const stat of ["attack","hp","defense"]){
    const preview=getTrainingPreview(save,stat);
    el(stat+"Lv").textContent="Lv."+preview.level;
    el(stat+"Desc").textContent="每级 +"+preview.amount+({attack:" 攻击",hp:" 气血",defense:" 防御"}[stat])+" · 下级需要 "+fmt(preview.cost)+" 灵石";
    const button=el("train"+stat);
    button.textContent=fmt(preview.cost)+" 灵石";
    button.disabled=!unlocked||save.run.stones<preview.cost||preview.level>=300;
  }
  el("auto").disabled=e.highestCleared>=STAGE_LIMIT;
  el("farm").disabled=e.highestCleared<1;
  el("single").disabled=false;
  el("single").textContent=e.highestCleared>=STAGE_LIMIT?"扫荡第30层":e.mode==="farm"?"扫荡一场":"单次挑战";
  if(lastResult){
    el("lastBattle").textContent=(lastResult.won?"胜利":"战败")+" · "+lastResult.enemyName+
      " · "+lastResult.combat.turns+" 回合 · 灵石+"+lastResult.stones+" · 修为+"+lastResult.cultivationXp+
      (lastResult.firstClear?" · 首通奖励已领取":"")+
      (!lastResult.won?" · 已转往可打关卡积累资源":"");
  }
  if(lastEvents.length){
    const rows=[];
    for(const x of [...lastEvents].reverse()){
      switch(x.type){
        case "BattleResolved":rows.push("第 "+(lastResult?.stageFloor??"?")+" 层 · "+(x.won?"<strong>战斗胜利</strong>":"<strong>战斗失败</strong>")+" · "+x.turns+" 回合");break;
        case "ResourceAwarded":rows.push("灵石 <strong>+"+x.stones+"</strong>，修为 <strong>+"+x.cultivationXp+"</strong>"+(x.firstClear?"（包含首通一次性奖励）":""));break;
        case "HeroLeveled":rows.push("修为突破！角色等级升至 <strong>Lv."+x.level+"</strong>");break;
        case "HeroTrained":rows.push("完成"+TRAINING[x.stat].label+" Lv."+x.level+"，消费灵石 "+x.cost);break;
        case "StageFirstCleared":rows.push("首次通关第 <strong>"+x.depth+"</strong> 层，下一层已开放");break;
        case "FeatureUnlocked":rows.push("<strong>"+x.name+"</strong> 已解锁，可直接投入灵石");break;
        case "AutoFarmSelected":rows.push("未能获胜，自动切换至第 "+x.depth+" 层扫荡");break;
        case "ModeChanged":rows.push("探索模式切换为 "+({push:"冲层",farm:"扫荡",paused:"暂停"}[x.mode]));break;
        case "PrototypeStageLimitReached":rows.push("青云山麓30层已全部击破！后续境界玩法在M1实现");break;
      }
    }
    // Rows contain only constant UI strings plus validated numeric data.
    el("logs").innerHTML=rows.slice(0,12).map(row=>'<div class="log">'+row+"</div>").join("");
  }
}
function stopAuto(){
  auto=false; if(timer!==null){clearInterval(timer);timer=null;}
  render();
}
function battleOnce(){
  if(busy)return;
  busy=true;
  try{
    if(save.run.exploration.mode==="paused"){
      if(save.run.exploration.highestCleared===STAGE_LIMIT)modeChange("farm");
      else modeChange("push");
    }
    act({type:"BATTLE"});
    if(save.run.exploration.highestCleared>=STAGE_LIMIT && auto)stopAuto();
  }catch(error){stopAuto();status("操作失败："+error.message,true);}
  finally{busy=false;}
}
function startAuto(mode){
  stopAuto();
  try{modeChange(mode);auto=true;render();battleOnce();timer=setInterval(battleOnce,950);}
  catch(error){stopAuto();status("不能开始自动探索："+error.message,true);}
}
async function init(){
  try{
    const url=new URL("../../data/codex/codex.v0.5.json",import.meta.url);
    const res=await fetch(url);
    if(!res.ok)throw Error("数值定义 HTTP "+res.status);
    catalog=loadM0Catalog(await res.json());
    let loaded;
    try{loaded=loadM0Save();}catch(e){storageOkay=false;loaded={state:createM0Save(),status:"memory",error:String(e)};}
    save=loaded.state;
    if(loaded.status==="invalid"){storageOkay=false;status("已有M0存档无法通过校验，暂使用内存新档。未覆盖损坏存档："+loaded.error,true);}
    else if(loaded.status==="memory")status("浏览器本地存储不可用，进度仅在本页保存",true);
    else status(loaded.status==="restored"?"已从本地存档恢复":"新进度已就绪");
    render();
  }catch(err){status("M0载入失败："+err.message+"。请刷新或检查Pages是否部署完整。",true);
    el("lastBattle").textContent="无法载入。战斗功能已停止。";
    for(const id of ["single","auto","farm","stop","trainattack","trainhp","traindefense"])el(id).disabled=true;}
}
el("single").addEventListener("click",()=>{stopAuto();battleOnce();});
el("auto").addEventListener("click",()=>{if(save&&catalog)startAuto("push");});
el("farm").addEventListener("click",()=>{if(save&&catalog)startAuto("farm");});
el("stop").addEventListener("click",()=>{
  stopAuto();if(save&&catalog){try{modeChange("paused");}catch(error){status(error.message,true);}}
});
for(const stat of ["attack","hp","defense"])el("train"+stat).addEventListener("click",()=>{
  if(!save||!catalog)return;
  try{act({type:"TRAIN_HERO",stat});}catch(error){status("修炼失败："+error.message,true);}
});
el("reset").addEventListener("click",()=>{
  if(!confirm("确定备份当前 M0 记录并重开？旧版 v0.1 进度不会受影响。"))return;
  stopAuto();
  try{save=resetM0Save();storageOkay=true;lastResult=null;lastEvents=[];el("logs").textContent="已保存上一份 M0 备份，并创建新档。";el("lastBattle").textContent="已重开，可重新挑战第1层。";status("新档已保存，上一个 M0 存档留在 backup 键");render();}
  catch(error){status("重开失败："+error.message,true);}
});
el("export").addEventListener("click",()=>{
  if(!save)return;
  const blob=new Blob([JSON.stringify(save,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="gacha-ascension-m0-save.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden && auto){stopAuto();status("页面切到后台，已自动停止战斗（无离线收益）");}
});
init();
