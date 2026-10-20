# 抽卡修仙传 · Gacha Ascension

移动端优先的 **放置 × 增量 × 抽卡** 修仙游戏。核心原则：**战斗获得基础资源，其他养成与构筑通过抽卡获得**；击败地图Boss才能进入下一图，打不过就在当前关刷小怪。修士没有数字等级，轮回永久遗物跨世保留。

> 当前状态（2026-10-20）：**v0.9 基础骨架已上线试玩，不是完整商业版**。目前前4/24图、炼气初中后圆满及筑基初期可玩。其余地图、境界、法宝和宗门等仍为规划，9分用户体验是目标而非已证实的评分。

## 从这里开始

| 内容 | 唯一入口 |
|---|---|
| **最新在线试玩** | **[GitHub Pages · 当前版本](https://tera-dark.github.io/Gacha-Ascension/preview-v0.8.html)** |
| **当前总设计及已实现边界** | [docs/GDD-v0.9-FOUNDATION.md](docs/GDD-v0.9-FOUNDATION.md) |
| **24张地图和20个境界数据** | [data/realms-maps.v0.8.proposal.json](data/realms-maps.v0.8.proposal.json) |
| **当前卡包、永久遗物和经济配置** | [data/v8-slice.json](data/v8-slice.json) |
| **开发与AI读取规则** | [AGENTS.md](AGENTS.md) |
| **历史 v0.7.1 试玩** | [m0.html](m0.html)（独立存档，不代表现行玩法） |
| **历史 v0.5 规划图鉴** | [codex.html](codex.html)（旧快照，稀有度和关卡均非现行规则） |

最新试玩入口仍叫 preview-v0.8.html，是为了保持原有 LocalStorage 存档隔离，不意味着其内容停留在 v0.8。

## 当前实际可玩

- **地图和境界**：4张地图；各图7段守卫与地图Boss，失败留在当前关。炼气四阶段、筑基初期，修为、悟道与突破丹有实际要求。
- **战斗**：三围、命中、闪避、减伤、功法克制、多波Boss；小怪可选灵石/修为/均衡目标；自动刷怪与有限安全离线结算。
- **七类卡包**：战力、聚财、修为、功法、洞府、灵宠、丹道；单抽、十连、卡牌实际效果、差异化揭晓动效及可跳过。
- **轮回和永久天命**：五阶常规遗物每箱必得，基础攻击/气血/灵石/修为无限叠加；有上限物品满级退出。太古奇珍每箱独立**十万分之一**、鸿蒙异宝每箱独立**百万分之一**，二者无保底、不替代常规遗物、非通关前提。
- **手机端**：五键导航、全系统默认收起的数值详情与自适应按钮。

**尚未完成**：全部24图可玩、完整五大境界、法宝和宗门实装、最终美术音效、真实统一战斗时钟、大数体系、云存档及真人留存验证。

## 当前代码与配置

| 路径 | 职责 |
|---|---|
| src/v8/engine.mjs | 战斗资源、地图、境界、卡包、轮回的游戏事务 |
| src/v8/combat-depth.mjs | 命中/闪避/减伤/克制、多波战斗 |
| src/v8/relic-pool.mjs | 无限与限量遗物，十万分之一和百万分之一判定 |
| src/v8/idle.mjs | 可恢复的有限离线刷怪 |
| src/v8/modules.mjs | 系统注册、合法效果、配置式解锁 |
| src/v8/reveal.mjs | 不影响抽奖结果的各卡包动效 |
| src/v8/details.mjs, src/v8/ui.mjs | 属性详情和界面交互 |
| src/v8/storage.mjs | 本地独立存档 |
| preview-v0.8.html, assets/css/preview.css（叠加 assets/css/workbench.css） | 当前手机/电脑试玩界面 |
| data/v8-slice.json | **现行卡包、遗物及数值配置** |
| data/realms-maps.v0.8.proposal.json | 24图/20境界规划与前4图参数 |

## 仓库目录分工

\`\`\`text
Gacha-Ascension/
├── index.html                       # Pages 默认入口，跳转现行试玩
├── preview-v0.8.html                # 现行游戏（保留旧 URL / 存档命名空间）
├── m0.html / codex.html             # 历史演示和旧图鉴，非现行设计
├── assets/css/
│   ├── workbench.css                # 新版和历史 M0 共用的工作台样式
│   └── preview.css                  # 现行试玩新增样式
├── src/
│   ├── v8/                          # 现行玩法引擎、模块、UI、存档
│   └── m0/                          # 历史 M0 专用，不作为新项目开发依据
├── data/
│   ├── v8-slice.json                # 现行数值唯一来源
│   ├── realms-maps.v0.8.proposal.json
│   ├── m0-*.json                    # 历史 M0 仍在运行的依赖
│   └── codex/                       # 历史 v0.5 图鉴及生成索引
├── docs/                             # 当前 GDD + 24 图规划
├── tests/
│   └── fixtures/                    # 仅供测试的旧版数据
├── scripts/                           # 验证、模拟与历史图鉴生成
└── .github/workflows/                # Pages、当前试玩及历史兼容 CI
\`\`\`

**维护约定：**入口与存档路径稳定优先；现行模块只引用现行配置；历史资料只为旧试玩提供兼容。不要为每次小改动创建并列 GDD/JSON，也不要把测试专用数据放回运行目录。详细约束见 [AGENTS.md](AGENTS.md)。

## 校验和部署

Node.js 22+，无需额外依赖：

~~~bash
npm run check:v8
npm run simulate:v8:full
npm run check
~~~

GitHub Pages 发布：.github/workflows/pages.yml。当前四图玩法和 Chromium 手机交互验收：.github/workflows/v8-slice.yml。

## 旧版本说明

保留 m0.html、src/m0 和历史图鉴的必要依赖，是为了历史演示与存档兼容，**不能拿它们当新功能规范**。早期 v0.1、v0.2–v0.8 互相冲突的旧方案已从主分支移除，可通过 Git 提交历史找回。

请按**真实代码与测试 → 现行JSON → v0.9 GDD → 地图规划**的优先级判断。如果两者冲突，先找出差异再修改，禁止混合旧版数字Lv、退层、旧天命概率和当前版本。

无广告、充值、云账号或服务器存档。浏览器 LocalStorage 可能在清理数据后丢失，建议定期导出。
