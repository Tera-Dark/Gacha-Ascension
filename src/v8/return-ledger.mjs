/** Persistent session returns, separate from the rolling five-second report. */
export function recordReturn(s,report,from,to){
 if(from===null||to-from<60000)return;
 const {lastBattle,...summary}=report;
 s.meta.returns.unshift({id:s.seq+1,from,to,life:s.meta.reincarnations+1,acknowledged:false,report:structuredClone(summary)});
 s.meta.returns.length=Math.min(5,s.meta.returns.length);
}
export function validateReturns(s){
 const rows=s.meta.returns,nat=n=>Number.isSafeInteger(n)&&n>=0;
 if(!Array.isArray(rows)||rows.length>5)throw Error('回访账单损坏');
 const ids=new Set();let previous=Infinity;
 for(const row of rows){
  const r=row?.report;
  if(!row||!nat(row.id)||row.id>s.seq||row.id>=previous||ids.has(row.id)||!nat(row.from)||!nat(row.to)||row.to<row.from||!nat(row.life)||row.life<1||row.life>s.meta.reincarnations+1||typeof row.acknowledged!=='boolean'||!r||!nat(r.elapsedMs)||r.elapsedMs>86400000||r.elapsedMs>row.to-row.from||typeof r.capped!=='boolean'||!Array.isArray(r.reasons)||r.reasons.some(x=>typeof x!=='string'||x.length>200))throw Error('回访账单损坏');
  for(const key of ['stones','qi','attempts','wins','insight','gearBoxes','herbBoxes','potionsUsed'])if(!nat(r[key]))throw Error('回访账单数量损坏');
  for(const key of ['gathered','grown','crafted','spent'])if(!r[key]||Object.values(r[key]).some(n=>!nat(n)))throw Error('回访账单材料损坏');
  if(r.usedItems&&Object.values(r.usedItems).some(n=>!nat(n)))throw Error('回访账单消耗损坏');
  ids.add(row.id);previous=row.id;
 }
}
