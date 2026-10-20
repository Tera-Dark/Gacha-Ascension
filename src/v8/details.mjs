/**
 * Read-only detail selectors for the responsive UI.
 * No random calls, no mutations, no effects. Labels match the battle/economy engine.
 */
import {SAVE_KEY,heroStats,yields,enemyPreview,combatSnapshot,breakthroughRequirements,packCost,farmTarget} from "./engine.mjs";
import {STYLE_LABELS,combatStyle,RULES} from "./combat-depth.mjs";

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const fmt=n=>!Number.isFinite(n)?"—":Math.abs(n)>=1e12?(n/1e12).toFixed(2)+"兆":Math.abs(n)>=1e8?(n/1e8).toFixed(2)+"亿":Math.abs(n)>=1e4?(n/1e4).toFixed(2)+"万":Math.round(n*100)/100+"";
const pct=n=>(Math.round(n*10)/10)+"%";
const qty=(r,c,key)=>Object.values(c.cards).reduce((a,x)=>a+(x.effect===key?(r.cards[x.id]||0)*x.value:0),0);
const cave=(r,c,style)=>Object.values(c.cards).reduce((a,x)=>a+(x.effect==="cave"&&x.style===style?(r.cards[x.id]||0)*x.value:0),0);
const relic=(s,c,key)=>c.relics.reduce((a,x)=>a+(x.stat===key?(s.meta.relics[x.id]||0)*x.value:0),0);
const section=(title,rows,note="")=>({title,rows,note});
const row=(label,value,note="")=>({label,value:String(value),note});
const passiveName={attackPct:"攻击",hpPct:"气血",defPct:"防御",allPct:"全属性",stonePct:"灵石收益",qiPct:"修为收益",speedPct:"战斗加速",petPct:"灵宠效果"};
const rarityName={huang:"黄",xuan:"玄",di:"地",tian:"天"};

