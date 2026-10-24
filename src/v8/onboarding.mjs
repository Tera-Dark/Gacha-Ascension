import {unlockedPack} from './modules.mjs';
/**
 * Optional newcomer route. Derived from existing saved gameplay facts, so
 * it needs no new save fields and older saves can still be loaded.
 */
export function noviceStep(s){
 const r=s?.run;
 if(!r||s.meta?.reincarnations>0||r.guardianWins>0||r.bossWins>0||r.mapIndex!==0)return null;
 if(!Object.values(r.draws||{}).some(n=>n>0))
  return {index:1,title:"先抽一张机缘",description:"你拥有"+r.stones+"灵石。第一张战力秘藏固定获得攻击强化，先抽一张，感受卡牌怎样直接改变战力。",view:"gacha",packId:"battle",action:"前往战力首抽"};
 if(!r.mobKills)
  return {index:2,title:"打一场小怪，获得资源",description:"战力会自动生效。开启自动刷怪，看每次命中扣血，并获得灵石和修为；这些资源会用于后续抽卡和突破。",view:"explore",target:"autoFarm",action:"开始自动刷怪"};
 return {index:3,title:"第一次挑战守卫",description:"小怪提供资源，但不会推进地图；击败守卫才能进入下一关。点击守卫挑战，失败不退关（真正死亡时穿戴装备有遗失风险）。",view:"explore",target:"challenge",action:"前往挑战守卫"};
}

/** A read-only checklist, not a reward ledger. Practice is checked for this life;
 * permanent objectives use existing meta facts. Never infer consumed history. */
export function cultivationJourney(s,c){
 const r=s.run,m=s.meta,has=effect=>Object.values(c.cards).some(x=>x.effect===effect&&r.cards[x.id]>0);
 const task=(id,chapter,title,description,done,view,extra={})=>({id,chapter,title,description,done:!!done,view,...extra});
 const every=c.management.directedEvery,ready=Math.floor(m.directed.draws/every)>m.directed.claimed;
 const coreOpen=['technique','pet','cave'].some(id=>unlockedPack(s,c,id));
 const cores=Object.keys(m.knowledge.cards).filter(id=>['technique','pet','cave'].includes(c.cards[id]?.effect));
 const tasks=[
  task('draw','入门','抽取一张机缘','战力首抽保证强化攻击；抽卡结果自动保存。',Object.values(r.draws).some(n=>n>0),'gacha',{packId:'battle'}),
  task('battle','入门','击败一只小怪','开启探索，获得灵石和修为；随时可以停止。',r.mobKills>0,'explore',{target:'autoFarm'}),
  task('guard','入门','击败首位守卫','守卫推进关卡；小怪负责积累，失败留在当前关。',r.guardianWins>0||r.bossWins>0||r.mapIndex>0,'explore',{target:r.checkpoint===c.checkpointsPerMap-1?'challengeBoss':'challenge'}),
  task('gather','经营','亲手采一份药草','在修士栏选择采药，会替换探索；基础回春草始终可采。',r.mastery.gather>0,'explore',{target:'activityPanel'}),
  task('brew','经营','炼成一颗丹药','采足3份回春草，丹炉排程选回春丹、数量1；炼制需要时间。',r.mastery.brew>0,'cave',{target:'queueBrew'}),
  task('meditate','经营','体验一次闭关','修为不足时可闭关；闭关期间洞府仍独立生产。',r.mastery.meditate>0,'cultivate'),
  task('build','构筑','装配功法或灵宠',unlockedPack(s,c,'technique')?'到对应页面装配；尚未发现时可抽取，或积累定向机缘。':'首位守卫后开启功法机缘，先用战力卡应对山门。',r.technique||r.pet,r.technique||has('technique')?'technique':has('pet')?'pet':'gacha',has('technique')||has('pet')||r.technique||r.pet?{}:{packId:'technique',available:unlockedPack(s,c,'technique'),waiting:'待首位守卫'}),
  task('field','经营','经营一块药田',r.cards.H001?'选择药草并开启药田，与修士活动并行。':'发现九转灵田后可种植；当前仍能手动采药和炼丹。',r.world.field.enabled,'cave',{target:'toggleField',available:r.cards.H001>0,waiting:'待九转灵田'}),
  task('map','构筑','走出青云山麓','积累战力、准备丹药，再挑战首图最终Boss。',r.mapIndex>0||r.bossWins>0,'explore',{target:r.checkpoint===c.checkpointsPerMap-1?'challengeBoss':'challenge'}),
  task('realm','构筑','完成一次突破','修为、悟道和地图资格缺哪项，就按突破页补哪项。',r.realmIndex>0,'cultivate'),
  task('directed','传承','选择一次定向机缘',ready?(coreOpen?'已有可领定向；展开定向机缘，选择已开放核心卡。':'定向次数已积攒，击败首位守卫开放功法后即可选择。'):'每'+every+'次普通抽卡额外定向，跨世累计；当前'+(m.directed.draws%every)+'/'+every+'。',m.directed.claimed>0,'gacha',{target:'directedChoice',available:ready&&coreOpen||m.directed.claimed>0,waiting:coreOpen?'继续积累抽数':'待首位守卫'}),
  task('dao','传承','选择一个道统节点','首抽、首炼丹等里程碑获得道统点；按喜欢的路线投入。',Object.keys(m.dao.nodes).length>0,'fate',{tab:'dao',available:m.dao.points>0||Object.keys(m.dao.nodes).length>0,waiting:'待首次里程碑'}),
  task('inherit','传承','安排两席传承','从已发现的普通功法、灵宠、洞府中选两张不同卡，供下世起步。',m.inheritance.length===2,'fate',{tab:'inheritance',available:cores.length>=2,waiting:'待发现两张核心卡'}),
  task('cycle','传承','开启下一世','四图通关后查看清空、保留和传承，再自行决定轮回时机。',m.reincarnations>0,'fate',{tab:'inheritance',available:r.bossCleared||m.reincarnations>0,waiting:'待四图通关'})
 ];
 const order=m.reincarnations?['build','dao','draw','gather','brew','guard','realm','inherit']:['draw','battle','guard','gather','brew','build','dao','meditate','map','realm','directed','inherit','cycle','field'];
 const next=order.map(id=>tasks.find(t=>t.id===id)).find(t=>!t.done&&t.available!==false)||null;
 return {tasks,next,completed:tasks.filter(t=>t.done).length,total:tasks.length,life:m.reincarnations+1};
}

