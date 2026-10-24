import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const manifest=JSON.parse(read('assets/pixel/manifest.json'));
test('runtime art uses independent transparent sprites, never concept UI crops',()=>{
 const css=read('assets/css/preview.css').toString();
 assert.doesNotMatch(css,/concept-reference\.png/);
 for(const path of ['hero/portrait.png','wolf/portrait.png','fox/portrait.png'])assert.ok(css.includes(path));
 for(const actor of [manifest.hero,manifest.enemies[0],manifest.pet])for(const action of ['idle','attack']){
  assert.equal(actor[action].frames.length,6);
  for(const path of actor[action].frames){const png=read('assets/pixel/'+path);assert.equal(png.readUInt32BE(16),192);assert.equal(png.readUInt32BE(20),192);assert.equal(png[25],6,'sprite requires an alpha channel')}
 }
});
