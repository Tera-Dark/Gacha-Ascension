# Gacha Ascension · 系统与数据架构 v0.3

> 设计状态：待确认；当前仓库在线代码仍为 v0.1。  
> 依赖：[GDD v0.3](GDD-v0.3.md) · [GDD v0.2](GDD-v0.2.md)  
> 本文定义代码边界、数据结构、系统依赖、游戏事件及验收测试，不要求立刻全部实现。

## 1. 技术思想

**以战斗推进为核心，以各养成系统为组件，以抽卡作为统一内容获取入口，以背包作为单一资产登记服务。**

技术结构必须反映游戏设计，而不是简单建立“功法页面/宠物页面/建筑页面”后在里面继续存临时数值。

~~~text
                         App / UI 层
      首页战斗   修士   功法   洞府   灵宠   背包   天命   轮回
                              │
                    Commands / Selectors
                              │
                        Game State
                              │
 ┌───────────── 核心规则 / 纯计算层 ───────────────────────┐
 │ Combat      Exploration     Progression     Prestige │
 │ Inventory   Gacha           Equipment       Effects  │
 │ Cultivation Techniques      Cave           Pets     │
 │ Artifacts   Consumables     Balance        Unlocks  │
 └───────────────────────────────────────────────────────┘
                              │
            Config & Content / Content Registry
         enemies  zones  tiers  packs  cards  pets  buildings
                              │
                   Save / Migration / RNG
                              │
           Browser LocalStorage / future adapter
~~~

实现顺序：**数据模型 → 纯函数战斗 → 资源与升级 → 背包与卡包 → 各系统 → UI**。不要把业务规则塞进点击事件或 DOM render 函数。

## 2. 概念与实体边界

| 术语 | 唯一真实数据归属 | 其他系统能做什么 |
|---|---|---|
| 灵石、修为 | RunState.currency + CultivationState | 战斗发放，培养系统消耗 |
| 账号因果、永久成就 | MetaState | 轮回结算增发 |
| 物品所有权、消耗数量 | InventoryState | 任何系统只能请求查询/消费 |
| 功法实际修炼等级及槽位 | TechniqueState | 背包只记录拥有/重复解锁 |
| 洞府建筑位置及升级等级 | CaveState | 背包记录建筑解锁与重复上限 |
| 灵宠物种、星级/经验及出战 | PetState | 背包只存抽取凭证/重复转化，不重复一套宠物等级 |
| 法宝强化等级和装备 | ArtifactState | 背包只记录可装备资格/重复升阶 |
| 抽卡次数、保底进度 | GachaState | UI 读取而不自行记录 |
| 当前探索目标、已通关层 | ExplorationState | 战斗结算模块请求推进 |
| 属性最终值 | 纯函数 DerivedStats | **不存到存档、不被某张卡直接累加写死** |

**单一数据源**：同一属性或物品不能在两个子系统各存一份“权威”副本。例如背包只存“已解锁灵雀”，灵宠状态持有“灵雀 Lv.7、星级 2、正在出战”。UI 刷新后只从这些源数据重新计算展示。

## 3. 状态拆分：永久与本世

### 3.1 账号层 MetaState（轮回保留）

~~~ts
type MetaState = {
  fatePoints: number;
  reincarnations: number;
  highestEver: Record<string, number>;
  bestTimesMs: Record<string, number | null>;
  firstClearClaims: Record<string, true>;
  achievements: Record<string, true>;
  legacyOwned: Record<string, number>;
  legacyLoadout: string[]; // <= 3
  featureUnlocks: Record<string, true>;
}
~~~

永久进度须明确：已经领取过的**账号首通奖励**不因轮回重置而重新发放。单次轮回可以有“本世新首通”计分，但它的奖励独立且受到封顶，不能把账号首通奖励做成无限领取。

### 3.2 本世 RunState（轮回清空）

