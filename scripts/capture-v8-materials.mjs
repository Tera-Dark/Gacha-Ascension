/** Local raw store drafts from real gameplay. No seed fixtures, edited screenshots or upload. */
import {chromium} from 'playwright-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const base=new URL(process.env.V8_SMOKE_URL||'http://127.0.0.1:4180/');
if(!['localhost','127.0.0.1'].includes(base.hostname)||base.port!=='4180')throw Error('Use isolated localhost port 4180; never use a player save');
if(!process.env.CHROME_BIN)throw Error('Set CHROME_BIN; install the official Playwright ffmpeg using: node node_modules/playwright-core/cli.js install ffmpeg');
const output='dist/store-preview';await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN,headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1,recordVideo:{dir:output,size:{width:1280,height:720}}});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(new URL('preview-v0.8.html',base).href);
 await page.locator('#packList [data-draw]').first().waitFor({state:'attached'});
 if(await page.locator('#storyConversation').isVisible())await page.locator('#skipStory').click();
 await page.locator('.system-sidebar [data-view="gacha"]').click();
 await page.locator('[data-draw="battle"][data-count="1"]').click();
 await page.locator('#skipReveal').click();await page.locator('#closeReveal').click();
 await page.screenshot({path:join(output,'02-gacha.png')});
 await page.locator('.system-sidebar [data-view="explore"]').click();await page.locator('#autoFarm').click();
 // Record actual wall-clock play; no virtual-time stepping or injected progress.
 await page.waitForTimeout(15000);await page.screenshot({path:join(output,'01-exploration.png')});
 await page.locator('.system-sidebar [data-view="cave"]').click();await page.screenshot({path:join(output,'03-management.png')});
 await page.waitForTimeout(5000);await page.locator('.system-sidebar [data-view="explore"]').click();await page.waitForTimeout(10000);
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile(join(output,'capture.json'),JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,createdAt:new Date().toISOString(),source:base.href,viewport:{width:1280,height:720},status:'raw-draft-not-submitted',notes:'Fresh game; actual clicks and real combat clock. WebM raw capture is silent. Review and encode the final store video after real-device approval; no platform approval implied.'},null,2));
}finally{await context.close();await browser.close()}
console.log('Three actual 1280x720 screenshots and a raw WebM gameplay draft saved to '+output);
