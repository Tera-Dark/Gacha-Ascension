/** Chronological main activity + independent field/furnace. Durations are integer
 * milliseconds; fractional work survives claims. No RNG or DOM lives here. */
import {growth,cappedCopies} from './progression.mjs';
const herbs=['H001','H002','H003'],potions={H001:'MED001',H002:'MED002',H003:'MED003'};
export function createWorld(at=null){return {at,activity:{kind:'none',herb:'H001',carryMs:0},field:{enabled:false,herb:'H001',carryMs:0},queue:[],brewCarryMs:0,lastReport:null}}
export function productionStats(s,c){
 const cfg=c.management,n=s.meta.dao.nodes,r=s.run;
 const cloud=growth(r.cards.H003),field=growth(r.cards.H001),spirit=growth(r.cards.H004);
 const speed=1+cappedCopies(s,'H003')*.04;
 const qiCards=Math.min(600,Object.values(c.cards).reduce((n,x)=>n+(x.effect==='qiPct'?(r.cards[x.id]||0)*x.value:0),0));
 return {gatherMs:Math.round(cfg.gatherMs/speed),meditateMs:Math.round(cfg.meditateMs/speed),
 fieldMs:Math.round(cfg.fieldMs/speed),brewMs:Math.round(cfg.brewMs/(speed*(n.queue?1.25:1)*(cloud>=2?1.2:1)*(spirit>=2?1.1:1))),
 gatherYield:1+(cloud>=3?1:0)+Math.min(2,Math.floor(r.mastery.gather/120)),fieldYield:Math.max(1,field),
 meditateQi:Math.round(cfg.meditateQi*(1+qiCards/100)*(1+cappedCopies(s,'H002')*.27)*(n.meditate?1.25:1)),
 herbCap:cfg.herbCap*(n.warehouse?2:1),potionCap:cfg.potionCap*(n.warehouse?2:1),queueSlots:cfg.queueSlots+(n.queue?1:0)};
}
export function addTask(s,c,{herb,mode,amount}){
 const w=s.run.world,stats=productionStats(s,c);
 if(!herbs.includes(herb)||!s.run.recipes[herb])throw Error('先抽取对应丹道配方');
 if(!['count','target'].includes(mode)||!Number.isSafeInteger(amount)||amount<1||amount>stats.potionCap)throw Error('炼丹数量超出当前库存上限');
 if(w.queue.length>=stats.queueSlots)throw Error('丹炉排程已满');
 w.queue.push({herb,mode,amount,done:0,carryMs:0});return {kind:'queue',tasks:w.queue.length};
}
export function setActivity(s,kind,herb){
 if(!['none','gather','meditate'].includes(kind))throw Error('未知主活动');
 if(kind==='gather'&&(!herbs.includes(herb)||!s.run.recipes[herb]))throw Error('该药草尚未解锁');
 s.run.world.activity={kind,herb:herb||'H001',carryMs:0};
 return {kind:'activity',activity:kind};
}
export function setField(s,enabled,herb){
 if(typeof enabled!=='boolean'||!herbs.includes(herb))throw Error('药田设置无效');
 if(enabled&&(!(s.run.cards.H001>0)||!s.run.recipes[herb]))throw Error('药田需要九转灵田与对应药草配方');
 s.run.world.field={enabled,herb,carryMs:0};return {kind:'field',enabled,herb};
}
function receipt(s,b){
 s.run.lastBattle={type:b.type,won:b.won,turns:b.combat.turns,stones:b.stones,qi:b.qi,boxes:b.boxes||[],lostGear:b.lostGear||null,potionUses:b.potionUses,failureReason:b.failureReason||null};
}
export function settleWorld(s,c,now,hooks){
 if(!Number.isSafeInteger(now)||now<0)throw Error('非法的活动时间戳');
 const r=s.run,w=r.world,cfg=c.management;
 const report={kind:'world',attempts:0,wins:0,stones:0,qi:0,insight:0,gathered:{},grown:{},crafted:{},spent:{},gearBoxes:0,herbBoxes:0,potionsUsed:0,lastBattle:null,active:!!r.idle?.active,elapsedMs:0,capped:false,reasons:[]};
 if(w.at===null){w.at=now;return report}
 if(now<w.at)throw Error('活动时间不能倒退');
 const raw=now-w.at,span=Math.min(raw,cfg.offlineCapMs);
 report.elapsedMs=span;report.capped=raw>span;
 let left=span,steps=0;
 const add=(obj,id,n)=>{obj[id]=(obj[id]||0)+n};
 while(left>0){
  if(++steps>200000)throw Error('活动结算超出安全步数，请分段领取');
  const stats=productionStats(s,c),a=w.activity,f=w.field;
  w.queue=w.queue.filter(t=>t.mode!=='count'||t.done<t.amount);
  const task=w.queue.find(t=>t.mode==='count'||(r.consumables[potions[t.herb]]||0)<t.amount),item=task&&potions[task.herb];
  if(task&&task.carryMs===undefined){task.carryMs=w.brewCarryMs;w.brewCarryMs=0}
  const gather=a.kind==='gather'&&(r.herbs[a.herb]||0)<stats.herbCap;
  const meditate=a.kind==='meditate';
  const field=f.enabled&&(r.cards.H001||0)>0&&(r.herbs[f.herb]||0)<stats.herbCap;
  const brew=task&&(r.herbs[task.herb]||0)>=3&&(r.consumables[item]||0)<stats.potionCap&&(task.mode!=='target'||(r.consumables[item]||0)<task.amount);
  if(!gather&&a.kind==='gather')a.carryMs=0;
  if(!field)f.carryMs=0;if(!brew&&task)task.carryMs=0;
  let encounter=null;
  if(r.idle?.active&&!r.pendingBattle)encounter=hooks.encounter();
  const waits=[gather?stats.gatherMs-a.carryMs:Infinity,meditate?stats.meditateMs-a.carryMs:Infinity,
   field?stats.fieldMs-f.carryMs:Infinity,brew?stats.brewMs-task.carryMs:Infinity,
   encounter?encounter.durationMs-(r.idle.carryMs||0):Infinity];
  const dt=Math.min(left,...waits.map(x=>Math.max(0,x)));
  if(!Number.isFinite(dt)||dt<0)throw Error('活动时间余数异常');
  if(gather||meditate)a.carryMs+=dt;if(field)f.carryMs+=dt;if(brew)task.carryMs+=dt;
  if(encounter)r.idle.carryMs=(r.idle.carryMs||0)+dt;
  left-=dt;
  // Stable order at equal timestamps: harvest, meditate, furnace, battle.
  if(gather&&a.carryMs>=stats.gatherMs){
   a.carryMs-=stats.gatherMs;const n=Math.min(stats.gatherYield,stats.herbCap-(r.herbs[a.herb]||0));
   add(r.herbs,a.herb,n);add(report.gathered,a.herb,n);r.mastery.gather++;
  }
  if(meditate&&a.carryMs>=stats.meditateMs){
   a.carryMs-=stats.meditateMs;r.qi+=stats.meditateQi;report.qi+=stats.meditateQi;r.mastery.meditate++;
   const tier=growth(r.cards.H002),period=tier>=3?30:60;
   if(tier>=2&&r.mastery.meditate%period===0){r.insight++;report.insight++}
  }
  if(field&&f.carryMs>=stats.fieldMs){
   f.carryMs-=stats.fieldMs;const n=Math.min(stats.fieldYield,stats.herbCap-(r.herbs[f.herb]||0));
   add(r.herbs,f.herb,n);add(report.grown,f.herb,n);
  }
  if(brew&&task.carryMs>=stats.brewMs){
   task.carryMs-=stats.brewMs;r.herbs[task.herb]-=3;add(report.spent,task.herb,3);
   add(r.consumables,item,1);add(report.crafted,item,1);task.done++;r.mastery.brew++;
  }
  if(encounter&&r.idle.carryMs>=encounter.durationMs){
   r.idle.carryMs-=encounter.durationMs;
   const b=hooks.battle(encounter.combat);delete r.idle.encounter;
   report.attempts++;report.wins+=Number(b.won);report.stones+=b.stones;report.qi+=b.qi;report.lastBattle=b;receipt(s,b);
   report.potionsUsed+=(b.potionUses?.auto||0)+(b.potionUses?.prepared||0);
   for(const box of b.boxes||[])if(box.id==='gear')report.gearBoxes++;else if(box.id==='herb')report.herbBoxes++;
   if(!b.won){r.idle.active=false;r.idle.carryMs=0;report.lostGear=b.lostGear;report.failureReason=b.failureReason}
  }
 }
 w.queue=w.queue.filter(t=>t.mode!=='count'||t.done<t.amount);
 w.at=now;
 if(r.idle){r.idle.at=now;if(r.idle.active)hooks.encounter()}
 const st=productionStats(s,c),task=w.queue.find(t=>t.mode==='count'||(r.consumables[potions[t.herb]]||0)<t.amount);
 if(w.activity.kind==='gather'&&(r.herbs[w.activity.herb]||0)>=st.herbCap)report.reasons.push('采药库存已满');
 if(w.field.enabled&&(r.herbs[w.field.herb]||0)>=st.herbCap)report.reasons.push('药田库存已满');
 if(task){const n=r.consumables[potions[task.herb]]||0;
  if(n>=st.potionCap||task.mode==='target'&&n>=task.amount)report.reasons.push('丹炉已达到库存目标');
  else if((r.herbs[task.herb]||0)<3)report.reasons.push('丹炉缺料，等待药草补充');
 }else report.reasons.push(w.queue.length?'丹炉已达到库存目标':'丹炉暂无排程');
 if(report.failureReason)report.reasons.push('探索失败，已安全停止');
 report.active=!!r.idle?.active;
 // Full combat logs stay in the battle result, not in every autosaved report.
 if(!w.lastReport||span>=60000||report.attempts||report.qi||Object.keys(report.gathered).length||Object.keys(report.grown).length||Object.keys(report.crafted).length)
  w.lastReport={...report,lastBattle:undefined};
 if(r.idle)r.idle.lastReport={...report,lastBattle:undefined};
 return report;
}
export function validateWorld(s,c){
 const w=s.run.world,nat=n=>Number.isSafeInteger(n)&&n>=0;
 if(!w||(w.at!==null&&!nat(w.at))||!w.activity||!w.field||!Array.isArray(w.queue)||!nat(w.brewCarryMs))throw Error('活动存档损坏');
 if(!['none','gather','meditate'].includes(w.activity.kind)||!herbs.includes(w.activity.herb)||!nat(w.activity.carryMs)||!herbs.includes(w.field.herb)||typeof w.field.enabled!=='boolean'||!nat(w.field.carryMs))throw Error('未知修行活动');
 if(s.run.idle?.active&&w.activity.kind!=='none')throw Error('修士不能同时执行两个主活动');
 const st=productionStats(s,c);
 if(w.queue.length>st.queueSlots||w.queue.some(x=>!herbs.includes(x.herb)||!s.run.recipes[x.herb]||!['count','target'].includes(x.mode)||!nat(x.done)||x.carryMs!==undefined&&!nat(x.carryMs)||!nat(x.amount)||x.amount<1||x.amount>st.potionCap))throw Error('丹炉排程损坏');
 if(w.field.enabled&&(!(s.run.cards.H001>0)||!s.run.recipes[w.field.herb]))throw Error('药田尚未解锁');
 if(w.activity.kind==='gather'&&!s.run.recipes[w.activity.herb])throw Error('采药目标未解锁');
}