~~~ts
type RunState = {
  runId: string;
  seed: number;
  currency: { stones: number; cultivationXp: number };
  hero: {
    level: number;
    realmId: string;
    training: { attack: number; health: number; defense: number };
    foundationChoices: string[];
  };
  exploration: {
    target: { zoneId: string; difficultyId: string; floor: number };
    cleared: Record<string, number>;
    mode: 'push' | 'farm' | 'paused';
    farmTarget: { zoneId: string; difficultyId: string; floor: number } | null;
    latestResultId: string | null;
    currentRunFirstClear: Record<string, true>;
    earnedMilestones: Record<string, true>;
  };
  inventory: {
    stackables: Record<string, number>;
    ownedDefinitions: Record<string, number>; // 初次拥有=1，重复次数继续累计
  };
  technique: {
    trainedLevels: Record<string, number>;
    equippedIds: string[];
  };
  cave: {
    placements: Array<string | null>;
    buildingLevels: Record<string, number>;
  };
  pets: {
    owned: Record<string, { level: number; xp: number; stars: number; copies: number }>;
    activePetId: string | null;
  };
  artifacts: {
    trainedLevels: Record<string, number>;
    attackSlot: string | null;
    defenseSlot: string | null;
  };
  consumables: {
    activeBuffs: Array<{ buffId: string; remainingBattles: number }>;
    autoUse: Record<string, boolean>;
  };
  gacha: {
    packs: Record<string, { draws: number; pityRare: number; pityEpic: number }>;
  };
}
~~~

注意：以上为**接口候选**，实际落地时要去重；如果宠物重复数已经完整记在 PetState，就不应再同时维护 Inventory 的重复计数，两者只存**一份权威数据**。推荐：

- 除“可堆叠物品”和“简单解锁”之外，**独立系统自己管理升级型实体**；
- 抽卡统一奖励结算器根据类型将奖励投递到目标系统；
- 背包通过只读聚合查询形成全物品图鉴（不再把复杂实体完全复制存一遍）。

这解决“灵宠出现在背包一份、灵宠系统又有一份等级”的双主数据问题。

## 4. 卡包与物品定义：先有类型，再有内容

### 4.1 基础配置

~~~ts
type Rarity = 'yellow' | 'mysterious' | 'earth' | 'heaven' | 'immortal';
type RewardKind = 'technique' | 'building' | 'pet' | 'artifact' | 'consumable';
type PackId = 'techniques' | 'cave' | 'beasts' | 'artifacts' | 'pills';

type RewardDefinition = {
  id: string;
  kind: RewardKind;
  name: string;
  rarity: Rarity;
  allowedPacks: PackId[];
  effectIds: string[];
  iconKey: string;
};
type PackDefinition = {
  id: PackId;
  rarityWeightsByLevel: number[][];
  expMilestones: number[];
  priceStones: number;
  poolIds: string[];
};
~~~

数据驱动卡池，卡包 **不需要知道业务规则**；只负责从指定类别抽取定义并产生 DrawResult。

### 4.2 统一抽卡结算链（原子操作）

~~~text
TryDraw(packId, count)
  → validate unlocked / enoughStones / count allowed
  → spend stones
  → roll rarity using a seeded RNG
  → draw from exact allowed pool
  → dispatch AwardAsset(reward.kind)
       technique → unlock/raise train cap
       building → unlock/raise facility cap
       pet → unlock pet/advance duplicate progress
       artifact → unlock/raise refinement cap
       consumable → add stackable quantity
  → update this pack's draws, pity and level
  → create concise result receipts
  → persist once
~~~

**失败原子性**：中途数据出错不能出现“钱扣了却没得到卡”。“十连”应作为一个事务，连续使用单抽逻辑但一次提交结果。重复满级时补偿由卡包类型配置决定，不能意外无限刷灵石套利。

### 4.3 分类卡包的边界

| PackId | 抽取实体 | 发奖处理器 | 存档权威数据 |
|---|---|---|---|
| techniques | TechniqueDefinition | UnlockTechnique | TechniqueState |
| cave | BuildingDefinition | UnlockBuilding | CaveState |
| beasts | PetDefinition | UnlockPet/AdvancePet | PetState |
| artifacts | ArtifactDefinition | UnlockArtifact | ArtifactState |
| pills | ConsumableDefinition | AddItem | InventoryState.stackables |
| 局外传承池 | LegacyDefinition | UnlockLegacy | MetaState.legacyOwned |

