/** Local, decoded sprites. This module only paints; it never changes the save. */
const root=new URL('../../assets/pixel/',import.meta.url);
let assets=null,currentMap=0,showFox=false;
const images=new Map(),painters=new Map();
const byId=id=>document.getElementById(id);
const localAsset=src=>{
 if(typeof src!=='string'||!src||src.includes('..')||src.includes(':')||src.startsWith('/'))return null;
 return new URL(src,root).href;
};
export async function loadPixelAssets(){
 try{
  const response=await fetch(new URL('manifest.json',root));
  if(!response.ok)return;
  const manifest=await response.json();if(manifest.schemaVersion!==1)return;
  const files=new Set();
  const collect=value=>{
   if(Array.isArray(value)){value.forEach(collect);return}
   if(value&&typeof value==='object'){Object.values(value).forEach(collect);return}
   if(typeof value==='string'&&/\.(png|webp)$/.test(value)){const url=localAsset(value);if(url)files.add(url)}
  };
  [manifest.backgrounds,manifest.hero,manifest.enemies,manifest.pet].forEach(collect);
  await Promise.all([...files].map(async src=>{
   const image=new Image();image.src=src;
   try{await image.decode();images.set(src,image)}catch{ /* Keep the last valid frame. */ }
  }));
  assets=manifest;
  if(byId('artSourceStatus'))byId('artSourceStatus').textContent=manifest.provenance;
 }catch{ /* Optional local art never blocks the game. */ }
}
function paintFrame(id,entity,motion,now,reduced){
 const element=byId(id);if(!element||!entity)return;
 const animation=entity[reduced?'idle':motion?.animation||'idle'];
 const frames=animation?.frames;if(!frames?.length)return;
 const index=reduced?0:motion?.frame??Math.floor(now*(animation.fps||6)/1000)%frames.length;
 const src=localAsset(frames[Math.min(index,frames.length-1)]),image=images.get(src);
 if(!image)return;
 let painter=painters.get(id);
 if(!painter){
  const canvas=document.createElement('canvas');canvas.width=animation.frameWidth||192;canvas.height=animation.frameHeight||192;
  canvas.setAttribute('aria-hidden','true');canvas.className='px-sprite-canvas';
  painter={canvas,ctx:canvas.getContext('2d'),src:null};painters.set(id,painter);
 }
 if(painter.src!==src){
  painter.ctx.imageSmoothingEnabled=false;
  // Clear and draw synchronously into the same retained surface. Never swap an
  // undecoded CSS URL or remove a visible frame while the next one is loading.
  painter.ctx.clearRect(0,0,painter.canvas.width,painter.canvas.height);
  painter.ctx.drawImage(image,0,0,painter.canvas.width,painter.canvas.height);
  painter.src=src;element.dataset.frame=String(index);element.dataset.motion=reduced?'idle':motion?.animation||'idle';
 }
 if(!painter.canvas.isConnected){element.append(painter.canvas);element.classList.add('px-has-asset','px-canvas-ready')}
}
export function renderPixelFrame(motions=null,now=performance.now()){
 if(!assets)return;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 paintFrame('heroArt',assets.hero,motions?.hero,now,reduced);
 paintFrame('enemyArt',assets.enemies?.[currentMap],motions?.enemy,now,reduced);
 if(showFox)paintFrame('pixelPet',assets.pet,null,now,reduced);
 const trail=byId('swordTrail');if(trail)trail.classList.toggle('px-contact',!reduced&&!!motions?.hero?.contact);
}
const chapterNames=['青云山麓 / 晨雾','灵竹溪谷 / 听风','乌藤鬼林 / 暮色','雾隐剑冢 / 残照'];
function backgroundOnce(element,src){
 if(element&&src&&element.dataset.asset!==src){element.style.backgroundImage='url("'+src+'")';element.dataset.asset=src}
}
export function renderPixelScene(state){
 const run=state.run,theatre=byId('combatTheatre');if(!theatre)return;
 currentMap=run.mapIndex;theatre.dataset.map=String(currentMap);
 if(byId('sceneChapter'))byId('sceneChapter').textContent=chapterNames[currentMap];
 showFox=run.pet===(assets?.pet?.cardId||'P001');
 if(byId('pixelPet'))byId('pixelPet').hidden=!showFox;
 if(assets){
  const background=localAsset(assets.backgrounds?.[currentMap]),layer=byId('pixelBackdrop');
  backgroundOnce(layer,background);layer?.classList.toggle('px-has-background',!!background);
  const portrait=localAsset(assets.hero?.portrait),portraitNode=byId('cultivatorPortrait');
  backgroundOnce(portraitNode,portrait);portraitNode?.classList.toggle('px-has-portrait',!!portrait);
 }
 const loot=byId('pixelLootSummary'),battle=run.lastBattle;
 if(loot&&battle)loot.textContent=battle.won?'灵石 +'+battle.stones+' · 修为 +'+battle.qi:battle.failureReason==='timeout'?'战斗僵持，未获得收益':'本场战败，未获得收益';
}
function addJournal(text){
 const list=byId('pixelCombatLog');if(!list)return;
 const line=document.createElement('li');line.textContent=text;
 list.prepend(line);while(list.children.length>4)list.lastElementChild.remove();
}
export function pixelBattleEvent(event){
 if(event.actor==='warning'){addJournal(event.name);return}
 if(event.actor==='wave'){addJournal('第'+event.stage+'波 · '+event.name);return}
 const amount=Math.round(event.amount||0);
 addJournal(event.actor==='hero'?'剑意命中 · 造成 '+amount+' 伤害':
  event.actor==='enemy'?'妖兽出击 · '+(event.blocked>0&&!amount?'护盾格挡':'受到 '+amount+' 伤害'):
  event.actor==='pet'?'灵宠追击 · 造成 '+amount+' 伤害':
  event.actor==='potion'?(event.source==='bond'?'灵契回春':'服用回春丹')+' · 恢复 '+amount+' 气血':
  event.actor==='retaliation'?'玄甲反击 · 造成 '+amount+' 伤害':
  event.actor==='regen'?'敌方回复 · '+amount+' 气血':event.actor==='miss'?'身形一闪 · 攻击落空':'战斗反震 · '+amount+' 伤害');
}
