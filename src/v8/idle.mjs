/** Offline-only safe monster farming. Reuses the same live battle reducer.
 * No Boss / guardian / draw / breakthrough / reincarnation executes offline.
 * Local client timestamps are NOT tamper-proof; future cloud saves need server time.
 */
export const MAX_FIRST_LIFE_MS=15*60*1000;
export const MAX_REBORN_MS=2*60*60*1000;
export function battleIntervalMs(s,c,yields){
 const speed=yields(s,c).speedPct;
 return Math.max(900,Math.round(1550*(1-speed/100)));
}
function clock(now){if(!Number.isSafeInteger(now)||now<0)throw Error("非法的活动时间戳");return now}
export function startIdle(s,now){
 clock(now);
 if(!s.run.idle)s.run.idle={active:false,at:now,carryMs:0};
 if(s.run.idle.active)return {kind:"idleStart",alreadyActive:true};
 s.run.idle.active=true;s.run.idle.at=now;s.run.idle.carryMs=0;
 return {kind:"idleStart"};
}
export function claimIdle(s,c,now,makeBattle,getInterval){
 clock(now);
 const active=s.run.idle;
 if(!active?.active)return {kind:"idleClaim",attempts:0,wins:0,stones:0,qi:0,elapsedMs:0,capped:false,lastBattle:null,active:false};
 const diff=Math.max(0,now-active.at);
 const cap=s.meta.reincarnations>0?MAX_REBORN_MS:MAX_FIRST_LIFE_MS;
 const limited=Math.min(diff,cap);
 let left=limited+(active.carryMs||0),battles=0,wins=0,stones=0,qi=0,lastBattle=null;
 // Timestamp advance and remaining fractional interval share one atomic transaction.
 for(let n=0;n<10000;n++){
  const interval=getInterval(s,c);
  if(left<interval)break;
  left-=interval;
  const result=makeBattle(s,c,"mob");
  battles++;lastBattle=result;
  if(!result.won){active.active=false;left=0;break}
  wins++;stones+=result.stones;qi+=result.qi;
 }
 active.carryMs=left;active.at=now;
 const summary={kind:"idleClaim",attempts:battles,wins,stones,qi,elapsedMs:limited,
  capped:diff>cap,lastBattle,active:active.active};
 active.lastReport={...summary,lastBattle:undefined};
 return summary;
}
export function stopIdle(s,c,now,makeBattle,getInterval){
 const summary=claimIdle(s,c,now,makeBattle,getInterval);
 if(s.run.idle)s.run.idle.active=false;
 return {...summary,kind:"idleStop",active:false};
}