“功法包、洞府包、灵宠包”绝不直接返回一个已修改过的战力数值。它们必须先产生资产，再由该资产在装配/建设/培养等系统的效果聚合过程中影响战斗。

## 5. 属性计算：单向纯函数，避免叠加污染

错误模型：抽中剑诀后执行 player.atk += 20，卸下又 player.atk -= 20，最后各种倍率不断互相污染。

正确模型：保留**基础属性**和各系统的**效果声明**，每次需要显示或战斗时重新计算。

~~~text
HeroBaseStats (levels + realm bonus + training)
   + TechniqueEffects (equipped, current training levels)
   + ArtifactEffects (equipped)
   + PetPassiveEffects (active pet)
   + CaveEffects (placed buildings)
   + ConsumableBuffs (active)
   + LegacyEffects (equipped legacy)
                       ↓
                  ResolveStats()
                       ↓
               StatsSnapshot (immutable)
                       ↓
            Combat / UI / PowerPreview
~~~

**有序增益处理**：

1. 基础三围及线性加法；
2. 同类百分比加算；
3. 有明确上限的流派组合特效；
4. 统一战斗乘区与防御处理；
5. 最后舍入和夹取合理取值。

避免浮点多次往返存档导致“换装备后属性莫名增加”。装备推荐可以计算 **before/after snapshot** 的差异，不会真正改变状态。

## 6. 战斗与关卡数据模型

### 6.1 关卡定义

~~~ts
type StageDefinition = {
  zoneId: string;
  difficultyId: string;
  floor: number;
  enemyId: string;
  type: 'normal' | 'elite' | 'guardian' | 'boss';
  difficultyScale: { attack: number; hp: number; defense: number };
  reward: { stones: number; cultivationXp: number };
  firstClearReward?: { stones?: number; cultivationXp?: number; freeDraws?: number };
  unlocks?: string[];
}
~~~

所有目标都用 zoneId + difficultyId + floor 唯一确定；不把 stage=130 这类魔法数字硬编码成“红沙地图第 30 层”。

### 6.2 战斗纯函数

~~~ts
type CombatSnapshot = {
  hero: { attack: number; hp: number; defense: number };
  pet?: { attack: number; support: number; traitId?: string };
  enemy: { attack: number; hp: number; defense: number };
  modifiers: Record<string, number>;
  seed: number;
};

type CombatResult = {
  won: boolean;
  turns: number;
  damageByHero: number;
  damageByPet: number;
  damageTaken: number;
  finalHp: number;
  reason: 'kill' | 'dead' | 'timeout';
  logEvents: Array<{ type: string; amount?: number }>;
};
~~~

**所有奖励在 CombatResult 生成后才由 ExplorationEngine 派发**。同一个结果 ID 只能领取一次，以免按钮与自动定时器同时触发重复给钱。UI 战斗动画播放快慢不能影响结算与掉落。

### 6.3 自动探索状态机

~~~text
PAUSED
  │ 开始
  ▼
PUSHING ─ 成功 ─▶ NEXT_STAGE ─▶ PUSHING
  │
  ├─ 失败 ─▶ BLOCKED ─▶ FARMING(已通关最高效率层)
  │                               │
  └─ 指定扫荡 ───────────────────▶ FARMING
                                  │
                 检测到实际战力提升 ─▶ 可主动 Retry
                                  │
                 玩家再次冲层 ─────▶ PUSHING
~~~

玩家解锁下一关时必须获得明确反馈；卡关转扫荡不该反复播放“挑战失败”提示，扫荡页面展示灵石/分钟、修为/分钟和预计下次升级时间。

### 6.4 统一关卡难度及效率

- 难度修正来自配置，而非客户端每次随机临时增加 10%；
- Boss/精英有少数固定特征，持续同一敌人模板方便玩家针对性练功；
- 首通奖励只在 run 首次与 account 首次两套独立标记中结算；
- 常规刷图奖励仅灵石 + 修为；
- 纪录和局外评分由里程碑计算，重刷同一旧关无额外评分；
- 首次解锁下一境域的入口要求单独配置，不通过 UI 文本猜测。

## 7. 事件与命令（不是任意全局事件总线）