export function effectiveTierRates(pack,weights){
 const base=Object.entries(weights);
 const present=new Set(pack.cards.map(x=>x.rarity));
 const weightTotal=base.reduce((a,[,p])=>a+p,0);
 const availableWeight=base.reduce((a,[tier,p])=>a+(present.has(tier)?p:0),0);
 if(!(weightTotal>0)||!(availableWeight>0))throw Error("卡包没有有效稀有度");
 const missing=weightTotal-availableWeight;
 return base.filter(([tier])=>present.has(tier)).map(([tier,p])=>({
  tier,rate:(p+missing*p/availableWeight)/weightTotal*100,
  cards:pack.cards.filter(x=>x.rarity===tier)
 }));
}
export function detailModel(s,c,analysis=null){
 const h=heroStats(s,c),v=yields(s,c),r=s.run,realm=c.realms[r.realmIndex];
 const m=enemyPreview(s,c,"mob"),currentGoal=r.checkpoint===c.checkpointsPerMap-1?"boss":"guardian";
 const boss=enemyPreview(s,c,currentGoal),req=breakthroughRequirements(s,c);
 const snap=combatSnapshot(s,c,currentGoal);
 const t=snap.tech,p=snap.pet,focus=farmTarget(s,c);
 const all=qty(r,c,"allPct"),atk=qty(r,c,"attackPct"),hp=qty(r,c,"hpPct"),def=qty(r,c,"defPct");
 const hpRelic=relic(s,c,"hpPct"),attackRelic=relic(s,c,"attackPct");
 const caveMultiplier=s.meta.ultras.U003?3:1;
 const caveStone=cave(r,c,"stone"),caveQi=cave(r,c,"qi"),caveSpeed=cave(r,c,"speed"),cavePet=cave(r,c,"pet");
 const stoneBonus=qty(r,c,"stonePct"),qiBonus=qty(r,c,"qiPct"),speedBonus=qty(r,c,"speedPct");
 const totalStone=clamp(stoneBonus+caveStone*caveMultiplier+relic(s,c,"stonePct"),0,600);
 const totalQi=clamp(qiBonus+caveQi*caveMultiplier+relic(s,c,"qiPct"),0,600);
 const nextName=c.realms[r.realmIndex+1]?.name||"待续";
 const details={};
 details.explore=[
  section("修士属性构成",[
   row("当前境界",h.name),row("基础攻 / 气血 / 防","29 / 260 / 12"),
   row("境界属性倍率","×"+h.realmFactor.toFixed(3),"小境界 ×"+c.realm.breakStatSmall+"；筑基后另有跨境倍率"),
   row("攻击",fmt(h.attack),"普通攻击最终伤害的基准属性"),
   row("气血上限",fmt(h.hp),"连续守关波次之间不自动回满"),
   row("防御",fmt(h.defense),"同时影响闪避、基础承伤减免"),
   row("全属性卡加成",pct(all)),row("攻击卡加成",pct(atk)),
   row("气血卡加成",pct(hp)),row("防御卡加成",pct(def)),
   row("常规天命攻击 / 气血",pct(attackRelic)+" / "+pct(hpRelic)),
   row("鸿蒙 · 开天斧",s.meta.ultras.U001?"普攻最终伤害 ×2.5":"尚未获得")
  ],"三围源自境界基础值、卡牌、永久遗物。攻击实际伤害还会受目标防御、命中、浮动和克制影响。"),
  section("守卫与敌方属性",[
   row("本关小怪",m.name),row("小怪攻 / 气血 / 防",fmt(m.attack)+" / "+fmt(m.hp)+" / "+fmt(m.defense)),
   row("当前守关目标",boss.name),row("守关攻 / 气血 / 防",fmt(boss.attack)+" / "+fmt(boss.hp)+" / "+fmt(boss.defense)),
   row("波次",snap.waves.length+"波",snap.waves.map(x=>x.name+" "+fmt(x.hp)+"血").join(" → ")),
   row("敌人特殊能力",snap.waves.at(-1).special),
   row("克制方向","剑势 → 灵势 → 守势 → 剑势")
  ],"守卫为2波、地图Boss为3波；玩家气血和灵宠护盾贯穿整场。"),
  section("命中、防御与出手效率",[
   row("修士 / 敌方流派",STYLE_LABELS[combatStyle(t)]+" / "+STYLE_LABELS[snap.waves.at(-1).style]),
   row("双方命中率",analysis?pct(analysis.heroHitChance*100)+" / "+pct(analysis.enemyHitChance*100):"—"),
   row("承伤减免",analysis?pct(analysis.damageReduction*100):"—","基础防御提供减伤，守势功法再补充，总上限68%"),
   row("敌方最高单击样本",analysis?fmt(analysis.maxThreatHit):"—"),
   row("修士攻击间隔",fmt(RULES.heroIntervalMs/(1+v.speedPct/100))+"毫秒","战斗模拟内部时间"),
   row("自动刷怪间隔",fmt(Math.max(900,1550/(1+v.speedPct/100)))+"毫秒","本可玩切片UI挂机结算节奏；不是完整实时战斗总耗时"),
   row("攻速缩短来源",pct(speedBonus)+"（卡牌）＋"+pct(caveSpeed)+"（洞府）"),
   row("战斗加速生效",pct(v.speedPct)+"（封顶60%）"),
   row("守卫胜率估计",analysis?pct(analysis.winRate*100)+"（"+analysis.wins+"/"+analysis.samples+"）":"尚未挑战")
  ],"每次命中还会随机浮动伤害；胜率使用独立样本模拟，不窥视实际随机种子。")
 ];
 const qiNext=realm.nextQiCost;
 details.cultivate=[
  section("本阶段的突破账单",[
   row("当前 / 下一阶段",realm.name+" → "+nextName),
   row("现有修为 / 消耗",fmt(r.qi)+" / "+fmt(req.qi)),
   row("修为还缺",fmt(Math.max(0,req.qi-r.qi))),
   row("现有悟道 / 消耗",fmt(r.insight)+" / "+fmt(req.insight)),
   row("悟道还缺",fmt(Math.max(0,req.insight-r.insight))),
   row("地图Boss资格",req.needsPill?(req.needBoss?"未取得":"已取得"):req.needMapMilestone?"未取得":"满足"),
   row("突破丹",req.needsPill?"筑基丹 ×"+(r.pills.D004||0)+"（需1）":"小阶段不消耗丹药"),
   row("当前突破状态",req.canBreak?"全部满足":"仍有条件未满足"),
   row("下一次修为费用",fmt(qiNext),"当前阶段成本，非全部境界累计费用")
  ],"每次修为造化抽卡至少获得1点悟道；突破会消耗当前所需修为与悟道，成功后进入下个小阶段。"),
  section("指数成长与修炼效率",[
   row("修为增长规则","ceil(100 × 2.35^境界序号)"),
   row("悟道增长规则","ceil(1 × 1.26^境界序号)"),
   row("本阶段序号",r.realmIndex+" / 19"),
   row("修为卡牌加成",pct(qiBonus)),row("洞府修为加成",pct(caveQi*caveMultiplier)),
   row("永久遗物修为加成",pct(relic(s,c,"qiPct"))),
   row("实际修为增益",pct(totalQi)+"（封顶600%）"),
   row("可持有筑基丹",fmt(r.pills.D004||0)),row("丹道筑基丹保底剩余",Math.max(1,c.realmPillPity-r.pillPity)+"抽")
  ],"地图中的小怪负责提供修为，丹药和悟道来自抽卡。当前切片可突破至筑基初期。")
 ];
 details.gacha=[
  section("当前卡池成本与抽卡次数",[
   ...c.packs.map(pack=>row(pack.name,fmt(packCost(s,c,pack.id))+"灵石 / 抽","当世累计"+(r.draws[pack.id]||0)+"抽")),
   row("灵石现存",fmt(r.stones)),
   row("丹道目标丹保底剩余",Math.max(1,c.realmPillPity-r.pillPity)+"抽"),
   row("总抽数",Object.values(r.draws).reduce((a,b)=>a+b,0))
  ],"当前价格受地图指数倍率影响。单抽和十连按相同逐抽规则结算，不花灵石直接加人物等级。"),
  ...c.packs.map(pack=>{
   const tiers=effectiveTierRates(pack,c.rarityWeights);
   return section(pack.name+" · 实际概率与卡牌图鉴",[
    ...tiers.map(x=>row(rarityName[x.tier]+"阶",pct(x.rate),"该阶每张卡概率≈"+pct(x.rate/x.cards.length))),
    ...pack.cards.map(card=>row(card.name+" ["+rarityName[card.rarity]+"]","已持有×"+(r.cards[card.id]||r.pills[card.id]||0),
     "本次候选效果 "+card.effect+" +"+card.value+(card.style?" · "+card.style:"")))
   ],"第1次战力秘藏固定破军剑心；丹道筑基丹最多8抽保底。稀有度缺档时会按剩余权重重投，因此这里展示实际有效阶位概率。");
  })
 ];
 details.technique=[
  section("装配功法真实战斗计算",[
   row("当前主修",r.technique?c.cards[r.technique].name:"无"),
   row("功法流派",STYLE_LABELS[combatStyle(t)]),
   row("生效总强度",pct(t.power),"功法基础效果 × 重复数量 × 大道书(如有)"),
   row("功法重复份数",r.technique?(r.cards[r.technique]||0):0),
   row("鸿蒙大道书",s.meta.ultras.U004?"功法正面效果 ×2.5":"未获得"),
   row("剑势", "克制灵势，弱于守势","流云剑经逐击剑气，九霄破军诀每3次出手爆发"),
   row("守势","克制剑势，弱于灵势","降低承伤，参与总减伤68%上限"),
   row("灵势","克制守势，弱于剑势","提高独立灵宠攻击，无宠时没有额外灵宠输出")
  ],"装备功法不用灵石，切换即时影响下一场真实战斗。"),
  section("功法图鉴与库存",
   c.packs.find(x=>x.id==="technique").cards.map(x=>row(x.name,"×"+(r.cards[x.id]||0),
    STYLE_LABELS[x.style==="guard"?"ward":x.style==="spirit"?"spirit":"blade"]+" · 单份+"+x.value+"%")))
 ];
 details.cave=[
  section("洞府建筑的逐项加成",[
   ...c.packs.find(x=>x.id==="cave").cards.map(x=>row(x.name+" ("+x.style+")",
     "×"+(r.cards[x.id]||0),"单份+"+pct(x.value)+"，合计+"+pct(x.value*(r.cards[x.id]||0)))),
   row("洞天珠",s.meta.ultras.U003?"洞府资源增量 ×3":"未获得"),
   row("洞府灵石贡献",pct(caveStone*caveMultiplier)),
   row("洞府修为贡献",pct(caveQi*caveMultiplier)),
   row("洞府战斗加速",pct(caveSpeed)),
   row("洞府灵宠增幅",pct(cavePet)),
   row("灵石总增益",pct(totalStone)+"（封顶600%）"),
   row("修为总增益",pct(totalQi)+"（封顶600%）"),
   row("攻击速度总增益",pct(v.speedPct)+"（封顶60%）")
  ],"建筑均来自洞府营造卡包，重复抽到自动叠加。经济收益采用按组加算并设上限，避免指数失控。")
 ];
 details.pet=[
  section("当前出战灵宠属性",[
   row("出战灵宠",r.pet?c.cards[r.pet].name:"未出战"),
   row("当前技能",p.style==="none"?"无":p.style),
   row("持有份数",r.pet?(r.cards[r.pet]||0):0),
   row("技能计算强度",pct(p.power)),
   row("洞府灵宠加成",pct(cavePet)),
   row("永久遗物灵宠加成",pct(relic(s,c,"petPct"))),
   row("鸿蒙始祖印",s.meta.ultras.U002?"灵宠技能伤害 ×4":"未获得"),
   row("玄龟护盾",p.style==="ward"?fmt(Math.round(h.hp*clamp(p.power/200,0,.50)))+"（每场起始）":"未启用"),
   row("雷隼破甲",p.style==="pierce"?"无视敌人防御55%":"未启用")
  ],"宠物每次真实战斗独立结算；一场多波Boss战中护盾不会随波刷新。"),
  section("御兽图鉴与库存",
   c.packs.find(x=>x.id==="pet").cards.map(x=>row(x.name,"×"+(r.cards[x.id]||0),x.description||"")))
 ];
 const ownedRelics=c.relics.filter(x=>s.meta.relics[x.id]);
 details.fate=[
  section("轮回账本",[
   row("本世最高地图",r.mapIndex+1),row("账号最好地图",s.meta.bestMap),
   row("本世已胜战斗",r.victories),row("本世Boss胜场",r.bossWins),
   row("轮回次数",s.meta.reincarnations),row("现存因果",s.meta.fate),
   row("天命箱售价",c.fate.price+"因果"),
   row("本世轮回预计获得",r.bossCleared?55+Math.max(0,r.realmIndex-3)*10:"需击败第四图Boss")
  ],"轮回清空本世卡牌/洞府/境界/资源；跨世永久遗物和因果不会清除。"),
  section("遗物掉落概率与永久效果",[
   ...Object.entries(c.fate.rarities).map(([tier,w])=>row(rarityName[tier]+"阶常规遗物",pct(w))),
   row("鸿蒙独立追加概率",(c.fate.ultraChance*100).toFixed(2)+"%","无保底，不替代常规抽取"),
   row("常规遗物种类","测试池 "+c.relics.length+"种"),
   row("已拥有常规遗物种类",ownedRelics.length),
   ...ownedRelics.map(x=>row(x.name+" ×"+s.meta.relics[x.id],pct(x.value*s.meta.relics[x.id]),passiveName[x.stat]||x.stat)),
   ...c.ultras.map(x=>row("鸿蒙·"+x.name,s.meta.ultras[x.id]?"已获得":"未获得","专属最终效果 ×"+x.value))
  ],"测试池仍只有10件常规遗物；正式30件遗物和毕业共鸣尚未全部实装。")
 ];
 details.atlas=[
  section("世界和当前地图",[
   row("计划总地图","24张"),row("目前实装","4张"),
   row("已解锁地图",r.mapIndex+1),
   row("所在地图",c.maps[r.mapIndex].name),row("当前关卡",r.checkpoint+1+" / "+c.checkpointsPerMap),
   row("本地图Boss",c.maps[r.mapIndex].boss.name),
   row("本地图环境特点",c.maps[r.mapIndex].mechanicDescription),
   row("地图怪物气血倍率","×"+Math.pow(c.balance.mapHpFactor,r.mapIndex).toFixed(3)),
   row("地图怪物攻击倍率","×"+Math.pow(c.balance.mapAttackFactor,r.mapIndex).toFixed(3)),
   row("地图灵石收益倍率","×"+Math.pow(c.balance.mapRewardFactor,r.mapIndex).toFixed(3)),
   row("每图Boss遭遇", "3波连续作战")
  ],"未开放的20张地图仅展示规划名称与特色，不代表玩法关卡已实装。")
 ];
 details.settings=[
  section("数据与存档状态",[
   row("存档版本",s.schemaVersion),row("存档命名空间",SAVE_KEY),
   row("已完成交易序号",s.seq),
   row("当前伪随机种子",s.seed>>>0,"仅供问题复现，重进游戏不应重抽同一次奖励"),
   row("本世累计获得灵石",fmt(r.totalEarned)),
   row("本世累计花费灵石",fmt(r.totalSpent)),
   row("本世现存灵石",fmt(r.stones)),
   row("灵石流水核对",r.totalEarned+110===r.stones+r.totalSpent?"一致":"异常"),
   row("击败普通小怪",r.mobKills),
   row("关卡守卫胜场",r.guardianWins),
   row("地图Boss胜场",r.bossWins),
   row("战败总次数",r.losses)
  ],"数值来源于游戏本地存档。导出请用上方按钮；此详情面板不修改存档，也不会重置游戏。")
 ];
 return details;
}
