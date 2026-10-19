# Gacha Ascension · 架构增补 v0.5

> **设计提案；v0.1 在线代码未改变**。本文件继承 [v0.4 架构](architecture-v0.4.md)，覆盖鸿蒙独立奖池、图鉴共鸣、渐进解锁、玩家成长实验的增量规则。总体 GDD：[v0.5](GDD-v0.5.md)。

## 1. 单一系统数据源与依赖

系统仍分为 Meta（轮回永久）/ Run（当世重置），UI 只通过 Commands 与 Selectors 访问，不能直接写战斗值与奖品库存。

~~~ts
type NewMetaFields = {
  ultraOwned: Record<string, 0 | 1>;            // 四件鸿蒙异宝，唯一持有
  ultraDrawsWithoutHit: number;                  // 仅用于展示统计，无保底
  ultraTotalHits: number;                       // 统计鸿蒙触发次数
  ordinaryResonanceDraws: number;               // 五档30件全部毕业后溢出箱计数
  unlocks: Record<string, true>;                // 账号永久开放系统
  claimedUnlockRewardIds: Record<string, true>; // 每个首次解锁礼包只发一次
  highestMainlineDepth: number;
};

type UnlockDefinition = {
  id: string;
  mainlineDepth: number;
  featureId: string;
  phase: 'P0' | 'P1' | 'P2';
  name: string;
  intro: string;
  rewardPolicy: 'unlock_only' | 'one_free_run_pack_draw';
};
~~~