**Command 表示玩家意图，先验证才改变状态：**

~~~text
StartExploration
ChooseFarmTarget
RetryCurrentStage
SpendStonesOnHeroTraining
TrainTechnique
EquipTechnique
PlaceBuilding
UpgradeBuilding
ActivatePet
TrainPet
EquipArtifact
UseConsumable
DrawPack
BreakthroughRealm
Reincarnate
DrawLegacy
~~~

内部事件用于更新依赖数据与埋点：

~~~text
BattleResolved
StageFirstCleared
BossDefeated
CultivationLeveled
RealmBreakthroughCompleted
CardDrawn
AssetAwarded
ItemConsumed
BuildPlaced
PetLeveled
RunReincarnated
~~~

统一 reducer/service 处理事务，不允许 UI 按钮直接写全局 state。事件日志有大小上限，存档仅存必要进度，详细动画日志临时生成。

### UI 与系统之间的边界

- UI 调用 command、读取 selector（例如 getRecommendedFarmStage）。
- 业务引擎返回新的 state 与事件。
- UI 消费事件播放音效/视觉反馈。
- UI 无权发资源，奖励逻辑不可存在 onclick 中。
- 新系统上线只需新增模块、内容定义和对应 UI，不需改完所有其它系统组件。

## 8. 用户界面导航是系统投影，而不是系统本身

竖屏主布局参考：

~~~text
┌──────────────────────────────┐
│ 境界 / 灵石 / 修为 / 因果     │
│ 当前目标：第30关赤砂炎蟒     │
├──────────────────────────────┤
│                              │
│       自动战斗舞台           │
│  主角 + 1灵宠   vs  妖兽     │
│  血条/伤害/胜负/掉落反馈     │
│                              │
│ 冲层 ↔ 扫荡   当前难度       │
│ 本次收益：灵石/修为          │
├──────────────────────────────┤
│ 再强化一次可达成的成长目标   │
│ [修炼]  [抽卡]  [挑战Boss]   │
├──────────────────────────────┤
│ 仙途   修炼   养成   天命    │
└──────────────────────────────┘
~~~

- “养成”二级页：功法 / 洞府 / 灵宠 / 法宝 / 背包；
- “修炼”页：境界、三向强化、突破；
- “天命”页：按已解锁系统的卡包分类；未解锁包仍有简洁提示；
- 始终有直达仙途的按钮，不要求每次回来走 3 级菜单；
- 不因每解锁一个系统就给底部导航栏塞一个新图标；
- 视觉风格与内容美术在玩法验证后迭代，当前先确保点击区、弹层、详情可用。

## 9. 存档与轮回安全

~~~ts
type SaveRoot = {
  schemaVersion: 3;
  savedAt: string;
  meta: MetaState;
  run: RunState;
  settings: { autoBattle: boolean; fastMode: boolean; lowMotion: boolean };
}
~~~

约束：

1. 版本迁移只能向前，不覆盖未知新版本。
2. 轮回是**事务**：先核算 + 发因果至 MetaState，再以带入传承创建全新 RunState，然后保存。
3. 不在“新本世创建完毕但因果还没加”的中间状态写盘。
4. 对初版 v0.1 本地存档，**不要静默覆写**。待用户同意后提供“开始 v0.3 新档 / 保留旧档备份”的迁移策略。
5. 属性快照、可缓存收入、页面选择不保存为权威数据；重载后重新派生。
6. 每次消耗与奖励均有限额检查；禁止负灵石、负库存、已消耗再次领取和同一抽卡交易重复提交。

## 10. 可选商业化接口（先预留，绝不先接广告）

未来可提供 RewardProvider 适配层，只能在用户明确触发且广告平台回调确认后发放奖励：

- 一次**限额的指定卡包免费抽取**；
- 一次**有限的扫荡灵石/修为加成**（不能锁死正常自动探索）；
- 本次轮回**少量额外因果点**（设上限，不能重复领取）。

不可做：抽到首只灵宠必须看广告；正常探索锁视频；无限观看即可冲破所有战力上限；广告回调关闭之前提前发奖励。

