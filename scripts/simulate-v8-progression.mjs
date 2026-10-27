#!/usr/bin/env node
/** Formal economy: same reducer, real milliseconds, three visits per day.
 * No granted currency, altered rates, forced drops, or direct battle rewards. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadCatalog,createSave,dispatch,breakthroughRequirements,combatAssessment,packCost} from '../src/v8/engine.mjs';
import {unlockedPack} from '../src/v8/modules.mjs';
const j=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const catalog=loadCatalog(j('realms-maps.v0.8.proposal.json'),j('v8-slice.json'));
const routes={sword:['T001','P001'],guard:['T002','P002'],spirit:['T003','P003']};
export function playLives(seed,route='sword',lives=3){
 let s=createSave(seed),now=1000000,draws=0,commands=0,firstThirty=null;
 const c=catalog,rows=[];
 const cmd=(type,extra={})=>{commands++;const o=dispatch(s,c,{type,seq:s.seq+1,now,...extra});s=o.state;return o.result};
 const fight=kind=>{const o=cmd('PREPARE_BATTLE',{enemyType:kind});now+=o.combat.timeMs;return cmd('FINISH_BATTLE')};
 const stop=()=>{if(s.run.idle?.active)cmd('STOP_IDLE');if(s.run.world.activity.kind!=='none')cmd('START_ACTIVITY',{activity:'none'})};
 const pull=(pack,count=10)=>{if(!unlockedPack(s,c,pack)||s.run.stones<packCost(s,c,pack)*count)return false;cmd('DRAW',{packId:pack,count});draws+=count;return true};
 for(let life=0;life<lives;life++){
  const begun=now,chosen=life===2?(route==='sword'?'spirit':'sword'):route,[tech,pet]=routes[chosen];
  if(life===0){
   pull('battle',1);fight('mob');
   cmd('START_ACTIVITY',{activity:'gather',herb:'H001'});now+=180000;cmd('CLAIM_WORLD');
   cmd('QUEUE_BREW',{herb:'H001',mode:'count',amount:1});now+=60000;cmd('CLAIM_WORLD');
   stop();
   // The first core pack opens through an actual guardian, never a granted flag.
   while(!s.run.guardianWins){
    if(now-begun>30*60000)throw Error('opening guardian exceeded 30 minutes');
    if(combatAssessment(s,c,'guardian',8).winRate>=.875){if(fight('guardian').won)break}
    if(!pull('battle',1))fight('mob');
   }
   const opening=['technique','pet','cave','battle','cultivation'];
   for(let i=0;i<19;i++){
    const available=opening.filter(id=>unlockedPack(s,c,id)),pack=available[i%available.length];
    while(!pull(pack,1)){fight('mob');if(now-begun>30*60000)throw Error('opening exceeded 30 minutes')}
   }
   cmd('CLAIM_DIRECTED',{id:tech});cmd('EQUIP_TECH',{id:tech});
   firstThirty={minutes:Math.round((now-begun)/600)/100,draws:s.meta.directed.draws,crafted:s.run.mastery.brew,chosenCore:s.run.technique};
  }
  cmd('START_IDLE');
  let visits=0;
  while(!s.run.bossCleared&&visits<12){
   now+=8*3600000;cmd('CLAIM_WORLD');stop();visits++;
   const want=[['wealth',60],['cultivation',100],['technique',36],['pet',36],['cave',60],['battle',100]];
   for(const [pack,n] of want){
    const already=s.run.draws[pack]||0;
    for(let k=already;k<n;k+=10)if(!pull(pack))break;
   }
   while(Math.floor(s.meta.directed.draws/c.management.directedEvery)>s.meta.directed.claimed){
    const id=!(s.run.cards[tech]>0)?tech:!(s.run.cards[pet]>0)?pet:!(s.run.cards.H001>0)?'H001':(s.run.cards.H002||0)<6?'H002':(s.run.cards[tech]||0)<6?tech:(s.run.cards[pet]||0)<6?pet:null;
    if(!id||!unlockedPack(s,c,c.cards[id].pack))break;cmd('CLAIM_DIRECTED',{id});
   }
   if(s.run.cards[tech]>0)cmd('EQUIP_TECH',{id:tech});if(s.run.cards[pet]>0)cmd('EQUIP_PET',{id:pet});
   for(const id of ['meditate','warehouse','inherit','supplies','insight','queue']){
    const node=c.management.talents.find(x=>x.id===id);
    if(!s.meta.dao.nodes[id]&&s.meta.dao.points>=node.cost&&(!node.requires||s.meta.dao.nodes[node.requires]))cmd('LEARN_DAO',{id});
   }
   if(s.run.cards.H001>0&&!s.run.world.field.enabled)cmd('SET_FIELD',{enabled:true,herb:'H001'});
   if(!s.run.world.queue.length)cmd('QUEUE_BREW',{herb:'H001',mode:'target',amount:20});
   for(let progress=0;progress<40&&!s.run.bossCleared;progress++){
    const req=breakthroughRequirements(s,c);
    if(req.canBreak){cmd('BREAKTHROUGH');continue}
    if(s.run.mapIndex>s.run.realmIndex)break;
    const kind=s.run.checkpoint===7?'boss':'guardian';
    const risk=combatAssessment(s,c,kind,8);
    if(risk.winRate<.75){if(pull('battle'))continue;break}
    const result=fight(kind);if(!result.won){if(pull('battle'))continue;break}
   }
   if(process.env.PROGRESSION_TRACE)console.log(JSON.stringify({life,visits,qi:s.run.qi,req:breakthroughRequirements(s,c).qi,map:s.run.mapIndex,realm:s.run.realmIndex}));
   if(!s.run.bossCleared){
    const req=breakthroughRequirements(s,c);
    if(s.run.mapIndex>s.run.realmIndex&&!req.hasQi)cmd('START_ACTIVITY',{activity:'meditate'});else cmd('START_IDLE');
   }
  }
  const durationMs=now-begun;
  rows.push({life:life+1,route:chosen,hours:Math.round(durationMs/36000)/100,completed:s.run.bossCleared,realm:s.run.realmIndex,visits,draws:s.meta.directed.draws,mastery:s.run.mastery.brew});
  if(!s.run.bossCleared)break;
  const nextTech=life===1?routes[route==='sword'?'spirit':'sword'][0]:tech;
  const selected=[s.meta.knowledge.cards[nextTech]?nextTech:tech,'H002'].filter(id=>s.meta.knowledge.cards[id]);
  cmd('SET_INHERITANCE',{ids:selected});cmd('REINCARNATE');
 }
 return {seed,route,rows,firstThirty,commands,draws};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const full=process.argv.includes('--full'),seeds=full?[1,2,3,7,19,42,71,123,999,20261020]:[1,42],all=[];
 let failed=0;
 for(const route of Object.keys(routes))for(const seed of seeds){
  const result=playLives(seed,route);all.push(result);
  console.log(JSON.stringify(result));
 /** Acceptance: three lives finish, the opening stays under 30 minutes, and the
 * second life is at least 30% faster overall. The floor is 12h, not 24h: the old
 * 32h run was dominated by a 200k-qi breakthrough wall that read as a hard block,
 * so the wall is gone and the remaining time is actual fighting and drawing. */
 if(result.rows.length!==3||result.rows.some(x=>!x.completed)||result.rows[0].hours<12||result.rows[0].hours>72||!result.firstThirty||result.firstThirty.minutes>30||result.firstThirty.crafted<1||!result.firstThirty.chosenCore)failed++;
 }
 const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 for(const route of Object.keys(routes)){
  const rows=all.filter(x=>x.route===route);
  const first=median(rows.map(x=>x.rows[0].hours)),second=median(rows.map(x=>x.rows[1]?.hours??Infinity));
  const faster=1-second/first;console.log(JSON.stringify({route,firstMedianHours:first,secondMedianHours:second,fasterPct:Math.round(faster*100)}));
 }
 const overallFirst=median(all.map(x=>x.rows[0].hours)),overallSecond=median(all.map(x=>x.rows[1]?.hours??Infinity));
 const overallFaster=1-overallSecond/overallFirst;
 console.log(JSON.stringify({overallFirstMedianHours:overallFirst,overallSecondMedianHours:overallSecond,fasterPct:Math.round(overallFaster*100)}));
 if(overallFaster<.3)failed++;
 if(failed){console.error('Formal three-life progression FAILED: '+failed);process.exitCode=1}else console.log('Formal three-life progression PASSED');
}
