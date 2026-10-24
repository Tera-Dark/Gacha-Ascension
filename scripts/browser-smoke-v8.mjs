/** Real Chromium clock: virtual-time dumping cannot reliably sample RAF contact frames. */
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {chromium} from 'playwright-core';
const base=new URL(process.env.V8_SMOKE_URL||'http://127.0.0.1:4180/');
if(!['127.0.0.1','localhost'].includes(base.hostname)||base.port!=='4180')throw Error('Browser fixtures require an isolated localhost server on port 4180');
let executablePath=process.env.CHROME_BIN;
if(!executablePath)for(const name of ['google-chrome','chromium','chromium-browser']){
 try{executablePath=execFileSync('which',[name],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();break}catch{}
}
if(!executablePath)throw Error('Set CHROME_BIN to a Chromium executable');
const output=process.env.V8_SMOKE_OUTPUT||'.cache/browser-v8';await mkdir(output,{recursive:true});
const cases=[
 ['desktop',1440,900,null],['phone',390,844,null,'reduce'],
 ['mobile',390,844,'v8-mobile-smoke.html'],
 ['pixel-assets',900,700,'v8-pixel-assets-smoke.html'],
 ['live-combat',900,700,'v8-live-combat-smoke.html'],
 ['save-recovery',900,700,'v8-logic-smoke.html'],
 ['novice',390,844,'v8-novice-onboarding-smoke.html',null,45000],
 ['manual-combat',900,720,'v8-true-manual-combat-smoke.html',null,120000],
 ['auto-push',900,700,'v8-auto-push-realtime-smoke.html',null,60000],
 ...[[844,390],[740,360],[667,375]].map(([w,h])=>['landscape-'+w,w,h,'v8-landscape-smoke.html']),
 ...[[1440,900],[390,844],[844,390]].map(([w,h])=>['bank-'+w,w,h,'v8-bank-smoke.html']),
 ['bank-reduced-motion',844,390,'v8-bank-smoke.html','reduce'],
 ['management',1280,800,'v8-management-smoke.html'],
 ['return-safety',900,720,'v8-return-smoke.html',null,120000],
 ['four-worlds',844,390,'v8-world-presentation-smoke.html'],
 ['mobile-host',900,700,'v8-mobile-host-smoke.html'],
 ['guidance-phone',390,844,'v8-guidance-smoke.html'],
 ['guidance-landscape',844,390,'v8-guidance-smoke.html','reduce'],
 ['story-phone',390,844,'v8-story-smoke.html'],
 ['story-landscape',844,390,'v8-story-smoke.html','reduce']
];
const requested=process.env.V8_SMOKE_CASES?.split(',').map(x=>x.trim());
const selectedCases=requested?cases.filter(([name])=>requested.includes(name)):cases;
if(!selectedCases.length)throw Error('No matching browser acceptance cases');
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let failures=0;
try{
 for(const [name,width,height,fixture,reducedMotion='no-preference',timeout=25000] of selectedCases){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:reducedMotion||'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Existing subsystem fixtures isolate their feature, while story fixtures exercise
  // the genuine fresh-player conversation and progression gates end to end.
  if(fixture&&fixture!=='v8-story-smoke.html')await context.addInitScript(()=>localStorage.setItem('gacha-ascension-v8-story-reader-v1',JSON.stringify({read:{awakening:true}})));
  try{
   await page.bringToFront();
   await page.goto(new URL(fixture?'tests/'+fixture:'preview-v0.8.html',base).href);
   if(fixture){
    await page.waitForFunction(()=>['PASS','FAIL','SKIP'].includes(document.getElementById('result')?.dataset.result),{},{timeout});
    const result=await page.locator('#result').textContent();
    if(await page.locator('#result').getAttribute('data-result')!=='PASS')throw Error(result);
    console.log(name+': '+result);
   }else{
    // Card packs initialize offscreen while exploration is the active view.
    await page.locator('#packList [data-draw]').first().waitFor({state:'attached'});
    await page.locator('#heroArt canvas').waitFor();
    if(await page.locator('#mapName').textContent()!=='青云山麓')throw Error('Initial map did not render');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Horizontal overflow');
    console.log(name+': PASS rendered assets and initial layout');
   }
   if(errors.length)throw Error(errors.join('\n'));
  }catch(error){failures++;console.error(name+': FAIL '+error.message)}
  finally{
   await page.screenshot({path:join(output,name+'.png')}).catch(()=>{});
   await writeFile(join(output,name+'.html'),await page.content());await context.close();
  }
 }
}finally{await browser.close()}
if(failures)throw Error(failures+' browser acceptance case(s) failed');
console.log('All '+selectedCases.length+' real-clock Chromium acceptance cases passed');
