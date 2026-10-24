const names={H001:'回春草',H002:'护脉叶',H003:'剑意花',MED001:'回春丹',MED002:'护体散',MED003:'剑意散'};
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
export function renderReturns(s){
 const rows=s.meta.returns,latest=rows[0],notice=document.getElementById('returnNotice');
 notice.hidden=!latest||latest.acknowledged;
 document.getElementById('returnSummary').textContent=latest?'离去 '+(latest.report.elapsedMs/3600000).toFixed(1)+' 小时 · 灵石 +'+latest.report.stones+' · 修为 +'+latest.report.qi:'';
 const list=document.getElementById('returnRecords'),key=JSON.stringify(rows);
 if(list.dataset.rows===key)return;list.dataset.rows=key;list.replaceChildren();
 if(!rows.length)list.append(el('p','还没有回访账单。离开一分钟以上，再回来查看。'));
 for(const row of rows){
  const r=row.report,section=el('section');section.className='return-record';
  section.append(el('h3','第'+row.life+'世 · '+new Date(row.to).toLocaleString('zh-CN')));
  section.append(el('p','本次计入 '+(r.elapsedMs/3600000).toFixed(2)+' 小时'+(r.capped?'（已达24小时上限）':'')));
  section.append(el('p','灵石 +'+r.stones+' · 修为 +'+r.qi+' · 悟道 +'+r.insight+' · '+r.wins+'/'+r.attempts+' 战胜利'));
  for(const [key,label] of [['gathered','采得'],['grown','药田'],['crafted','炼成'],['spent','消耗'],['usedItems','战斗消耗']]){
   const parts=Object.entries(r[key]||{}).map(([id,n])=>(names[id]||id)+' ×'+n);if(parts.length)section.append(el('p',label+'：'+parts.join('、')));
  }
  section.append(el('p','装备箱 +'+r.gearBoxes+' · 药草箱 +'+r.herbBoxes+' · 战斗服药 '+r.potionsUsed));
  if(r.lostGear)section.append(el('p','战败遗失：'+r.lostGear.name));
  if(r.failureReason)section.append(el('p',r.failureReason==='timeout'?'战斗僵持，未触发死亡掉装':'探索战败，已停止继续战斗'));
  if(r.reasons.length)section.append(el('p',r.reasons.join('；')));
  list.append(section);
 }
}