TapTap 广告接口类型存在产品形态差异，真实接入时依据实际选择的发行通道适配：  
- 小游戏广告概览：https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/ad/  
- 激励视频 API：https://developer.taptap.cn/minigameapidoc/dev/tutorial/open-capabilities/ad/rewarded-video-ad/  
- H5 / Tap 小游戏 / APK 的不同接入说明：https://developer.taptap.cn/minigameapidoc/quick-start/mcp-guide/ad-integration-guide/

## 11. 数值模拟和自动验收

### 11.1 纯模拟：不启动浏览器也能跑

模拟种子固定，可回放；策略至少 6 种：

1. 不抽卡、均衡练功：能否打过第一守关？
2. 只抽功法、很少练功：初期是否更慢/更不稳定？
3. 投资洞府优先：中期是否通过资源回本赶上？
4. 灵宠优先：改变输出/生存短板，是否形成可见差异？
5. 极端非酋：随机卡抽到低阶仍不致主线死锁？
6. 极端欧皇：稀有卡加速而不是瞬间跳完所有内容？

### 11.2 关键不变量

~~~text
每次抽卡扣款 = 所选卡包单价 × 次数
十连扣款与抽数 = 10 × 单抽 (使用同一保底累计)
总抽卡回报一定来自注册过的物品定义
RewardKind 一定有对应的发奖处理器
单个战斗结算 ID 只能发放一次奖励
首通奖励不能重复领取
轮回只保留 MetaState 所列的账号资源
未携带灵宠可以打怪，不会报错
没有装配功法也可以打普通怪
装备/卸下连续切换不增加/减少总资产
属性计算与 UI 刷新次数无关
挂机停止时不额外发奖励
模拟同种子+同策略得到相同结果
任意事件都不能使灵石或背包数量为负
~~~

### 11.3 长期体验指标

| 指标 | 测量意图 |
|---|---|
| 第一次升级/首次强化时间 | 早期是否过于空 |
| 首次第10/20/30关耗时 | 主要推进的体验节奏 |
| 单次战斗平均耗时 | 连续击杀是否爽快 |
| 主角/功法/灵宠伤害占比 | 各系统是否真的有作用 |
| 地图失败后到下一次突破的时间 | 是否卡住无法改善 |
| 灵石收入与强化/抽卡/洞府投入分配 | 哪些系统被废弃或过强 |
| 洞府建设实际回本时间 | 经济投资是否有合理窗口 |
| 重复抽卡有效升级比率 | 抽包价值是否迅速枯竭 |
| 主动轮回时机与下一世前15分钟 | 轮回是否产生清晰价值 |

建议本地开发埋点，无服务器收集。后续正式上线采集统计要单独审查玩家告知和隐私要求。

## 12. 实施顺序与过关门槛

| 里程碑 | 做什么 | 验收门槛 |
|---|---|---|
| M0 | 内容注册、Run/Meta、战斗纯函数、状态事件 | 模拟可持续闯关，不负资源，无隐藏状态漂移 |
| M1 | 修炼/突破 + 一张 30 关普通图 + 冲层扫荡 | 关卡通关、卡关转刷、首次境界突破可完整跑通 |
| M2 | 背包账本 + 功法/洞府 + 分类抽取 | 从抽卡到装配/建设/升级均可验证 |
| M3 | 灵宠实际参战 + 经验/同种升星 | 宠物伤害/保护能在战报独立量化 |
| M4 | 高难重闯、效率纪录、轮回评分与传承 | 开启下一世后成长缩短旧瓶颈时间 |
| M5 | 法宝/丹药 + 新境域 | 经济系统没有单一路线压制全部策略 |
| M6 | UI/UX、素材、发布与自愿广告 | 手机完整交互测试、广告失败不影响战斗 |

**这版先审玩法与技术框架，不自动执行 M0–M6。**

---

## 开发实施决策

1. 以 **GDD v0.3** 作为最新设计方向，以 **architecture v0.3** 作为目标模块职责。
2. 当前 v0.1 Pages 是旧原型，不按 v0.3 文档宣称已实现。
3. 重构时先独立数据/引擎，再由旧前端平滑替换 UI。
4. 第一阶段只验证战斗 → 修为 → 强化 → Boss → 突破，不用内容数量冒充可玩性。
