import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCatalog,createSave,fight} from '../src/v8/engine.mjs';
import {buildRoadmap,failureEvidence} from '../src/v8/build-guide.mjs';
import {diagnosticSummary} from '../src/v8/diagnostics.mjs';
import {paintMap,paintFoe} from '../src/v8/pixel-world.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url),'utf8'));
const c=loadCatalog(read('realms-maps.v0.8.proposal.json'),read('v8-slice.json'));
test('routes distinguish missing cards, alternatives and actual next behavioral thresholds',()=>{
 const s=createSave();s.run.cards.T001=2;const routes=buildRoadmap(s,c);
 assert.equal(routes.length,3);assert.equal(routes[0].next.copies,3);assert.equal(routes[0].next.missing,1);assert.match(routes[0].next.effect,/回复/);
 s.run.cards.T001=6;assert.equal(buildRoadmap(s,c)[0].next,null);
 for(const route of routes)for(const card of [...route.core,...route.alternatives])assert.ok(c.cards[card.id]);
});
test('failure advice reports real reflection, healing and misses without mutating combat logs',()=>{
 const s=createSave(),combat=fight(s,c,'boss',{seed:41}),raw=JSON.stringify(combat);
 const why=failureEvidence(combat,0);assert.ok(['technique','pet','cave'].includes(why.view));assert.equal(JSON.stringify(combat),raw);
 const example={...combat,reason:'defeat',logs:[{actor:'counter',amount:17}]};assert.match(failureEvidence(example,3).text,/17/);
 const timeout={...combat,reason:'timeout',logs:[{actor:'regen',amount:25},{actor:'miss',owner:'hero'}]};assert.match(failureEvidence(timeout,2).text,/25.*1/);
});
test('manual diagnostics use an allowlist and contain no identity, token, inventory or RNG seed',()=>{
 const s=createSave();s.meta.token='private';s.run.cards.B001=8;const raw=JSON.stringify(diagnosticSummary(s,{token:'private'}));
 for(const word of ['private','token','seed','cards','receipts','openId','realName','snapshot'])assert.equal(raw.includes(word),false,word);
});
test('four procedural worlds and boss silhouettes are distinct, bounded pixel drawings',()=>{
 const draw=fn=>{const pixels=[];const ctx={fillStyle:'',clearRect(){},save(){},restore(){},scale(){},translate(){},fillRect(...args){assert.ok(args.every(Number.isFinite));pixels.push([this.fillStyle,...args])}};fn(ctx);return JSON.stringify(pixels)};
 assert.equal(new Set([0,1,2,3].map(i=>draw(ctx=>paintMap(ctx,i)))).size,4);
 for(let i=0;i<4;i++)assert.notEqual(draw(ctx=>paintFoe(ctx,i,false)),draw(ctx=>paintFoe(ctx,i,true)));
});
