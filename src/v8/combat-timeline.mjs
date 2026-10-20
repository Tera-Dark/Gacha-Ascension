/**
 * Online combat visuals follow the predicted, deterministic encounter log,
 * instead of starting a short replay only AFTER the idle timer settles.
 * Reward settlement remains exclusively in the engine's CLAIM_IDLE transaction.
 * The clock argument is elapsed simulated time in the current fight.
 */
export function combatTimeline(combat,elapsedMs=0){
 if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw Error("无效的战斗计时");
 const total=Math.max(1,Math.ceil(combat?.timeMs||0));
 if(!Array.isArray(combat?.logs))throw Error("缺少战斗逐击日志");
 const elapsed=Math.min(total,Math.max(0,elapsedMs));
 const past=[],future=[];
 let previous=-Infinity;
 for(const event of combat.logs){
  if(!Number.isFinite(event.timeMs)||event.timeMs<0||event.timeMs<previous)
   throw Error("战斗事件时间线无效");
  previous=event.timeMs;
  if(event.timeMs<=elapsed)past.push(event);
  else future.push({...event,delayMs:Math.max(0,Math.ceil(event.timeMs-elapsed))});
 }
 return {totalMs:total,elapsedMs:elapsed,remainingMs:Math.max(0,total-elapsed),
  past,future};
}
