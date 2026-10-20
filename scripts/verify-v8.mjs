import {readFileSync,existsSync} from "node:fs";
import assert from "node:assert/strict";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const html=read("preview-v0.8.html"),js=read("src/v8/ui.mjs"),engine=read("src/v8/engine.mjs"),css=read("assets/css/preview.css");
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),idSet=new Set(ids);
assert.equal(ids.length,idSet.size,"Duplicate id in playable v0.8 page");
for(const id of [...js.matchAll(/\$\("([^"]+)"\)/g),...js.matchAll(/\bset\("([^"]+)"/g)].map(m=>m[1]))
 assert.ok(idSet.has(id),"UI references absent node "+id);
assert.match(html,/src="\.\/src\/v8\/ui\.mjs"/);
assert.match(html,/href="\.\/assets\/css\/preview\.css"/);
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
assert.equal(config.playableMaps,4);assert.equal(config.packs.length,8);
for(const map of world.maps.slice(0,4))assert.ok(map.boss?.id&&map.boss.name);
console.log("V0.8 preview static page verified: "+ids.length+" IDs, 9 fully navigable panels, 8 active gacha packs, 4 of 24 maps playable.");


// Keep the canonical entry and documentation links from drifting back to obsolete versions.
const landing=read("index.html"),readme=read("README.md"),agents=read("AGENTS.md"),legacyCodex=read("codex.html");
assert.match(landing,/url=\.\/preview-v0\.8\.html/,"Repository root must open the current version, not v0.1");
assert.match(readme,/GDD-v0\.9-FOUNDATION\.md/,"README must point to the only active GDD");
assert.match(agents,/data\/v8-slice\.json/,"AI agents must use current machine-readable rules");
assert.match(legacyCodex,/历史 v0\.5/,"Legacy codex must remain visibly labeled as outdated");
for(const doc of ["README.md","docs/GDD-v0.9-FOUNDATION.md","docs/REALMS-AND-MAPS-v0.8.md"]){
 const markdown=read(doc),base=new URL("../"+doc,import.meta.url);
 for(const match of markdown.matchAll(/\]\(([^)]+)\)/g)){
  const href=match[1].split("#")[0].trim();
  if(!href||/^(?:https?:|mailto:|#)/i.test(href))continue;
  const relative=new URL(href,base);
  assert.ok(existsSync(relative),"Missing current documentation link: "+doc+" → "+href);
 }
}
assert.doesNotMatch(read("package.json"),/validate-codex\.mjs/,"Ancient v0.4 validator must not reenter current checks");
console.log("Repository hygiene verified: latest landing, AI source-of-truth and all active documentation links.");
