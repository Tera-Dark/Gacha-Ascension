import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSave,loadCatalog,dispatch} from '../src/v8/engine.mjs';
import {unlockedPack,introducedView} from '../src/v8/modules.mjs';
import {storyChapter,storyHistory,nextStoryPack,cardRevelation,noteworthyDraw} from '../src/v8/story.mjs';
import {nextStep} from '../src/v8/advisor.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(read('realms-maps.v0.8.proposal.json'),read('v8-slice.json'));
const cmd=(s,type,more={})=>dispatch(s,c,{type,seq:s.seq+1,now:0,...more});
const funded=()=>{const s=createSave(412);s.run.stones+=100000;s.run.totalEarned+=100000;return s};

test('fresh mainline exposes one pack; each ordinary pack is reducer gated at its chapter',()=>{
 const fresh=funded();assert.deepEqual(c.packs.filter(p=>unlockedPack(fresh,c,p.id)).map(p=>p.id),['battle']);
 for(const [id,at] of Object.entries(c.features.unlockAtGlobalCheckpoint)){
  if(id==='battle'||id==='artifact')continue;
  const s=funded();s.meta.bestCheckpoint=at-1;s.run.mapIndex=Math.floor((at-2)/8);s.run.checkpoint=(at-2)%8;
  const original=structuredClone(s);assert.throws(()=>cmd(s,'DRAW',{packId:id,count:1}),/尚未解锁/);assert.deepEqual(s,original);
  s.meta.bestCheckpoint=at;s.run.mapIndex=Math.floor((at-1)/8);s.run.checkpoint=(at-1)%8;
  assert.ok(cmd(s,'DRAW',{packId:id,count:1}).result.items.length);
 }
 const late=funded();late.meta.bestCheckpoint=32;assert.equal(unlockedPack(late,c,'artifact'),false);
 late.run.realmIndex=4;assert.ok(unlockedPack(late,c,'artifact'));
});

test('reading a scene changes nothing and story advances through real saved events',()=>{
 let s=createSave(20261020);assert.equal(storyChapter(s,c).id,'awakening');
 assert.deepEqual(storyHistory(s,c).map(x=>x.id),['awakening']);
 const initial=structuredClone(s);for(let i=0;i<8;i++){storyChapter(s,c);storyHistory(s,c)}assert.deepEqual(s,initial);
 s=cmd(s,'DRAW',{packId:'battle',count:1}).state;assert.equal(storyChapter(s,c).id,'borrowed-blade');
 s=cmd(s,'BATTLE',{enemyType:'mob'}).state;assert.equal(storyChapter(s,c).id,'first-gate');
 // Model an already reached guardian checkpoint, then enforce new access through dispatch.
 s.run.checkpoint=1;s.meta.bestCheckpoint=2;s.run.guardianWins=1;
 assert.equal(storyChapter(s,c).id,'living-script');assert.equal(nextStoryPack(s,c),'technique');
 s.run.stones=0;const step=nextStep(s,c,{winRate:1});assert.equal(step.view,'explore');assert.match(step.description,/灵石/);
});

test('legacy used packs stay usable, basic treasure does not open the equipment gacha',()=>{
 let s=funded();s.run.draws.pet=1;assert.ok(unlockedPack(s,c,'pet'));
 s=funded();s.run.cards.T001=1;s.meta.knowledge.cards.T001=true;assert.ok(unlockedPack(s,c,'technique'));
 s=funded();const gear=Object.values(c.cards).find(x=>x.effect==='equipment');s.run.cards[gear.id]=1;s.meta.knowledge.cards[gear.id]=true;
 assert.equal(unlockedPack(s,c,'equipment'),false);
 assert.equal(introducedView(s,c,'technique'),false);assert.equal(introducedView(s,c,'cave'),true);
 s.run.checkpoint=1;assert.equal(introducedView(s,c,'technique'),true);
});

test('a spirit technique opens a companion branch before the linear pet chapter',()=>{
 let s=funded();s.run.checkpoint=1;s.meta.bestCheckpoint=2;s.run.draws.battle=1;
 s.run.cards.T002=1;assert.equal(unlockedPack(s,c,'pet'),false);
 s.run.cards.T003=1;assert.ok(unlockedPack(s,c,'pet'));assert.equal(storyChapter(s,c).pack,'pet');
 assert.ok(storyHistory(s,c).some(ch=>ch.pack==='pet'));
 const result=cmd(s,'DRAW',{packId:'pet',count:1});assert.ok(result.state.run.pet,'new companion is actually summoned and equipped');
 assert.equal(storyChapter(result.state,c).id,'living-script','the side encounter returns to current mainline afterward');
});

test('directed choice cannot bypass a story lock and waiting does not consume its progress',()=>{
 let s=funded();s=cmd(s,'DRAW',{packId:'battle',count:10}).state;s=cmd(s,'DRAW',{packId:'battle',count:10}).state;
 const before=structuredClone(s);assert.throws(()=>cmd(s,'CLAIM_DIRECTED',{id:'T001'}),/已开放定向池/);assert.deepEqual(s,before);
 s.run.checkpoint=1;s.meta.bestCheckpoint=2;
 s=cmd(s,'CLAIM_DIRECTED',{id:'T001'}).state;assert.ok(s.run.cards.T001);assert.equal(s.meta.directed.claimed,1);
});

test('returning life remembers unlocked chapters but artifact still requires this-life realm',()=>{
 let s=funded();s.run.mapIndex=3;s.run.checkpoint=7;s.run.bossCleared=true;s.run.realmIndex=4;s.meta.bestCheckpoint=32;s.meta.bestMap=4;
 s=cmd(s,'CLAIM_WORLD').state;assert.equal(storyChapter(s,c).id,'artifact');
 s=cmd(s,'REINCARNATE').state;assert.equal(storyChapter(s,c).id,'return');
 assert.ok(unlockedPack(s,c,'elixir'));assert.equal(unlockedPack(s,c,'artifact'),false);
 assert.ok(storyHistory(s,c).some(x=>x.id==='signature'));
 assert.ok(storyHistory(s,c).some(x=>x.id==='return'),'second-life conversation remains available for replay');
 assert.equal(s.run.draws.elixir,undefined,'remembering access must not manufacture historical pulls');
 s=cmd(s,'DRAW',{packId:'battle',count:1}).state;
 assert.equal(storyChapter(s,c).id,'borrowed-blade','old pet access alone must not invent a new spirit discovery');
});

test('core reveal distinguishes first mechanism and duplicate growth nodes',()=>{
 const card=c.cards.T001;
 assert.match(cardRevelation({...card,copies:1},0),/初识命痕.*剑意/);
 assert.match(cardRevelation({...card,copies:3},2),/熟练命痕.*回复/);
 assert.match(cardRevelation({...card,copies:6},5),/精通命痕.*两次/);
 assert.ok(noteworthyDraw([{...card,copies:3}],{T001:2},{T001:true}),'a new behavior node keeps its reveal');
 assert.equal(noteworthyDraw([{...card,copies:2}],{T001:1},{T001:true}),false);
 const insight=Object.values(c.cards).find(x=>x.effect==='insight'&&['huang','xuan'].includes(x.rarity));
 assert.equal(noteworthyDraw([{...insight,copies:1}],{},{[insight.id]:true}),false,'consumed insight is still a known ordinary repeat');
 const broken=read('v8-slice.json');broken.story.chapters[0].lines=[];
 assert.throws(()=>loadCatalog(read('realms-maps.v0.8.proposal.json'),broken),/主线配置/);
});
