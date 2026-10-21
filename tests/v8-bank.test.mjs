import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bankEntries} from '../src/v8/bank.mjs';
import {MODULE_HELP} from '../src/v8/module-help.mjs';
import {loadCatalog,createSave,dispatch} from '../src/v8/engine.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const c=loadCatalog(JSON.parse(read('data/realms-maps.v0.8.proposal.json')),JSON.parse(read('data/v8-slice.json')));
test('global bank is a pure projection with distinct herb and cave namespaces and no phantom holdings',()=>{
 const s=createSave(42);assert.deepEqual(bankEntries(s,c),[]);
 Object.assign(s.run.cards,{H001:1,E001:2,T001:1,P001:1,B001:3,F001:1});
 s.run.herbs.H001=9;s.run.consumables.MED001=2;s.run.prepared.MED001=1;s.run.boxes.gear=1;s.run.pills.D004=1;s.meta.relics.R001=4;
 s.run.equipment.weapon1='E001';s.run.technique='T001';
 const copy=structuredClone(s),entries=bankEntries(s,c),get=key=>entries.find(x=>x.key===key);
 assert.deepEqual(s,copy);assert.equal(new Set(entries.map(x=>x.key)).size,entries.length);
 assert.equal(get('herb:H001').count,9);assert.equal(get('card:H001').count,1);
 assert.equal(get('card:E001').available,1);assert.equal(get('card:E001').equipped,1);
 assert.equal(get('medicine:MED001').count,3);assert.equal(get('medicine:MED001').available,2);
 assert.equal(get('pill:D004').category,'medicine');assert.equal(get('relics:R001').count,4);
 assert.equal(get('card:B001').category,'growth');assert.ok(!entries.some(x=>x.count<=0));
});
test('bank quantities follow actual equip, preparation and final box consumption transactions',()=>{
 let s=createSave(321);s.run.cards.E001=1;s.run.consumables.MED001=1;s.run.boxes.gear=1;
 const command=(type,args)=>{s=dispatch(s,c,{type,seq:s.seq+1,now:Date.now(),...args}).state};
 command('EQUIP_ITEM',{slot:'weapon1',id:'E001'});
 assert.equal(bankEntries(s,c).find(x=>x.key==='card:E001').available,0);
 assert.throws(()=>command('EQUIP_ITEM',{slot:'weapon2',id:'E001'}),/副本/);
 command('PREPARE_ITEM',{id:'MED001'});
 const medicine=bankEntries(s,c).find(x=>x.key==='medicine:MED001');assert.equal(medicine.count,1);assert.equal(medicine.available,0);assert.equal(medicine.prepared,1);
 command('OPEN_BOX',{id:'gear'});assert.ok(!bankEntries(s,c).some(x=>x.key==='box:gear'));
});
test('every page has contextual help and global navigation has no embedded maps or explanatory subtitles',()=>{
 assert.equal(Object.keys(MODULE_HELP).length,10);
 const page=read('preview-v0.8.html'),sidebar=page.match(/<nav class="system-sidebar"[\s\S]*?<\/nav>/)[0];
 assert.doesNotMatch(sidebar,/mapDrawerList|drawerCheckpointTrack|<small>/);
 const explore=page.match(/data-view-panel="explore"[\s\S]*?<div class="battle-workbench">/)[0];
 assert.match(explore,/id="explorationMap"/);assert.match(explore,/id="mapDrawerList"/);
 assert.match(page,/id="moduleHelp"[^>]*aria-labelledby/);assert.match(page,/id="bankDetail"/);
});
