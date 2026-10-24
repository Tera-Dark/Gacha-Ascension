import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSave,loadCatalog,dispatch} from '../src/v8/engine.mjs';
import {cultivationJourney,featureIntroductions} from '../src/v8/onboarding.mjs';
import {nextStep} from '../src/v8/advisor.mjs';
const json=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(json('realms-maps.v0.8.proposal.json'),json('v8-slice.json'));
const cmd=(s,type,now=0,more={})=>dispatch(s,c,{seq:s.seq+1,type,now,...more}).state;
const find=(s,id)=>cultivationJourney(s,c).tasks.find(t=>t.id===id);

test('guidance follows real draws, gathering and timed crafting without issuing rewards',()=>{
 let s=createSave(112);s.run.world.at=0;
 assert.equal(cultivationJourney(s,c).next.id,'draw');
 const before=structuredClone(s);cultivationJourney(s,c);assert.deepEqual(s,before);
 s=cmd(s,'DRAW',0,{packId:'battle',count:1});
 assert.ok(find(s,'draw').done);assert.equal(cultivationJourney(s,c).next.id,'battle');
 s=cmd(s,'START_ACTIVITY',0,{activity:'gather',herb:'H001'});
 assert.equal(find(s,'gather').done,false,'starting does not mean completed');
 s=cmd(s,'CLAIM_WORLD',180000);assert.ok(find(s,'gather').done);
 s=cmd(s,'QUEUE_BREW',180000,{herb:'H001',amount:1,mode:'count'});
 assert.equal(find(s,'brew').done,false,'queue must not count as output');
 s=cmd(s,'CLAIM_WORLD',240000);assert.ok(find(s,'brew').done);
 const result=structuredClone(s);for(let i=0;i<10;i++)cultivationJourney(s,c);
 assert.deepEqual(s,result,'rendering must not duplicate milestone rewards or advance RNG');
 s=cmd(s,'PREPARE_ITEM',240000,{id:'MED001'});assert.ok(find(s,'brew').done,'using output does not undo production practice');
});

test('unfound field and unearned directed choice do not block the suggested journey',()=>{
 const s=createSave(123);s.run.draws.battle=1;s.run.mobKills=1;s.run.guardianWins=1;s.run.mastery.gather=1;s.run.mastery.brew=1;
 assert.equal(find(s,'field').available,false);assert.notEqual(cultivationJourney(s,c).next.id,'field');
 assert.equal(find(s,'directed').available,false);
 s.meta.directed.draws=c.management.directedEvery;assert.equal(find(s,'directed').available,false);s.run.checkpoint=1;assert.ok(find(s,'directed').available);
 assert.equal(find(s,'directed').done,false,'progress alone must not claim a card');
 s.meta.directed.claimed=1;assert.ok(find(s,'directed').done);
 s.run.cards.H001=1;assert.ok(find(s,'field').available);
 s.run.world.field.enabled=true;assert.ok(find(s,'field').done);
});

test('feature introductions appear at real unlocks instead of advertising locked abilities',()=>{
 const s=createSave(123);assert.equal(featureIntroductions(s,c).length,0);
 s.run.cards.H001=1;s.run.cards.T001=3;s.meta.directed.draws=c.management.directedEvery;
 const ids=featureIntroductions(s,c).map(t=>t.id);
 assert.ok(ids.includes('field-unlocked'));assert.ok(ids.includes('directed-ready'));assert.ok(ids.includes('technique-growth'));
 assert.ok(!ids.includes('artifact-unlocked'));assert.ok(!ids.includes('rebirth-ready'));
 s.run.realmIndex=4;s.run.bossCleared=true;
 assert.ok(featureIntroductions(s,c).some(t=>t.id==='rebirth-ready'));
 assert.ok(featureIntroductions(s,c).some(t=>t.id==='artifact-unlocked'));
});

test('owned core cards direct players to equip them and old saves do not invent practice',()=>{
 const s=createSave(412);s.run.guardianWins=1;s.run.mastery.brew=1;s.run.cards.T001=1;
 assert.equal(nextStep(s,c,{winRate:0}).view,'technique');
 assert.equal(find(s,'build').view,'technique');
 s.run.technique='T001';s.run.cards.P001=1;
 assert.equal(nextStep(s,c,{winRate:0}).view,'pet');assert.ok(find(s,'build').done);
 s.run.pet='P001';s.run.boxes.gear=1;
 assert.equal(nextStep(s,c,{winRate:0}).view,'items');
 s.run.mastery.brew=0;s.run.consumables.MED001=3;
 assert.equal(find(s,'brew').done,false,'owned medicine is not evidence of crafting');
 assert.equal(find(s,'draw').done,false,'owned cards are not evidence of historical draws');
});

test('next life resets practice and keeps meta goals, returning players prioritize builds',()=>{
 let s=createSave(661);s.run.world.at=0;s.run.mapIndex=3;s.run.checkpoint=7;s.run.bossCleared=true;
 s.run.cards.T001=1;s.run.cards.P001=1;s.run.mastery.gather=3;s.run.mastery.brew=1;s.run.draws.battle=1;
 s=cmd(s,'CLAIM_WORLD');s=cmd(s,'LEARN_DAO',0,{id:'inherit'});
 s=cmd(s,'SET_INHERITANCE',0,{ids:['T001','P001']});
 s=cmd(s,'REINCARNATE');const journey=cultivationJourney(s,c);
 assert.equal(journey.life,2);assert.ok(find(s,'cycle').done);assert.ok(find(s,'dao').done);assert.ok(find(s,'inherit').done);
 assert.equal(find(s,'gather').done,false);assert.equal(find(s,'brew').done,false);assert.equal(find(s,'draw').done,false);
 assert.ok(find(s,'build').done,'inherited core is already equipped by the engine');
 s=cmd(s,'EQUIP_TECH',0,{id:null});s=cmd(s,'EQUIP_PET',0,{id:null});
 assert.equal(cultivationJourney(s,c).next.id,'build');assert.equal(cultivationJourney(s,c).next.view,'technique');
});
