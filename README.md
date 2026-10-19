# 抽卡修仙传 · Gacha Ascension

一个移动端优先的修仙抽卡增量肉鸽 MVP。开局凡人，万物靠抽；在每一世积累灵石、探索地图、提升卡包、构筑功法，并通过轮回抽取永久传承。

## 当前施工进度：M0 已交付（独立验收台）

**[直接进入 M0 GitHub Pages 验收版](https://tera-dark.github.io/Gacha-Ascension/m0.html)**

M0 已拆分独立战斗/状态/奖励引擎：确定性随机战斗、普通主线30层的数值样例、灵石与修为结算、三向淬炼、失败转扫荡、资源防重复发放以及独立自动存档。可以在手机或电脑浏览器操作。

- [M0 验收说明和操作清单](docs/M0-ACCEPTANCE.md)
- [M0 核心源代码](src/m0/) · [自动测试](tests/m0.test.mjs) · [游玩模拟](scripts/simulate-m0.mjs)
- 检查指令：`npm run check`（内容配置、自动测试、模拟及静态页面检查）。

**M0 不是完整的 v0.5 玩法：** 它仍未实现功法、洞府、灵宠、正式轮回和天命箱。这些将在 M1～M3 按设计逐步实施。仓库根目录 `index.html` 仍为历史 v0.1 游戏，与 M0 的 LocalStorage 存档完全分开。

## 当前规划总入口：GDD v0.5

- **[总体游戏设计 v0.5](docs/GDD-v0.5.md)** — 探索→修炼→挑战→轮回的主驱动力、逐层解锁、长期可玩循环。
- **[鸿蒙异宝与天命箱 v0.5](docs/tianming-relics-v0.5.md)** — 34件遗物，其中4件超稀有、无保底的独立追加掉落，防数值膨胀与毕业后的共鸣机制。
- **[关卡及系统解锁 v0.5](docs/progression-v0.5.md)** — 从账号创建到第150层的解锁规划、游戏前15分钟节奏和重复游玩目标。
- **[全量总图鉴 v0.5](docs/CODEX-v0.5.md)** — 137项候选条目，遗物、功能卡、敌人、关卡、境界与解锁规则。
- **[在线可筛选图鉴](codex.html)** — GitHub Pages 站内 `codex.html`；筛选稀有度（含鸿蒙）、系统与解锁关卡，并模拟永久遗物层数。
- **[v0.5 系统与数据架构](docs/architecture-v0.5.md)** — 统一配置、稀有开箱事务、进度解锁、轮回状态。
- **[开发前最终审计 v0.5](docs/PREDEV-AUDIT-v0.5.md)** — 已修复的问题、扩展架构评估与可以施工的范围。
- **[施工实施契约 v0.5](docs/IMPLEMENTATION-CONTRACT-v0.5.md)** — 系统分层、唯一数据源、幂等结算、关卡与轮回解锁协议。
- **[游玩节奏与经济闭环](docs/balance-loop-v0.5.md)** — 击杀、修炼、抽卡、轮回的反馈频率和不同层数的因果收益目标。
- **[v0.5 机器可读 JSON](data/codex/codex.v0.5.json)** / [总条目 CSV](data/codex/catalog.v0.5.csv) / [遗物 CSV](data/codex/relics.v0.5.csv) / [解锁节点 CSV](data/codex/unlocks.v0.5.csv)。
- 校验：`node scripts/validate-codex.mjs && node scripts/sync-codex-v0.5.mjs --check && node scripts/validate-codex-v0.5.mjs`。

**重要：v0.5 的完整玩法仍是设计方案，但 M0 的独立底层战斗/成长验收台已实装到 `m0.html`。根目录 `index.html` 仍是历史 v0.1 游戏。**

### 历史版本

- [v0.4 总体设计](docs/GDD-v0.4.md) / [v0.4 图鉴](docs/CODEX.md) / [v0.4 遗物规则](docs/tianming-relics-v0.4.md) / [v0.4 架构](docs/architecture-v0.4.md)。
- [v0.3 总体设计](docs/GDD-v0.3.md) / [v0.2 总体设计](docs/GDD-v0.2.md)。发生冲突以最新 v0.5 为准。

## 在线试玩

项目配置了 GitHub Pages 部署工作流。开启仓库的 **Settings → Pages → Build and deployment → Source: GitHub Actions** 后，即可通过以下地址访问：

https://tera-dark.github.io/Gacha-Ascension/

> 若是首次开启 Pages，请在 Actions 页面确认 Deploy Gacha Ascension to GitHub Pages 已成功部署。启用前，上述链接可能返回 404。

## 首版可玩内容

- 地图逐关自动探索；数值战斗、Boss 关、卡关后刷旧图获取资源；
- 探索产出灵石与修为，修为自动提高基础属性；
- 四种卡包：功法、丹药、建筑、法宝；
- 五种稀有度（黄 / 玄 / 地 / 天 / 仙），不同卡包分别积累抽数、提升卡包等级和稀有度概率；
- 单抽 / 十连、同名卡重复强化（最高 Lv.8）、槽位构筑；
- 建筑提高灵石与修为产出，剑系、雷系、灵田具备初步联动；
- 主动轮回、评分获得因果点、局外传承抽取和升级；
- 本地存档，刷新浏览器可继续；移动端竖屏与桌面均适配。

## 使用方式

直接打开 `index.html`，或使用 GitHub Pages 访问。无需安装依赖，也不需要后端。

界面：探索 / 抽卡 / 构筑 / 轮回。角色自动战斗，遇到瓶颈后积累资源继续抽卡。抽出的新卡会自动填充空闲槽位；槽满时可在构筑页点击卸下旧卡、再装配新卡。

## 经济与数值原型

- **灵石**：仅由探索与卡牌收益产生，是所有当世卡包的抽取货币。单抽 100，十连 1000。
- **修为**：探索结算获取，自动升级基础属性。
- **卡包等级**：分别随抽数升级，阈值为 8 / 22 / 48 抽（每世重置）。
- **因果点**：轮回评分结算获得（至少 5 场胜利）；每次局外传承抽取花费 30。
- **继承**：局外传承自动生效，均可以重复抽卡升级。卡牌、地图与灵石不继承。
- **挑战**：Boss 每 10 层，数值随关卡增长。

目前为可体验的数值 **MVP**，所有概率、掉落和成长曲线均待试玩后调优。没有接入真实广告、用户账号、服务端存档或付费。

## 项目结构

- `index.html`：全部前端结构、样式、状态管理和游戏逻辑。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署。

## 注意事项

游戏进度保存在当前浏览器 LocalStorage。更换设备、清理浏览器数据或无痕模式会导致进度无法同步。这是 MVP 的设计取舍。
