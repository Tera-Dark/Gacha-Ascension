import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {combatTimeline,combatCues,attackPresentation} from "../src/v8/combat-timeline.mjs";
import {createSave,loadCatalog,dispatch,fight,SAVE_KEY,SCHEMA} from "../src/v8/engine.mjs";
const j=p=>JSON.parse(readFileSync(new URL("../data/"+p,import.meta.url),"utf8"));
const c=loadCatalog(j("realms-maps.v0.8.proposal.json"),j("v8-slice.json"));
const issue=(s,type,now)=>dispatch(s,c,{seq:s.seq+1,type,now});
test("online hit events are scheduled before battle settlement, not after the timer",()=>{
 const s=createSave(20261020);
 const next=fight(s,c,"mob",{seed:s.seed});
 const start=combatTimeline(next);
 const firstHit=next.logs.find(e=>e.actor==="hero"&&e.amount>0&&e.timeMs<next.timeMs-100);
 assert.ok(firstHit,"expected a visible nonlethal hit in the starting mob fight");
 assert.ok(start.future.some(e=>e.actor==="hero"&&e.amount>0&&e.delayMs===firstHit.timeMs));
 assert.equal(start.totalMs,next.timeMs);
 assert.equal(start.past[0].actor,"wave");
 const mid=combatTimeline(next,firstHit.timeMs+50);
 assert.ok(mid.past.some(e=>e.actor==="hero"&&e.amount>0));
 assert.ok(mid.remainingMs>0);
 assert.ok(mid.future.every(e=>e.delayMs>0));
});
test("visual preview is pure; idle transaction settles once and follows exactly the same combat result",()=>{
 const t=2000;
 let s=createSave(20261020);
 const original=structuredClone(s);
 const predicted=fight(s,c,"mob",{seed:s.seed});
 assert.deepEqual(s,original);
 const first=predicted.logs.find(e=>e.actor==="hero"&&e.amount>0);
 const started=issue(s,"START_IDLE",t);
 const partial=issue(started.state,"CLAIM_IDLE",t+first.timeMs+50);
 assert.equal(partial.result.attempts,0,"no rewards while the displayed hit is in progress");
 assert.equal(partial.state.run.stones,s.run.stones);
 assert.equal(partial.state.run.lastBattle,null);
 const settled=issue(partial.state,"CLAIM_IDLE",t+predicted.timeMs+30);
 assert.equal(settled.result.attempts,1);
 assert.deepEqual(settled.result.lastBattle.combat,predicted,"visual prediction and actual encounter must agree");
 assert.equal(settled.state.run.victories,Number(predicted.won));
 assert.equal(SCHEMA,9);
 assert.equal(SAVE_KEY,"gacha-ascension-v8-slice-v1");
});
test("resume or equipment change seeks from elapsed fight time without restarting past hits",()=>{
 const next=fight(createSave(20261020),c,"mob",{seed:20261020});
 const first=next.logs.find(e=>e.actor==="hero"&&e.amount>0);
 const part=combatTimeline(next,first.timeMs+1);
 assert.ok(part.past.some(e=>e.seq===first.seq));
 assert.ok(!part.future.some(e=>e.seq===first.seq));
 assert.equal(part.remainingMs,next.timeMs-first.timeMs-1);
 assert.equal(combatTimeline(next,next.timeMs+10000).future.length,0);
 assert.throws(()=>combatTimeline(next,-1),/计时/);
});

test("a missed swing still winds up, contacts and resets its real attack bar",()=>{
 const cues=combatCues({logs:[{actor:"wave",timeMs:0,stage:1},
  {actor:"miss",owner:"hero",timeMs:2450,stage:1},
  {actor:"hero",timeMs:4900,stage:1}]});
 assert.equal(attackPresentation(cues.hero,1225).progress,.5);
 const windup=attackPresentation(cues.hero,2350);
 assert.equal(windup.animation,"attack");assert.ok(windup.frame<3);
 const contact=attackPresentation(cues.hero,2450);
 assert.equal(contact.frame,3);assert.equal(contact.contact,true);
 assert.equal(contact.progress,0);
 assert.equal(attackPresentation(cues.hero,3675).progress,.5);
 assert.equal(attackPresentation(cues.hero,4900).frame,3);
 assert.equal(attackPresentation(cues.hero,5200).animation,"idle");
 assert.equal(attackPresentation(cues.hero,5200).progress,0,"no phantom attacks after the final strike");
});
test("multi-wave progress restarts at the actual wave boundary, not the previous swing",()=>{
 const cues=combatCues({logs:[{actor:"wave",timeMs:0,stage:1},
  {actor:"enemy",timeMs:2650,stage:1},{actor:"hero",timeMs:4900,stage:1},
  {actor:"wave",timeMs:4900,stage:2},{actor:"enemy",timeMs:7550,stage:2}]});
 assert.equal(attackPresentation(cues.enemy,4900).progress,0);
 assert.equal(attackPresentation(cues.enemy,6225).progress,.5);
 assert.equal(attackPresentation(cues.enemy,7550).contact,true);
});
test("every seeded encounter ends at its last visible event without a seconds-long tail",()=>{
 for(let seed=1;seed<=32;seed++)for(const kind of ["mob","guardian","boss"]){
  const combat=fight(createSave(seed),c,kind,{seed});
  assert.ok(combat.timeMs-combat.logs.at(-1).timeMs<=1);
  const before=structuredClone(combat);
  const cues=combatCues(combat);
  for(const owner of ["hero","enemy"])for(const hit of cues[owner]){
   const visual=attackPresentation(cues[owner],hit.timeMs);
   assert.equal(visual.frame,3);assert.equal(visual.contact,true);
  }
  assert.deepEqual(combat,before,"presentation must never alter combat or settlement time");
 }
});