鸿蒙异宝不是 Inventory、背包物品或局外可装备传承；它由 Meta 唯一管理。第六稀有度 \`hongmeng\` 只允许局外天命遗物系统使用，不可混入功法、建筑、灵宠五档品质分布。

## 2. 开箱事务 v0.5

\`\`\`text
OpenRelicChest(count=1|10,txnId)
  → validate enough fate (40 × count)
  → validate transaction not already committed
  → copy current MetaState into transactional state
  → repeat count times:
       availableOrdinary = 30 normal relics with copies below individual cap
       if available: roll ordinary rarity with independent ordinary pity counters
       else: add +1 resonance progress, freeze ordinary pity UI
       availableUltra = 4 ultra relics not owned
       if availableUltra not empty:
           independently roll 0.01% jackpot
           on success: select one available ultra uniformly, mark owned once
       after each iteration: update draw totals and receipts
  → commit currency and results once
  → produce audio / visual receipts
\`\`\`

- 单抽10次和十连1次从同一seed、同一初始状态下获得一样的顺序结果；
- 每次普通箱单独判定一次鸿蒙，**一箱最多增加1件**；中奖也是正常普通箱奖励的额外物品；
- **常规概率重排与鸿蒙判定完全独立**。常规仙阶保底不影响鸿蒙。
- **在箱数跨越常规毕业边界时**，第N次可能是常规第30件的最后层，第N+1次立即给予共鸣经验，绝不扣钱后不给常规/共鸣收益。
- 因果不足、非法配置、事务重复、箱子类型不允许时，整个交易回滚；不允许开出异宝以后又因 UI 动画异常导致重复奖励。

## 3. 共鸣余响的纯计算

~~~ts
const ordinaryCapped = ordinaryRelics.every(
  relic => meta.relicCopies[relic.id] >= relic.maxStacks
);

// only after ordinaryCapped; do not count ultra IDs
const completedResonanceLevels = Math.min(
  100, Math.floor(meta.ordinaryResonanceDraws / 25)
);
const addedBaseStatsPct = completedResonanceLevels * 0.1; // +0..10%
~~~

共鸣属于账号的隐式图鉴成长，而非一笔可以交易的货币，数值来源只可能是**五档常规30件全都满级后继续开箱**。共鸣满级以后，UI提示“普通奖励无数值收益，鸿蒙概率仍0.01%”。

## 4. 四种鸿蒙效果独立注册

| effectKey | 生效目标 | 类型 | 限制 |
|---|---|---|---|
| \`ultraHeroDamageMultiplier\` | 主角最终直接伤害（不含灵宠/环境） | 主角战斗乘区 | 最多一个同类鸿蒙倍率，不双重应用 |
| \`ultraPetDamageMultiplier\` | 宠物最终输出伤害 | 灵宠战斗乘区 | 无出战宠物则无效 |
| \`ultraCaveYieldBonusMultiplier\` | 建筑提供的正向**资源加成数值** | 洞府经济增量乘区 | 无建筑/该项为0则无增益 |
| \`ultraTechniqueEffectMultiplier\` | 已装备功法允许放大的正向效果值 | 功法效果组 | 不直接乘最终战斗/经济总数 |

### 无循环的示例

~~~text
原始战斗灵石: 100
普通遗物 +8% 灵石收益
建筑原本加成 +20%，普通遗物让建筑增益 +10% → 有效建筑加成 +22%
拥有无尽洞天珠：建筑增益分量 x3 → +66%
最终战斗收益 floor(100 * (1 + 0.08 + 0.66)) = 174

没有洞天珠时 floor(100 * (1 + 0.08 + 0.22)) = 130
不是 130 × 3，也不是 100 × 1.08 × 1.22 × 3
~~~

**功法乘区注意**：鸿蒙大道书放大功法本身效用，之后主角伤害还能受到鸿蒙开天斧加成，属有意允许的“不同部件跨体系协同”；绝不可把开天斧再算入功法本身倍率并反复套算。

## 5. 渐进式开放的事务边界

~~~text
CombatResolved(won, stageId)
 → 若首通: 记录账号 / 本世通关事件
 → 查询配置 map.mainlineIndex 得到最高普通主线深度
 → QueryUnlocks(previousDepth, newDepth, implementedPhase)
 → 对满足条件的每个featureId执行一次 unlock
 → 奖励是 ONE_free_draw 指定当世卡包资格或 unlock_only
 → 记录 claimedUnlockRewardIds 防止轮回重领
 → 输出 UnlockAnnounced 供UI展现
~~~

- 高难旧图重复刷、关卡重置、扫荡均不能冒领新系统首通奖励；
- UI 不可直接创建功法/宠物/建筑；首次免费体验如需功能物品，**发给对应卡包的一次免费抽取次数**，真正物品仍从已注册池中抽；
- 不在自动刷怪中连续弹十张“系统已开放”弹窗；多解锁事件合并为一个可稍后查看的“仙途新机缘”小抽屉；
- 只有 \`implementedPhase\` 已实际加入功能才允许开放入口，后续章节可显示“未来章节”预告但不能误触不可玩内容。

## 6. 游戏性模拟与指标

三条纯函数：

~~~ts
fight(snapshot, seed) => CombatResult
simulateCultivationRun(strategy, config, seed) => RunMetrics
simulateRelicChests(draws, seed) => MetaMetrics
~~~

**检测：**
- 首次30层无鸿蒙账号是否能稳定突破；
- 共鸣只能在常规30件毕业后累积；
- 四件鸿蒙在任何存档中不会超过1份；
- 天/仙保底最多只改变常规五档结果；
- 100/1000/5000/10000箱超稀有触发频率接近公开理论值（允许统计误差）；
- 1个抽卡事务失败不会发生部分扣费；
- 一次关卡首次解锁不能领2次免费抽卡资格；
- 已解锁功法/洞府/灵宠系统在新一世依旧可见，但当世资产重置；
- 同种子、同策略跑出来的战斗胜负、经济消耗和抽箱奖励完全一致；
- 更换装备、卸下宠物后所有相应遗物和鸿蒙加成瞬间消失而无残留；
- 出现极端鸿蒙欧皇时允许超强，但游戏绝不以这些账号的数值设置所有人的主线门槛。

## 7. 数值与版本化

- \`data/codex/codex.v0.5.json\`：源配置（34件遗物，关卡解锁、五档常规和独立鸿蒙）；原 \`codex.v0.4.json\` 原封留档。
- \`data/codex/relics.v0.5.csv\`：30常规+4鸿蒙的每层数值、上限与作用；普通遗物仍分级、鸿蒙为第六类别。
- \`data/codex/catalog.v0.5.csv\`：全局检索目录，包括关卡解锁里程碑；
- [可筛选图鉴](../codex.html)：始终在页面上标明“设计值”，不把 v0.5 配置当成实装游戏存档。
- 新配置不得覆盖 v0.1 真实存档、不默默把老三槽传承替换掉。若以后施工必须另做清晰的存档迁移/备份对照。
