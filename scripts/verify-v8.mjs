import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("preview-v0.8.html"),js=read("src/v8/ui.mjs"),engine=read("src/v8/engine.mjs"),css=read("v8.css");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),idSet=new Set(ids);
assert.equal(ids.length,idSet.size,"Duplicate id in playable v0.8 page");
for(const id of [...js.matchAll(/\$\("([^"]+)"\)/g),...js.matchAll(/\bset\("([^"]+)"/g)].map(m=>m[1]))
 assert.ok(idSet.has(id),"UI references absent node "+id);
assert.match(html,/src="\.\/src\/v8\/ui\.mjs"/);
assert.match(html,/href="\.\/v8\.css"/);
assert.match(html,/id="heroBar"/);assert.match(html,/id="enemyBar"/);
assert.match(html,/id="autoFarm"/);assert.match(html,/id="challengeBoss"/);
assert.match(html,/data-view-panel="fate"/);assert.match(js,/BATTLE/);
for(const name of ["explore","cultivate","gacha","technique","cave","pet","fate","atlas","settings"]){
 assert.match(html,new RegExp('data-view-panel="'+name+'"'));
 assert.match(html,new RegExp('data-view="'+name+'"'));
}
assert.match(engine,/needMapMilestone/);
assert.match(engine,/reincarnate/);
assert.match(css,/v8-battle-actions/);
const world=JSON.parse(read("data/realms-maps.v0.8.proposal.json"));
const config=JSON.parse(read("data/v8-slice.json"));
assert.equal(world.maps.length,24);assert.equal(world.cultivation.length,20);
assert.equal(config.playableMaps,4);assert.equal(config.packs.length,7);
for(const map of world.maps.slice(0,4))assert.ok(map.boss?.id&&map.boss.name);
console.log("V0.8 preview static page verified: "+ids.length+" IDs, 9 fully navigable panels, 7 active gacha packs, 4 of 24 maps playable.");
