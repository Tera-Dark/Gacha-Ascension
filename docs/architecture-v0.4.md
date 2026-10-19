# 抽卡修仙传 · 技术与数值架构 v0.4

> 最新目标技术架构（设计待确认，未改线上代码）。关联：[总体 GDD v0.4](GDD-v0.4.md) · [天命遗物系统](tianming-relics-v0.4.md) · [总图鉴](CODEX.md)

## 1. 领域边界与依赖方向

~~~text
                  游戏 UI / Codex Viewer
                           │
                     Commands / Queries
                           │
                       Game Services
              ┌────────────┼────────────┐
              │            │            │
       Combat/Explore   Run Growth   Meta/Relics
              │            │            │
           StageBook    Cultivation   RelicChest
              │            │            │
              └────────────┼────────────┘
                           │
                  Inventory / Reward
                           │
             Technique / Cave / Pet / Artifacts
                           │
                     EffectResolver
                           │
                  Immutable StatSnapshot
                           │
                        Persistence
                      Meta + Run
~~~

**各系统只依赖稳定数据协议和 Selector/Command；不得互相写入内部状态。** 尤其不能存在 \`onDraw() { hero.attack += 8 }\` 这样的即时写属性逻辑。画面战斗动画只消费结算日志，不能凭动画帧触发发奖。

## 2. 数据所有权与配置

| 域 | 唯一权威状态 | 获取其它系统信息的方法 |
|---|---|---|
| 修士/境界 | run.hero（等级、基础三围训练、突破记录） | 读取状态和永久 RelicEffectSnapshot |
| 战斗与关卡 | run.exploration（当前目标、已通关层、首通标记、最新结算） | 读取全部战斗快照，返回 CombatResult |
| 统一物品 | run.inventory.stackables（仅消耗品） | 合成只读背包索引，不重复存复杂实体 |
| 功法 | run.techniques（已解锁功法、训练等级、装配） | 从定义仓库取功法效果 |
| 洞府 | run.cave（建造位置、建筑等级、已解锁资格） | 从定义仓库取产量增益 |
| 灵宠 | run.pets（所有权、经验、星级、出战 id） | 出战宠状态入战斗快照 |
| 法宝 | run.artifacts（解锁、升级、装备） | 读取定义及装备效果 |
| 当世抽卡 | run.gacha（每包经验、保底、累计抽数） | 消费灵石并向各子系统派发资产 |
| 局外因果与遗物 | meta.relics（数量、保底、抽取计数） | 通过纯函数 resolveRelicEffects 计算加成 |
| 历史纪录/解锁 | meta.records | 首通比较与展示 |
| 内容定义 | data/codex/codex.v0.4.json | 不在运行期动态覆盖配置 |
| 统一属性快照 | 不存档，纯计算派生 | 训练/装备/宠物变化后重新计算 |

## 3. 独立存档：MetaState / RunState

~~~ts
type RelicRarity = 'huang' | 'xuan' | 'di' | 'tian' | 'xian';

type RelicRecord = {
  id: string;
  effectKey: string;
  rarity: RelicRarity;
  valuePerStack: number;       // percent units stored as percentage points
  unit: '%' | '点';
  maxStacks: number;
};

type MetaState = {
  fatePoints: number;
  reincarnations: number;
  relics: {
    copies: Record<string, number>;
    totalDraws: number;
    sinceHeaven: number;
    sinceImmortal: number;
  };
  records: {
    bestMainStage: number;
    highDifficultyHighest: Record<string, number>;
    personalBestMs: Record<string, number>;
    accountFirstClearClaims: Record<string, true>;
  };
  flags: Record<string, boolean>;
};

type RunState = {
  runId: string;
  stones: number;
  cultivationXp: number;
  hero: {
    realmId: string;
    level: number;
    training: { attack: number; hp: number; defense: number };
    foundations: string[];
    realmBonusAlreadyApplied: Record<string, { atk: number; hp: number; def: number }>;
  };
  exploration: {
    targetStageId: string;
    mode: 'push' | 'farm' | 'paused';
    clearedStages: Record<string, true>;
    runFirstClearClaims: Record<string, true>;
    awardedCombatIds: Record<string, true>;
  };
  inventory: { stackables: Record<string, number> };
  techniques: { owned: Record<string, { copies: number; trainedLevel: number }>; equipped: string[] };
  cave: { owned: Record<string, { copies: number; trainedLevel: number }>; slots: Array<string | null> };
  pets: { owned: Record<string, { copies: number; stars: number; xp: number; level: number }>; activeId: string | null };
  artifacts: { owned: Record<string, { copies: number; trainedLevel: number }>; offensiveId: string | null; defensiveId: string | null };
  consumables: { buffs: Array<{ id: string; remainingBattles: number }> };
  gacha: { packs: Record<string, { draws: number; exp: number; pity: Record<string, number> }> };
};

type SaveRoot = { schemaVersion: 4; meta: MetaState; run: RunState; settings: Record<string, unknown> };
~~~

遗物**不占装备槽**，保存已拥有的 \`copies\`，无需 \`relicEquipped\` 属性。v0.3 的 \`legacyLoadout\` 不再属于 v0.4 目标模型。

## 4. 统一奖品派发与事务

### 4.1 局内包

~~~text
DrawRunPack(packId, count, txnId)
→ 检查已解锁且灵石余额足够
→ 使用该包等级/概率/保底进行 count 次抽取
→ 依据 RewardKind 派发到 Technique / Cave / Pets / Artifacts / Inventory
→ 同一事务扣灵石、存入拥有量与 pity、保存
→ 返回 DrawReceipts 给 UI 播放开箱动画
~~~

### 4.2 天命遗物匣（不同入口，同一事务工具）

~~~text
OpenRelicChest(count, txnId)
→ assert count in [1,10]
→ assert fatePoints >= 40 * count
→ assert any relic not capped
→ for each opening:
   available = relics.filter(ownedCopies < maxStacks)
   apply immortal pity if eligible and sinceImmortal >= 59
   else apply heaven-or-above pity if eligible and sinceHeaven >= 19
   else filter tier weights by available and normalize to 100%
   tier = roll with deterministic seeded RNG
   relic = uniformly select available item in tier
   copies[relic.id] += 1
   update sinceHeaven and sinceImmortal based on awarded rarity
 → commit state with fatePoints - 40 * count and records/pity once
 → return list of RelicAwarded receipts
~~~

**注意：临近全毕业时十连可能抽到第 8 件后就全池毕业，剩余第 9、第 10 次无法完成。此时要在提交前检测剩余可获得的遗物层数 ≥ count**，否则必须拒绝十连（UI 显示可以单抽），而不能先扣10抽只给8件。

其它原子性：
- 重复同一 \`txnId\` 只返回已有结果，不能再次扣款；
- 同一次抽卡结束后再写盘，不允许中途引发 UI 或存档回调；
- 若任何配置找不到或效果定义未注册，全事务失败，退回原状态；
- 记录近期收据方便审计，但不要无限存详细历史造成存档膨胀；
- 十连分开逐次调用抽取规则但一次支付和一次保存，等价于 10 次单抽的随机结果和保底推进。

## 5. 效果层（Effect Resolver）

### 5.1 契约

~~~ts
type EffectSnapshot = {
  flat: { atk: number; hp: number; def: number };
  hero: { attackPct: number; hpPct: number; defensePct: number; allBaseStatsPct: number };
  combat: { bossDamagePct: number; armorPenPct: number; damageReductionPct: number };
  economy: { stoneGainPct: number; cultivationGainPct: number; allResourceGainPct: number; caveYieldPct: number; trainingCostReductionPct: number };
  modules: { petDamagePct: number; petExpGainPct: number; petFirstTurnShieldPct: number; techniqueEffectPct: number; runPackExpGainPct: number; breakthroughBonusPct: number };
};

function resolveRelicEffects(meta: MetaState, relicDefinitions: RelicRecord[]): EffectSnapshot;
function resolveHeroStats(run: RunState, meta: MetaState, content: Catalog): HeroStatSnapshot;
function resolveCombatSnapshot(run: RunState, meta: MetaState, stage: StageDefinition): CombatSnapshot;
~~~

同 \`effectKey\` 的 \`copies * valuePerStack\` **相加**，不是复乘。效果快照可以缓存但缓存 key 必须包含 \`meta.relics.copies\` 与当前 run 培养内容的版本值。不能把派生加成写回 \`hero.atk\` 然后每次刷新再叠一次。

### 5.2 属性计算顺序（可用下面的财产例测试）

1. 角色当前升级/训练/突破的纯基础三围；
2. 累加遗物固定三围；
3. 应用遗物 \`allBaseStatsPct\`；
4. 应用遗物与当世系统同类百分比；
5. 构成功法/法宝/灵宠的战斗表现与战斗局部 buff；
6. 结算防御穿透、Boss 伤害增幅、护盾、减伤；
7. 正常战斗收益与资源类遗物/洞府组成**同一加法组**，最后舍入。

示例：

~~~text
baseStone = 100
relic.stoneGainPct = 8
relic.allResourceGainPct = 4
cave building normalStoneBonus = 20
relic.caveYieldPct = 9

effectiveCaveBonus = 20 * (1 + 9/100) = 21.8
stoneReward = floor(100*(1+(8+4+21.8)/100)) = 133
~~~

- \`caveYieldPct\` 不得再乘整个 133 的最终收入；
- 资源仅常规战斗掉落享受收益加成，Boss 首通固定礼包 / 因果评分不吃收益倍率；
- \`runPackExpGainPct\` 只改变局内五包的经验积累，不改变永久天命匣品质、保底或价格；
- 境界突破加成只在事件发生时结算出一个确定的增量写入 \`realmBonusAlreadyApplied\`，重新加载存档不能再次补同一突破；
- \`trainingCostReductionPct\` 需要在最终成本处统一限幅和取整，不能打负折扣。

### 5.3 全局帽（候选）

| 属性 | 全局硬帽 | 为什么 |
|---|---:|---|
| 破甲有效百分比 | 60% | 避免防御完全失去意义 |
| 受伤减免 | 60% | 防止战斗几乎无伤 |
| 修士强化折扣 | 60% | 避免免费强化和循环套利 |
| 宠物首回合护盾 | 主角最大气血的 35% | 避免首回合无限护盾 |
| 单次伤害下限 | 1 | 防止无法结束战斗的零伤害 |
| 轮回因果加成 | 0%（禁止遗物影响） | 防止遗物无限复利因果 |

所有百分比来源应在同一效果组相加后做 \`clamp\`。新数值类别进入时必须声明是否接受硬帽，而不是默认暴涨倍率。

## 6. 内容定义注册表（Codex）

所有定义必须有稳定 ID；最新候选统一存在：

- \`data/codex/codex.v0.4.json\`：可被前端和测试读取的实体；
- \`data/codex/relics.v0.4.csv\`：30 遗物数值；
- \`data/codex/catalog.v0.4.csv\`：110 条目全量索引；
- \`data/codex/prototypes.v0.4.csv\`、\`enemies.v0.4.csv\`、\`stages.v0.4.csv\`：拆分子图鉴；
- \`docs/CODEX.md\`：人工速查。

后续有任何数值变动都应按 \`codex.v0.4.json\` 的结构在新版本目录中修改，并用脚本再生成 CSV 与 Markdown，防止手工同步错位。**不得让 v0.4 提案数据自动覆盖 v0.1 线上已使用的卡牌定义或存档**。

## 7. 数值平衡与全库验证

### 7.1 静态检查

- 30 遗物 ID 无重复；五种品质合法，每件 \`maxStacks > 0\`；
- 每件 \`valuePerStack > 0\`，每个 \`effectKey\` 都在 Resolver 注册；
- \`maxRawValue == valuePerStack * maxStacks\`；
- 30 关敌人引用存在且关卡 ID 不冲突；
- 功法/洞府/宠物等每个样卡 \`id\` 唯一，\`rarity\` 不越界；
- 基础品质权重合计 100%、所有属性和奖励不为负；
- CSV 数量、字段与 JSON 同步。

### 7.2 抽箱运行期单元测试

- 仙阶强保底优先于天阶强保底，第 60 抽必出仙阶（有仙阶时）；
- 天阶保底第 20 抽给至少天阶（有天/仙时）；
- 遗物满级后绝不再被抽到；
- 所有稀有度都毕业时不可继续扣因果；
- 接近毕业的十连若剩余层数不足，直接拒绝而非丢掉部分奖励；
- 十连与按顺序10个单抽概率一致且 \`pity\` 一致；
- 轮回后完整保留永久遗物/因果和历史记录；
- 0 出战宠物时，宠物类 relic 数值静态存在但不参与战斗，避免意外提高主角战力。

### 7.3 长期策略模拟

固定 seed 的 10,000 人路径：
- 全投主角/全抽功法/洞府优先/灵宠优先/混合投资；
- 未获高阶遗物至天阶保底/仙阶保底的玩家；
- 遗物库 0/30/60/90/100% 完成度；
- 第一世、第10世、第30世等跨轮回记录。

关键目标：局外遗物提升第二世起步和长期效率，但不能让“升级主角、培养灵宠、练功、建洞府”全部变成无意义的按钮。配置数值需通过模拟后再转 \`implemented\`。

## 8. 发布与可维护性

建议代码结构：

~~~text
src/
  core/                 # reducer, commands, effects, RNG, transaction
  gameplay/             # combat, exploration, stage progress, realm
  subsystems/           # techniques, cave, pets, artifacts, consumables
  gacha/                # five run packs + relic chest
  meta/                 # prestige, global relics, records
  content/              # versioned codex loader
  storage/              # save schema, migrations, backups
  ui/                   # mobile-first, pure selectors
tests/
  combat/ progression/ gacha/ relics/ migration/ balance/
docs/
  GDD-v0.4.md
  tianming-relics-v0.4.md
  CODEX.md
data/codex/
  codex.v0.4.json
  catalog.v0.4.csv
  relics.v0.4.csv
~~~

静态 Pages 原型依然可行；未来选择框架时以“纯引擎可测、可独立平衡模拟、能静态部署”为第一目标，而不是为了 React/Vue 技术栈本身重写。

**对当前仓库的变更范围**：目前仅做文档和离线数据图鉴，不更改 \`index.html\` 或既有存档。下一轮如用户批准开发，再按 M0→M4 的顺序重构。
