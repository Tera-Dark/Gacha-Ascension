> **实现覆盖规则：本文件的架构职责约束继续有效，但如果与 [v0.6 抽卡驱动核心](GDD-v0.6-core.md) 冲突，必须以 v0.6 为准。尤其删除任何 TRAIN_HERO / 灵石直接加属性的正式接口设计，能力和修为上限由对应卡包负责。**

# Gacha Ascension · 开发实施契约 v0.5（开工前冻结基线）

> **状态：开发接口约定 / 游戏尚未施工。** 本文件优先于较旧、存在冲突的 v0.2～v0.4 文字说明。  
> 入口：[GDD v0.5](GDD-v0.5.md) · [玩法节奏](progression-v0.5.md) · [遗物规则](tianming-relics-v0.5.md) · [数值数据](../data/codex/codex.v0.5.json) · [审计报告](PREDEV-AUDIT-v0.5.md)

## 0. 交付定义：开发的是一个可持续游玩的最小闭环

用户能连续自动战斗 → 能得到修为和灵石 → 提升主角攻/血/防 → 抽到功法/洞府/灵宠并培养 → 解决一次真实Boss属性门槛 → 完成筑基突破 → 自选轮回领取因果 → 开到普通天命遗物 → 下一世实际推进更快。

**开发先做功能闭环和数值模拟，不要一次性填满128/137个条目。** 把游戏 P0、后续内容 P1/P2 与软件开发 M0～M4 严格区分：

- **P0 (玩法首个完整可测版本)**：青云普通30层、主角/功法/洞府/灵宠、首个突破、轮回和最少可测试的普通永久遗物箱。鸿蒙机制在引擎中遵守0.01%独立追加和唯一性；UI可以先只显示图鉴条目，不要求做完整稀有动画。
- **P1**：青云险境、赤砂/沧溟普通、法宝、丹药、专项流派等；以已有账号首次通关历史激活新系统，不重打旧剧情。
- **P2**：100层之后的拓展、更多高难挑战、称号系统；没有真实玩法内容不得放空菜单。

### P0 不可被砍掉的功能

**首次轮回和永久成长必须跑通**，否则只能证明打怪和临时强化，不足以评价这款轮回肉鸽的真正乐趣。M0～M2 内部调试可以先使用 8～12 件普通遗物作为**测试假池**；但 M3 首次公开开放正式天命箱时必须接入现行配置中的 30 件常规遗物和 4 件鸿蒙异宝，四件鸿蒙对应的功法/洞府/灵宠/主角效果也必须可结算并公示概率。测试假池不能直接发布，更不能让玩家抽到尚未实现的奖励。

## 1. 五个数据领域（谁拥有数据谁负责写入）

| 领域 | 唯一权威 | 允许其它模块做什么 |
|---|---|---|
| **Meta（账号）** | 已开放功能、永久记录、因果、永久遗物、鸿蒙拥有量、常规保底、账号免费抽卡资格 | 读取，只能通过 meta/service 的 command 更改 |
| **Run（本世）** | 灵石、修为、角色训练、境界、当世已通关、临时卡藏/建筑/宠物、局内卡包等级 | 战斗/养成经审核过的 command 更改 |
| **Catalog（静态定义）** | 关卡、敌人、卡包、稀有度、效果、解锁条件、内容阶段 | 只读，不因抽卡改变原始定义 |
| **Derived（派生快照）** | 不保存，仅依据 Meta/Run/Catalog 计算最终属性、战斗输出和经济产出 | UI、战斗、预览读取，无权反向写存档 |
| **Presentation（界面/动画）** | 临时展示页、日志、小数值变化、动画进度 | 通过 commands 请求操作；绝不能发奖或修改角色属性 |

