/** Cosmetic-only gacha reveal. Transaction MUST settle before show; never mutate the save here.
 * All packs have individual motion identities; high rarity extends light accents, not probabilities.
 */
const FLAVORS={
 battle:["⚔","杀伐剑意，破境而来。"],wealth:["◆","灵石聚散，财运天降。"],
 cultivation:["☯","一缕明悟，自识海点亮。"],technique:["✦","万千经文，在此刻凝成。"],
 cave:["⌂","洞天初成，万象滋生。"],pet:["♧","灵契共鸣，灵兽回应召唤。"],
 elixir:["⚗","丹火旋转，仙药化形。"],equipment:["⚒","器物灵纹，缓缓浮现。"],fate:["✧","命运长河，流转不息。"]
};
const RARITY={huang:"黄阶",xuan:"玄阶",di:"地阶",tian:"天阶",xian:"仙阶",
 taigu:"太古奇珍",hongmeng:"鸿蒙异宝"};
const maxRarity=rarity=>["huang","xuan","di","tian","xian","taigu","hongmeng"].indexOf(rarity);
const escape=t=>String(t).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
export async function showReveal({packId="battle",items=[],title="机缘已至"}){
 const overlay=document.getElementById("revealOverlay");
 const stage=document.getElementById("revealStage");
 if(!overlay||!stage)return;
 const key=FLAVORS[packId]?packId:"battle",identity=FLAVORS[key];
 const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
 const subtitle=document.getElementById("revealSubtitle");
 const sigil=document.getElementById("revealSigil");
 const flavor=document.getElementById("revealFlavor");
 const cards=document.getElementById("revealCards");
 const skip=document.getElementById("skipReveal");
 const close=document.getElementById("closeReveal");
 const titleEl=document.getElementById("revealTitle");
 let timers=[],settled=false;
 const delay=(fn,ms)=>timers.push(setTimeout(fn,ms));
 const cleanup=()=>{timers.forEach(clearTimeout);timers=[]};
 const take=items.filter(Boolean).sort((a,b)=>maxRarity(b.rarity)-maxRarity(a.rarity));
 stage.dataset.pack=key;stage.dataset.phase="charge";
 stage.dataset.maxRarity=take[0]?.rarity||"huang";
 titleEl.textContent=title;subtitle.textContent=key==="fate"?"永恒遗物 · 跨世传承":"机缘降临 · "+take.length+"道灵光";
 sigil.textContent=identity[0];flavor.textContent=identity[1];cards.replaceChildren();
 close.hidden=true;skip.hidden=false;overlay.hidden=false;
 const previous=document.activeElement;skip.focus();
 const getCards=()=>take.map((x,index)=>
  '<div class="v8-reveal-card rarity-'+escape(x.rarity||"huang")+'" style="--entry:'+index+'">'+
  '<small>'+escape(RARITY[x.rarity]||"机缘")+'</small><strong>'+escape(x.name)+'</strong>'+
  '<span>'+escape(x.description||x.subtitle||"已经记入你的修行图鉴")+'</span></div>').join("");
 function finishReveal(){
  if(stage.dataset.phase==="done")return;
  stage.dataset.phase="done";
  cards.innerHTML=getCards();
  skip.hidden=true;close.hidden=false;close.focus();
 }
 function beginRevealing(){
  if(stage.dataset.phase==="done")return;
  stage.dataset.phase="reveal";cards.innerHTML=getCards();
  delay(finishReveal,reduced?0:Math.min(1100,360+take.length*65));
 }
 return new Promise(resolve=>{
  const finish=()=>{
   if(settled)return;settled=true;cleanup();
   overlay.hidden=true;stage.dataset.phase="charge";skip.onclick=null;close.onclick=null;
   if(previous&&typeof previous.focus==="function")previous.focus();
   resolve();
  };
  skip.onclick=()=>{cleanup();finishReveal()};
  close.onclick=finish;
  if(reduced){finishReveal();return}
  delay(beginRevealing,480);
 });
}