export const FIRST_VISIT_TIPS={
 cultivate:'先看缺少的突破条件；闭关补修为，修为造化补悟道。',
 gacha:'用灵石照亮命痕残卷，主线会逐页开放机缘；每20抽还可额外定向选择核心卡。',
 technique:'抽到功法后在这里主修，装配后下一场生效；可以免费切换。',
 cave:'先采3份回春草，再排程炼1颗回春丹；药田需要九转灵田。',
 pet:'选择一只已拥有灵宠出战，标签可与功法产生共鸣。',
 items:'选中物品，在详情栏穿戴、开箱或备战；药草送往丹炉。',
 fate:'道统可以提前投入；四图通关后再安排传承与轮回。',
 atlas:'当前开放前4图，其余地图仍是世界规划。',
 settings:'换手机前先导出存档，再到新设备导入；两端不会自动同步。'
};

/** Introduce an ability when it becomes usable, even if its page was seen earlier. */
export function featureIntroductions(s,c){
 const r=s.run,m=s.meta,tips=[];
 const add=(id,view,text)=>tips.push({id,view,text});
 if(Math.floor(m.directed.draws/c.management.directedEvery)>m.directed.claimed&&['technique','pet','cave'].some(id=>unlockedPack(s,c,id)))add('directed-ready','gacha','定向机缘已可领取：展开定向栏，自选一张已开放核心卡。');
 if(r.cards.H001>0)add('field-unlocked','cave','九转灵田已解锁药田：选择药草并开始种植，不占修士活动。');
 if(r.realmIndex>=4)add('artifact-unlocked','items','筑基已开放首个法器槽；法器与普通装备分别装配。');
 if(r.bossCleared)add('rebirth-ready','fate','四图已通关：在传承与轮回中检查清空清单，选好带往下世的核心卡。');
 if(Object.values(c.cards).some(x=>x.effect==='technique'&&r.cards[x.id]>=3))add('technique-growth','technique','功法已达熟练节点：展开成长说明，看看新增的战斗机制。');
 if(Object.values(c.cards).some(x=>x.effect==='pet'&&r.cards[x.id]>=3))add('pet-growth','pet','灵宠已达熟练节点：展开成长说明，查看新的协同效果。');
 return tips;
}
