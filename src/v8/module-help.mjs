/** Contextual help keeps instructions and numeric reference out of the workspace. */
export const MODULE_HELP={
 explore:['地图探索','探索会持续获得灵石、修为与基础战利品；守卫和地图 Boss 推进进度，失败留在当前关。','修士只能安排一种主活动：探索、采药或闭关。切换前结算已完成收益，未完成的主活动计时重新开始；洞府独立生产，离线上限24小时。','地图与关卡在探索页查看。装备、功法、灵宠和战备共同决定战斗表现；战前推演可以比较已持有构筑。死亡有50%概率失去一份穿戴中的装备。'],
 cultivate:['境界突破','闭关和战斗积累修为，修为造化卡获得悟道。满足页面列出的条件即可突破；跨大境界还需要丹药和地图 Boss 资格。','已修过的境界在下一世只需60%修为。闭关与探索、采药互斥；洞府聚灵阵可提高闭关效率。'],
 gacha:['机缘抽卡','抽卡解锁功法、灵宠、洞府、配方与装备。九类卡包随进度开放；单抽和十连价格见各卡包。','每20次普通抽卡，额外定向选择一张当前开放的核心卡，进度跨世保留。定向不含天命遗物、太古与鸿蒙。','快捷揭晓只跳过重复的普通机缘演出；结果在动画前存档。'],
 technique:['功法','一次主修一门功法，可以免费切换。剑修积累剑意爆发，体修以护盾反击，御灵以灵契协同。','同名核心卡在1／3／6份解锁节点，数值最多计算6份；多余副本保留。卡片展开成长节点可查看具体变化。'],
 cave:['洞府经营','药田和丹炉独立于修士活动运行。九转灵田解锁药田；聚灵阵支持闭关，云台提高活动效率，蕴兽台支持御灵。','基础回春草与回春丹必定可用，高级药草和配方由抽卡解锁。3份药草炼成1颗战斗丹药。','丹炉顺序处理任务，可指定数量或维护库存。缺料等候，补足后续炼；达到目标或库存上限即暂停。不自动消耗突破丹。'],
 pet:['御兽灵契','一次出战一只灵宠，免费切换。灵宠的攻击、护盾、破甲和修行加成参与实际结算。','同名灵宠在1／3／6份解锁节点，数值最多计算6份。功法和灵宠的流派标签可产生共鸣。'],
 items:['道具行囊','这里统一查看装备、法器、丹药、药草、宝箱、机缘和永久遗物。按分类或名称查找，选中物品后在右侧查看效果与操作。','装备数量包含已穿戴副本，双武器、双饰品需要足够副本。战斗丹药可加入下场备战，每种最多3份；突破丹在突破时消耗。药草在洞府按时间炼制。','自动吃药消耗25因果永久解锁，默认关闭。开启后，存活且气血低于阈值时消耗回春丹。装备箱只出黄／玄基础装备，药草箱开出2–5份药草。'],
 fate:['轮回天命','击败第四图最终 Boss 后可自愿轮回。操作前查看结算预览：本世境界、叠层、装备、材料、丹药、熟练度和排程清空；见闻、道统、定向进度、因果和遗物保留。','首次轮回起开放两席传承，从历史发现的普通功法、灵宠、洞府中选两张不同卡，下世各获得基础副本。道统节点可改善起步与经营。','天命箱40因果。太古奇珍每箱独立十万分之一、鸿蒙异宝百万分之一，均不保底，不替代常规奖励。'],
 atlas:['世界图鉴','当前前4张地图可玩，其余20张为世界规划，尚未开放。地图 Boss 和境界资格共同控制前进。'],
 settings:['存档设置','游戏自动保存在当前浏览器或安卓应用。本地存档可导出／导入 JSON；导入先校验并备份原档，实时战斗中须等结束。网页与应用不会自动同步，换设备请手动转移。重开及 Schema 8 升级为9前保留原始备份。','美术与游戏均可本地运行；清除浏览器数据或卸载应用可能删除本地存档，请定期导出。修行手册内可关闭或重看初见提示。']
};
export function mountHelp(currentView){
 const dialog=document.getElementById('moduleHelp'),sections=document.getElementById('moduleHelpSections');
 for(const key of Object.keys(MODULE_HELP)){
  const wrapper=document.createElement('div');wrapper.dataset.helpSection=key;wrapper.hidden=true;
  const detail=document.getElementById(key);if(detail)wrapper.append(detail);
  sections.append(wrapper);
 }
 let opener=null;
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-module-help]');if(!button)return;
  const key=button.dataset.moduleHelp||currentView(),[title,...paragraphs]=MODULE_HELP[key];
  document.getElementById('moduleHelpTitle').textContent=title;
  document.getElementById('moduleHelpText').replaceChildren(...paragraphs.map(text=>{const p=document.createElement('p');p.textContent=text;return p}));
  for(const section of sections.children)section.hidden=section.dataset.helpSection!==key;
  opener=button;dialog.showModal();
 });
 document.getElementById('closeModuleHelp').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 dialog.addEventListener('close',()=>{if(dialog.open)return;for(const d of sections.querySelectorAll('details'))d.open=false;opener?.focus({preventScroll:true})});
 const map=document.getElementById('explorationMap');
 document.getElementById('openMapDrawer').addEventListener('click',()=>map.showModal());
 document.getElementById('closeExplorationMap').addEventListener('click',()=>map.close());
 map.addEventListener('click',e=>{if(e.target===map){const r=map.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)map.close()}});
 const combat=document.getElementById('combatOptions');
 document.getElementById('openCombatOptions').addEventListener('click',()=>combat.showModal());
 document.getElementById('closeCombatOptions').addEventListener('click',()=>combat.close());
 combat.addEventListener('click',e=>{if(e.target===combat){const r=combat.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)combat.close()}});
}
