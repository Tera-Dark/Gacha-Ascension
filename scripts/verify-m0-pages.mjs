#!/usr/bin/env node
/** M0 static publishing verifier; requires no packages/network. */
import {readFileSync,existsSync} from "node:fs";
import assert from "node:assert/strict";
const url=p=>new URL("../"+p,import.meta.url);
const files=["m0.html","m0.css","src/m0/ui.mjs","src/m0/engine.mjs","src/m0/catalog.mjs","src/m0/combat.mjs","src/m0/state.mjs","src/m0/storage.mjs","data/codex/codex.v0.5.json","index.html"];
for(const p of files)assert.ok(existsSync(url(p)),"Missing Pages asset: "+p);
const html=readFileSync(url("m0.html"),"utf8");
assert.match(html,/src="\.\/src\/m0\/ui\.mjs"/);
assert.match(html,/href="\.\/m0\.css"/);
const ui=readFileSync(url("src/m0/ui.mjs"),"utf8");
assert.match(ui,/data\/codex\/codex\.v0\.5\.json/);
const data=JSON.parse(readFileSync(url("data/codex/codex.v0.5.json"),"utf8"));
assert.equal(data.schemaVersion,"0.5");
assert.equal(data.stages.filter(s=>s.zoneId==="ZN-001"&&s.difficultyId==="normal").length,30);
console.log("M0 Pages acceptance assets verified ("+files.length+" files).");
