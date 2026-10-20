#!/usr/bin/env node
/** M0 static publishing verifier; requires no packages/network. */
import {readFileSync,existsSync} from "node:fs";
import assert from "node:assert/strict";
const url=p=>new URL("../"+p,import.meta.url);
const files=["m0.html","assets/css/workbench.css","src/m0/presentation.mjs","src/m0/ui.mjs","src/m0/engine.mjs","src/m0/catalog.mjs","src/m0/combat.mjs","src/m0/state.mjs","src/m0/storage.mjs","data/codex/codex.v0.5.json","data/m0-packs.v0.7.json","data/m0-encounters.v0.7.json","index.html"];
for(const p of files)assert.ok(existsSync(url(p)),"Missing Pages asset: "+p);
const html=readFileSync(url("m0.html"),"utf8");
assert.match(html,/src="\.\/src\/m0\/ui\.mjs"/);
assert.match(html,/href="\.\/m0-idle\.css"/);
const ui=readFileSync(url("src/m0/ui.mjs"),"utf8");
assert.match(ui,/data\/codex\/codex\.v0\.5\.json/);
assert.match(ui,/m0-packs\.v0\.7\.json/);
assert.doesNotMatch(html,/id="train(?:attack|hp|defense)"/,"Direct training buttons must never return");
assert.match(html,/id="packs"/);
assert.match(html,/id="breakthrough"/);
const data=JSON.parse(readFileSync(url("data/codex/codex.v0.5.json"),"utf8"));
assert.equal(data.schemaVersion,"0.5");
const p=JSON.parse(readFileSync(url("data/m0-packs.v0.7.json"),"utf8"));
assert.equal(p.packs.length,4);
assert.equal(p.packs.reduce((n,pack)=>n+pack.cards.length,0),28);
assert.equal(p.ascension.requiredPill,"P-04");
assert.match(ui,/m0-encounters\.v0\.7\.json/);
assert.match(html,/id="diagnosis"/);
assert.match(html,/data-view="gacha"/);
assert.match(html,/id="combatTheatre"/);
assert.match(html,/id="heroBar"/);
assert.match(html,/id="enemyBar"/);
assert.match(html,/id="damageLayer"/);
assert.match(html,/id="intervalFill"/);
assert.match(ui,/createCombatPresenter/);
const presenter=readFileSync(url("src/m0/presentation.mjs"),"utf8");
assert.match(presenter,/battleFrames/);
for(const id of [...ui.matchAll(/\bel\("([^"]+)"\)/g),...presenter.matchAll(/\bbyId\("([^"]+)"\)/g)].map(m=>m[1])){
 assert.ok(new RegExp('id="'+id+'"').test(html),"UI script uses absent DOM id "+id);
}
const encounters=JSON.parse(readFileSync(url("data/m0-encounters.v0.7.json"),"utf8"));
assert.equal(encounters.majorFloors.length,6);
assert.equal(data.stages.filter(s=>s.zoneId==="ZN-001"&&s.difficultyId==="normal").length,30);
console.log("M0 Pages acceptance assets verified ("+files.length+" files).");
