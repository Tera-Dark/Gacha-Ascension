import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
/** Product version used to live in four places. package.json is authoritative;
 * diagnostics and the Android manifest must agree, and the build script fails on drift. */
test('product version stays consistent across package metadata, diagnostics and Android',()=>{
 const pkg=JSON.parse(read('package.json')).version;
 const diagnostics=read('src/v8/diagnostics.mjs');
 const gradle=read('android/app/build.gradle');
 const android=gradle.match(/versionName\s+'([^']+)'/);
 assert.ok(android,'android/app/build.gradle must declare versionName');
 assert.equal(android[1],pkg,'Android versionName must match package.json');
 const escaped=pkg.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 assert.match(diagnostics,new RegExp("version='"+escaped+"'"),'diagnosticSummary default version must match package.json');
});
