/** Small UI glyphs drawn on a 24px grid; shared by every pixel-themed screen. */
const paths={
 sword:'M17 2h5v5h-2v3h-3v3h-3v3h-3v-3h3v-3h3V7h3V4h-3zM5 12h3v3h3v3H8v3H5v-3H2v-3h3z',
 coin:'M7 2h10v2h3v3h2v10h-2v3h-3v2H7v-2H4v-3H2V7h2V4h3zm1 5v10h8V7zm3 3h2v4h-2z',
 scroll:'M4 3h16v3h2v5h-4V7H7v13h10v-4h5v3h-2v3H5v-2H2V6h2zm5 6h7v2H9zm0 4h7v2H9z',
 book:'M3 3h7v2h4V3h7v18h-7v-2h-4v2H3zm3 3v12h3V6zm9 0v12h3V6z',
 cave:'M9 2h6v3h3v3h3v14H3V8h3V5h3zm0 10v8h6v-8h-2v-2h-2v2z',
 fox:'M3 2h3v3h3v3h6V5h3V2h3v13h-3v4h-3v3H9v-3H6v-4H3zm4 8v3h3v-3zm7 0v3h3v-3zm-4 6v3h4v-3z',
 bottle:'M8 2h8v3h-2v4h3v3h3v9H4v-9h3V9h3V5H8zm0 12v4h8v-4z',
 bag:'M8 2h8v3h-2v3h4v3h3v11H3V11h3V8h4V5H8zm1 11v6h6v-6z',
 fate:'M9 1h6v3h4v4h4v8h-4v4h-4v3H9v-3H5v-4H1V8h4V4h4zm1 6v3H7v4h3v3h4v-3h3v-4h-3V7z',
 map:'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3zm5 0v11h3V5zm8 3v11h3V8z',
 save:'M3 2h16v3h3v17H2V2zm3 3v6h12V5zm1 10v5h10v-5z',
 leaf:'M18 2h4v10h-3v4h-4v3h-4v3H7v-5H2v-4h3V9h4V5h4V2zm-4 7h-3v3H8v3h3v-3h3z'
};
export function pixelIcon(name,extra=''){
 return '<svg class="px-ui-icon '+extra+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="'+(paths[name]||paths.fate)+'"/></svg>';
}
export const packIcons={battle:'sword',wealth:'coin',cultivation:'scroll',technique:'book',cave:'cave',pet:'fox',elixir:'bottle',equipment:'bag',artifact:'fate'};
export function initPixelUI(){
 const screens={
  cultivate:['01','scroll','问道台','积蓄修为 · 凝神破境','CULTIVATION'],
  gacha:['02','fate','万象阁','九道机缘 · 一念天成','FATE & FORTUNE'],
  technique:['03','book','藏经楼','主修一法 · 剑守灵势','TECHNIQUES'],
  cave:['04','cave','山中洞府','灵田聚气 · 营造长生','MOUNTAIN RETREAT'],
  pet:['05','fox','御灵苑','缔结灵契 · 共赴山海','SPIRIT COMPANIONS'],
  items:['06','bag','百宝行囊','战利归囊 · 炼药备战','INVENTORY'],
  fate:['07','fate','轮回台','前尘归一 · 因果长存','SAMSARA'],
  atlas:['08','map','山海舆图','四境已启 · 大千待寻','WORLD ATLAS'],
  settings:['09','save','修行手札','封存此世 · 续写仙途','ARCHIVE']
 };
 for(const [view,[index,icon,title,subtitle,english]] of Object.entries(screens)){
  const panel=document.querySelector('[data-view-panel="'+view+'"]');if(!panel)continue;
  const banner=document.createElement('header');banner.className='px-system-banner';
  banner.innerHTML='<div class="px-banner-mark">'+pixelIcon(icon)+'</div><div><div class="module-title"><h2>'+title+'</h2><button type="button" class="module-help" data-module-help="'+view+'" aria-label="查看'+title+'说明">?</button></div></div><span class="px-banner-index">'+index+'</span>';
  panel.prepend(banner);
 }
 for(const node of document.querySelectorAll('button[data-view] .nav-glyph,.mobile-tabs button[data-view]>span')){
  const view=node.closest('button').dataset.view;node.innerHTML=pixelIcon(screens[view]?.[1]||'sword');
 }
 for(const button of document.querySelectorAll('.mobile-sheet-grid button[data-view]')){
  const label=button.querySelector('span');
  button.innerHTML=pixelIcon(screens[button.dataset.view]?.[1]||'sword');
  if(label)button.append(label);
 }
}
