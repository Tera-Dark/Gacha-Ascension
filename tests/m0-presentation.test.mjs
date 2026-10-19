import {test} from "node:test";
import assert from "node:assert/strict";
import {battleFrames,createCombatPresenter} from "../src/m0/presentation.mjs";

test("battle frame selection preserves order and never mutates combat receipt",()=>{
 const log=Array.from({length:24},(_,i)=>({turn:Math.floor(i/2)+1,actor:i%2?"enemy":"hero",amount:i+1,remaining:200-i*3}));
 const combat={log};const before=JSON.stringify(combat);
 const frames=battleFrames(combat,8);
 assert.equal(frames.length,8);
 assert.deepEqual(frames.slice(0,4),log.slice(0,4));
 assert.deepEqual(frames.slice(-4),log.slice(-4));
 assert.equal(JSON.stringify(combat),before);
});
test("short actual logs keep every blow and healing event",()=>{
 const log=[{turn:1,actor:"hero",amount:40,remaining:60},{turn:1,actor:"enemy",amount:20,remaining:80},{turn:1,actor:"regen",amount:4,remaining:64}];
 assert.deepEqual(battleFrames({log}),log);
});
test("invalid presentation frame count is rejected",()=>{
 assert.throws(()=>battleFrames({log:[]},1),/frame limit/);
});
test("presenter is a visual only façade and can cancel safely with absent DOM anchors",()=>{
 const presenter=createCombatPresenter(()=>null);
 assert.equal(presenter.isPlaying(),false);
 presenter.display({hero:{hp:100},enemy:{hp:50}});
 presenter.interval(true,1400);
 presenter.cancel();
 assert.equal(presenter.isPlaying(),false);
});
