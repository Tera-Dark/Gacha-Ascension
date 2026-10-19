/**
 * Visual-only combat timeline. Combat/rewards are already committed by the reducer.
 * Never awards resources, rolls random numbers or mutates persistent state.
 */
export function battleFrames(combat,maxSteps=8) {
 const all=combat?.log||[];
 if(!Number.isInteger(maxSteps)||maxSteps<2)throw Error("Bad combat frame limit");
 if(all.length<=maxSteps)return all.map(x=>({...x}));
 const early=Math.ceil(maxSteps/2);
 const late=maxSteps-early;
 return [...all.slice(0,early),...all.slice(-late)].map(x=>({...x}));
}
export function createCombatPresenter(byId,readPreview) {
 let token=0,handles=[],playing=false;
 const set=(id,value)=>{const el=byId(id);if(el)el.textContent=value;};
 const bar=(id,cur,max)=>{
   const el=byId(id);if(el)el.style.width=(max>0?Math.max(0,Math.min(100,cur/max*100)):0)+"%";
 };
 const clear=()=>{for(const h of handles)clearTimeout(h);handles=[];};
 const wait=(fn,delay)=>{const handle=setTimeout(fn,delay);handles.push(handle);};
 const reduced=()=>typeof window!=="undefined"&&!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
 const resetFx=()=>{
   const impact=byId("clashSigil");if(impact)impact.classList.remove("clash");
   for(const id of ["heroSprite","enemySprite"]){const sprite=byId(id);if(sprite)sprite.classList.remove("lunge","struck");}
   const damageLayer=byId("damageLayer");if(damageLayer)damageLayer.replaceChildren();
 };
 function display(full,force=false){
  if(playing&&!force)return;
  const hero=full?.hero,enemy=full?.enemy;
  if(!hero||!enemy)return;
  set("heroHpValue",hero.hp+" / "+hero.hp);set("enemyHpValue",enemy.hp+" / "+enemy.hp);
  bar("heroBar",hero.hp,hero.hp);bar("enemyBar",enemy.hp,enemy.hp);
  set("duelEnemyName",full.special?.name||full.stage?.enemyName||"妖物");
  set("duelLabel","等待下一战");
 }
 function flashAt(actor,amount){
  const layer=byId("damageLayer");
  if(!layer||reduced())return;
  const pop=document.createElement("span");
  const heroSide=actor==="enemy",heal=actor==="regen",defend=actor==="ward";
  pop.className="damage-pop "+(heal?"heal-dmg":defend?"ward-dmg":heroSide?"hero-dmg":"enemy-dmg")+
   (actor==="combo"?" combo-dmg":actor==="counter"?" counter-dmg":"");
  pop.textContent=(heal?"+":defend?"抵挡 ":"−")+Math.round(amount);
  layer.appendChild(pop);
  wait(()=>pop.remove(),630);
 }
 function collision(actor){
  const attacker=byId(actor==="enemy"?"enemySprite":"heroSprite");
  const defender=byId(actor==="enemy"?"heroSprite":"enemySprite");
  const sigil=byId("clashSigil");
  if(reduced())return;
  for(const el of [attacker,defender,sigil]){
   if(!el)continue;
   el.classList.remove("lunge","struck","clash");
   void el.offsetWidth;
  }
  attacker?.classList.add("lunge");defender?.classList.add("struck");sigil?.classList.add("clash");
  wait(()=>{attacker?.classList.remove("lunge");defender?.classList.remove("struck");sigil?.classList.remove("clash");},220);
 }
 function cancel(){
  token++;playing=false;clear();resetFx();
  const progress=byId("intervalFill");progress?.classList.remove("running");
 }
 function play(payload){
  cancel();
  const current=++token;
  const {result,hero,enemy,enemyName}=payload;
  if(!result?.combat||!hero||!enemy)return;
  const combat=result.combat,frames=battleFrames(combat,reduced()?2:8);
  playing=true;
  set("duelEnemyName",enemyName||result.enemyName);
  set("duelLabel","交锋中");
  set("battleStatus","正在迎战第 "+result.floor+" 层");
  bar("heroBar",hero.hp,hero.hp);bar("enemyBar",enemy.hp,enemy.hp);
  set("heroHpValue",hero.hp+" / "+hero.hp);set("enemyHpValue",enemy.hp+" / "+enemy.hp);
  const displayDuration=reduced()?40:Math.min(940,Math.max(570,Number(payload.duration)||920));
  const step=displayDuration/Math.max(2,frames.length+1);
  frames.forEach((evt,i)=>wait(()=>{
   if(token!==current)return;
   const actor=evt.actor;
   if(actor==="hero"||actor==="combo"||actor==="counter"){
    bar("enemyBar",evt.remaining,enemy.hp);
    set("enemyHpValue",evt.remaining+" / "+enemy.hp);
    collision("hero");flashAt(actor,evt.amount);
   }else if(actor==="enemy"){
    bar("heroBar",evt.remaining,hero.hp);
    set("heroHpValue",evt.remaining+" / "+hero.hp);
    collision("enemy");flashAt("enemy",evt.amount);
    if(evt.blocked>0)flashAt("ward",evt.blocked);
   }else if(actor==="regen"){
    bar("enemyBar",evt.remaining,enemy.hp);
    set("enemyHpValue",evt.remaining+" / "+enemy.hp);
    flashAt("regen",evt.amount);
   }
   set("duelLabel",actor==="combo"?"剑气追击":actor==="counter"?"金身反震":actor==="regen"?"敌人回血":actor==="enemy"?"妖物反击":"剑气交锋");
  },i*step+80));
  wait(()=>{
   if(token!==current)return;
   bar("heroBar",combat.finalHeroHp,hero.hp);
   bar("enemyBar",combat.finalEnemyHp,enemy.hp);
   set("heroHpValue",combat.finalHeroHp+" / "+hero.hp);
   set("enemyHpValue",combat.finalEnemyHp+" / "+enemy.hp);
   set("duelLabel",result.won?"胜利 · 灵石 +"+result.stones:"惜败 · 返回旧层");
   set("battleStatus",result.won?"战斗胜利 · 资源已入账":"战斗失败 · 自动转扫荡");
   playing=false;
   resetFx();
  },displayDuration+110);
 }
 function interval(running,duration){
  const fill=byId("intervalFill");if(!fill)return;
  fill.classList.remove("running");void fill.offsetWidth;
  if(running){fill.style.setProperty("--interval-duration",Math.max(600,duration)+"ms");fill.classList.add("running");}
  else fill.style.width="0%";
 }
 return {play,display,cancel,interval,isPlaying:()=>playing};
}
