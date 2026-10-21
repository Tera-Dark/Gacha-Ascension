/** Exploration start and duration helpers. All chronological reward settlement
 * is owned by activities.mjs; no parallel offline reward loop lives here. */
export const MAX_FIRST_LIFE_MS=24*60*60*1000;
export const MAX_REBORN_MS=24*60*60*1000;
export function battleIntervalMs(s,c,yields,peekNextCombat){
 // Online and offline use exactly the same seeded mob-fight duration.
 // The callback is a pure preview and may NOT advance the save RNG.
 if(peekNextCombat){
  const preview=peekNextCombat(s,c);
  if(!Number.isFinite(preview.timeMs)||preview.timeMs<=0)throw Error("无效的战斗模拟耗时");
  return Math.max(900,Math.ceil(preview.timeMs));
 }
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