**同一份实体的所有权只有一处。** 例如 \`pets\` 持有灵宠经验星级，背包只能查询聚合图鉴；\`techniques\` 持有功法训练等级，\`inventory\` 只存丹药等可叠加消耗品。未来的宗门/命格/灵根系统按同一规则扩展，杜绝背包与子系统重复存级数。

## 2. 未来增加内容所需的最小六步

加入新系统（例如宗门、道侣、命格、炼丹）只需遵循清单：

1. 注册唯一稳定 \`kind\` 和 \`id\` 命名空间，补充 Definition 与等级成长配置；新增物品定义必须在 \`data/codex/codex.v0.5.json\` 的下一版 schema 中显式声明。
2. 在 Run 或 Meta 中定义**唯一权威状态**及轮回是否保留；是否可重复、上限、资源消耗均以内容表定义。
3. 新增可单测的 \`commands\`、\`selectors\` 和 RewardKind 奖励结算处理器；无处理器的卡包**不得开放抽取**。
4. 在 \`EffectResolver\` 注册合法增益 key、顺序与硬上限；不能在抽卡回调里直接 \`hero.attack += n\`。
5. 定义一个 \`featureId\`、可重试解锁事件、前置条件、版本开关；解锁之后必须能在60秒内体验实际功能。
6. 增加存档迁移/平衡测试/图鉴行与手机页，运行 CI。**现有战斗逻辑无需因增加一张宠物卡而大幅修改。**

可以增加卡内容而不新增 subsystem；只有玩法拥有独立升级/装配状态时才创建新模块，避免拆太细。

## 3. 系统服务接口（建议 TypeScript）

~~~ts
interface CommandResult<T> {
  state: GameSave;
  events: GameEvent[];
  result: T;
}
interface GameSave {
  schemaVersion: number;
  dataVersion: string;
  meta: MetaState;
  run: RunState;
  settings: UserSettings;
}
interface BattleResult {
  battleId: string;
  won: boolean;
  turns: number;
  heroDamage: number;
  petDamage: number;
  damageTaken: number;
  rewards: { stones: number; cultivationXp: number };
  firstClear: boolean;
}
type GameCommand =
  | { type: 'BATTLE'; stageId: string; txnId: string }
  | { type: 'TRAIN_HERO'; stat: 'attack'|'hp'|'defense'; txnId: string }
  | { type: 'DRAW_RUN_PACK'; packId: string; count: 1|10; txnId: string }
  | { type: 'EQUIP_TECHNIQUE'; techniqueId: string }
  | { type: 'UPGRADE_CAVE'; buildingId: string; txnId: string }
  | { type: 'TRAIN_PET'; petId: string; txnId: string }
  | { type: 'BREAKTHROUGH_REALM'; realmId: string; txnId: string }
  | { type: 'REINCARNATE'; txnId: string }
  | { type: 'OPEN_FATE_CHEST'; count: 1|10; txnId: string };
~~~

所有**花费、发奖、首通、轮回**必须原子处理。重放已提交的 \`txnId\`，只返回原有结果，不重复消耗或奖励；随机结果要在事务内产生且由持久 RNG seed 决定。存档写入失败时必须保证用户不会在内存里产生不可恢复的双扣状态。

### v0.1迁移

- 旧本地键 \`gacha-ascension-mvp-v1\` 必须保留备份；v0.5 新 schema 使用新的命名空间。
- 旧档可能缺少功法训练上限、主线globalDepth、洞府实体、鸿蒙、保底、个人纪录等，不允许直接把 v0.1 JSON 当成新结构。
- UI 提供「开启 v0.5 新档」与「保留旧档」清晰说明；若未来必须迁移，先制定字段映射和可回滚测试，**不做隐性清空**。
- 静态 GitHub Pages 可先用本地存档，明确提示清理浏览器数据会丢进度；联网存档需单独权限、隐私及产品设计。

## 4. 关卡标识、成长与玩法解锁契约

### 唯一标识

- \`zoneId + difficultyId + floor\` 才是战斗关唯一定位；
- 普通主线使用 \`stage.mainlineIndex\`（P0青云1～30，P1赤砂31～60，沧溟61～90）做**账号首次通关进度**；
- \`zones\` 是独立地图注册表，已经规划五个境域，但只有 \`ZN-001\` 普通30层具备示例敌人；未实装的地图不准显示可挑战；
- 高难首通独立记录，不得把高难第30层当主线第60层触发另一张图解锁；
- 初始探索 \`account_created\` 时即打开（主线深度0），**绝不要求“打赢第一关才能解锁打怪”**。

### 不同事件（严格区分）

| 事件 | 可解锁的东西 | 何时触发 |
|---|---|---|
| \`account_created\` | 自动探索、等级 | 建立账号时一次 |
| \`first_mainline_clear\` | 第3层淬炼、第6层功法、第10层洞府、第15层灵宠、第30层轮回/突破资格等 | 首次赢得指定普通主线关卡 |
| \`first_reincarnation_completed\` | 天命遗物箱 | 玩家确实结算轮回成功，因果已入账 |
| \`first_realm_breakthrough\` | 赤砂普通（若该地图已发布） | 修为足够且满足30层Boss，主动点击突破成功 |

- 第30层普通主线首通之后，**轮回可以选择，但境界突破不是自动执行**；若仍不够修为继续刷基础资源。
- **险境**：第30层首通且P1区域确实上线；不阻止去下一张普通主线。
- **赤砂普通**：前一区域普通第30层已完成、角色已筑基、P1地图确实上线。
- **天命箱**：首次成功轮回后开启，之后每一世可用因果点消费；没有反复首次解锁奖励。
- **已解锁系统永久保留入口**，但轮回后功法/灵宠/洞府的本世资产仍重置。

### 首次解锁礼包

第6/10/15层送对应卡包一次**免费抽取资格**，它不是直接掉出一张道具；消耗资格后仍走该包正式抽奖、获奖入账流程。该资格保存在 Meta 的 \`pendingFreeDraws[packId]\` 中，未使用时跨轮回保留。**每个解锁事件每账号最多领取一次**，新一世绝不重发。首次免费抽到的黄阶内容应有确切可用的基础效果，首个系统开放时必要的建造/培养起步灵石必须能在本区域正常获取。

### 升级与奖励死锁保护

- 完成Boss判定不能依赖尚未获得的突破资格；必须能用主角修炼和已开放功能突破前一关。
- 修为超过当前小境界上限可累计到合理缓存上限，突破不会丢失全部辛苦获取的经验。
- 最低每场伤害至少1，设回合上限，必须能通过确认某次强化改善输出或存活。
- 任何进入过的区域，卡关都可以扫荡之前已通关的怪获取修为/灵石；不能出现无战斗可打、无钱可赚、也不能轮回的软锁死。
- 战斗首通奖励与普通重复击杀奖励分开记录，重复 Boss 不能重复拿首次礼包、账号首次成就或越刷越多因果。
- 轮回收益仅看本世有效最大推进/境界等**有限里程碑**，不计同一个关卡的无限重复击杀。

## 5. 战斗与经济：需要可模拟、可解释

### 战斗引擎固定约定

- **输入**是纯快照：主角最终攻血防、已装功法/法宝效果、1只可选出战宠物、敌人攻血防、关卡条件、随机种子；
- **输出**是纯 \`BattleResult\`，不直接发资源或写存档；
- 默认规则 \`damage = max(1, floor(atk * 100 / (100+effectiveDef)))\`；破甲作用在 \`effectiveDef\`，减伤独立计算并按全局上限截断；
- 主角→灵宠辅助→敌人反击的交锋顺序须固定，交锋上限由配置定义；任何一方 HP<=0 或达到上限立即结束；
- 灵宠可为空，不能因为没有抽到灵宠导致战斗判定出错；
- 只有 \`ExplorationService\` 在一次成功且未发过奖的 \`BattleResult\` 之后发灵石、修为、首通经验/抽取资格；
- 推荐综合战力只用于 UI，胜负绝不比较两个总战力单值；
- 战斗动画快慢不能改变战斗结果和资源（Fast/Normal动画读取同一结果）。

### 经济契约

- 普通战斗反复掉落：**灵石、修为**；功能卡牌从对应卡包获取。
- 灵石稳定出口：主角练功、功法修炼、灵宠培养、洞府建设、功能包；总成本不可为负。
- 洞府增益只放大战斗结算的**资源增益部分**，不能变成自动发因果的复利机制。
- 因果只来自轮回有效评分；鸿蒙异宝和常规遗物都不能给永久遗物匣掉率、因果获取率添加暗藏乘区。
- 战斗结算/属性合成不得发生NaN/Infinity；对异常配置拒绝执行并提示开发错误。

## 6. 天命箱：精确算法与终局合法性

1. 未达到有效轮回并开启天命箱前，不允许消费因果。
2. 40因果/箱；常规五阶遗物有20抽天+、60抽仙阶保底，毕业档权重只在**当前可抽常规物品中**重归一化。
3. 每箱独立额外判定一次鸿蒙 \`p=0.0001\`，无软保底无强保底；成功后从未拥有的四件中抽一件，**与常规结果同时发放**。
4. 如果普通30件全满，普通部分发 \`resonance+1\`，每25箱+1共鸣等级，最多100级（最多新增基础三围+10%）；鸿蒙独立roll仍在。
5. 如果普通全部满级、共鸣100级、四件鸿蒙也全收齐 → **禁止开箱**，不扣因果。
6. 若普通全满且共鸣也满，仍有未拥有鸿蒙，UI必须提醒“只为0.01%掉落机会开箱，无其它数值收益”；严禁显示旧常规天/仙保底倒计时。
7. 单抽10次与十连1次应在同 seed 下结算完全相同的奖品序列和因果消耗；一箱中奖后未获得鸿蒙的列表变化必须在下一箱立即生效。
8. 抽到鸿蒙其效果来自 \`EffectResolver\`，不可在领奖那一刻直接写死进主角当前属性；没有装配功法、洞府或灵宠时对应鸿蒙效果可以暂不生效。
9. 所有天命遗物数值仅作为提案，必须通过独立概率模拟与多世平衡测试，不能把“0.01%有机会”错误写成“10000次必得”。

## 7. 扩展性和性能的硬约束

### 游戏模块最小结构

~~~text
src/
  core/          state, commands, transaction, rng, effect-resolver
  content/       loaders, typed registries, schema validation
  combat/        battle resolver, stage config, battle receipt
  progression/   hero training, breakthrough, region unlock, milestones
  domains/       inventory, techniques, cave, pets, artifacts, consumables
  gacha/         run pack and meta chest (different currencies/rules)
  prestige/      run score, reincarnation, relic permanent modifiers
  storage/       local save schema, migration, backups
  ui/            mobile views and readonly selectors
tests/
  unit/ integration/ balance/ migration/
data/codex/      one source JSON + generated CSV/Markdown reference
~~~

既不要求初版建立几十个无逻辑的空目录，也不允许继续把所有游戏规则堆进 \`index.html\` 的一个 IIFE。建议 TypeScript、轻量 Vite 静态构建；发布 GitHub Pages 要配置正确的项目子路径 \`/Gacha-Ascension/\`，数据/资源 URL 使用路径安全方式，不能因为刷新页面或二级页面引发 404。

### 新系统接入回归检查

以后新增宗门/道侣/命格等系统，**理想改动只涉及：新内容定义＋单一子系统逻辑＋奖励处理器＋效果注册＋少量 UI**。如果必须遍历修改所有已有战斗/功法/洞府代码，说明架构耦合过重，需要先拆依赖。

### CI 与验收命令

~~~bash
node scripts/validate-codex.mjs
node scripts/sync-codex-v0.5.mjs --check
node scripts/validate-codex-v0.5.mjs
# 施工后增加：
npm run typecheck
npm run test
npm run simulate:balance
npm run build
~~~

每次更改数据先改 \`data/codex/codex.v0.5.json\`，再执行 \`node scripts/sync-codex-v0.5.mjs --write\`；不能直接把 CSV 当成第二份权威数据来源。已有 v0.4 文件保留作历史快照，不回头改其游戏规则。

## 8. 第一轮施工的分段过关门槛

| 里程碑 | 最小结果 | 过关证据 |
|---|---|---|
| **M0 数据和战斗引擎** | 纯数值战斗、角色训练、怪物/关卡读取 | 类型检查+战斗回放、同seed一致、奖励只发一次 |
| **M1 可成长的仙途** | 青云30层自动冲层/卡关扫荡/主动修炼与突破 | 非酋基本修炼也能过前10关，不存在前30关死锁 |
| **M2 系统构筑** | 功法/洞府/灵宠由专属卡包获取和培养 | 三种玩家构筑对相同Boss具有可解释的不同结果 |
| **M3 一整世** | 第一次有效轮回、因果、常规遗物箱、第二世战力回馈 | 旧存档不受损，第二世前段时间确实变短 |
| **M4 长线骨架验收** | 30层再挑战路线/解锁事件可迁移，鸿蒙/共鸣算法回归 | 可靠展现概率和预计轮回收益，跨版本升级可解锁以后上线内容 |

首版不依赖广告和复杂美术。**在 M1～M3 玩法测试失败时，不得通过填更多遗物或投放广告掩盖问题。**
