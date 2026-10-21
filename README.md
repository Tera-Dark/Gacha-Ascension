# 抽卡修仙传 · Gacha Ascension

**经营一世，传承一脉。** 以长期挂机经营为底盘，抽卡发现机缘，构筑攻克难关，轮回积累道统。

当前代码为 **v0.10.0 经营与传承预览**（2026-10-21），纯前端、本地单人。可玩范围是前4张地图、炼气四阶段和筑基初期。`preview-v0.8.html` 保留原名，确保公开入口与存档键稳定。

## 开始试玩

无需安装依赖；在仓库根目录启动静态服务器：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

打开 [本地试玩](http://127.0.0.1:4173/preview-v0.8.html)。[GitHub Pages](https://tera-dark.github.io/Gacha-Ascension/preview-v0.8.html) 由 `main` 部署，功能分支的提交不会自动更新在线站点。

存档保存在当前浏览器的 LocalStorage，建议在设置中定期导出。清理浏览器数据可能删除进度；目前没有云账号、付费抽卡或服务器存档。

## 当前内容

- **修行经营**：修士在探索、采药、闭关中安排一种主活动；药田、丹炉独立生产，统一结算最多24小时离线收益。基础回春草和回春丹必定可用，高级配方由抽卡解锁。
- **丹炉排程**：默认3个顺序任务，可炼指定数量或维护库存目标。缺料等候、补足后续炼，达到目标或库存上限暂停；不即时炼制，不自动消耗突破丹。
- **九类机缘**：战力、聚财、修为、功法、洞府、灵宠、丹道、装备、法器随进度开放。功法／灵宠／洞府在1／3／6份解锁节点，最多6份数值；普通抽卡每20抽额外定向选择一张已开放核心卡，进度跨世保留。
- **三种构筑**：剑意爆发、护盾反击、灵契追击。四图分别强调爆发预警、命中压力、恢复压制和反震应对；可推演已持有构筑，不消耗资源或偷看真实随机数。
- **战斗与装备**：双方攻击条、命中动作、扣血与奖励结算共用真实战斗时钟。10个普通装备槽，筑基起每大境界解锁1个独立法器槽，预留4槽；当前只开放首个法器槽。
- **战利品与战备**：胜利概率掉基础装备箱、药草箱；装备箱仅出黄／玄基础装备，药草箱给2–5份药草。真正死亡有50%概率损失一份已穿戴普通装备，行动超时不算死亡。回春丹、护体散、剑意散可备战；自动服药消耗25因果永久解锁，默认关闭。
- **轮回传承**：击败第四图 Boss 后自愿轮回。永久见闻、6个道统节点、两席有限传承及定向进度支持第二世；本世库存、装备、叠层、熟练度和排程重置，因果与天命遗物保留。
- **长期收藏**：常规天命箱40因果，含无上限永久成长与有限叠层遗物；太古奇珍每箱独立十万分之一、鸿蒙异宝百万分之一，均不保底，不是通关条件。
- **像素界面**：青绿／旧金像素主题，支持桌面、手机横屏双栏与竖屏。说明和完整数值收进标题问号；地图列表仅在探索页打开。道具行囊为统一仓库，分类／搜索后在右栏查看效果、开箱、备战或装配，竖屏详情置于下方。

**未完成**：其余20图、完整五大境界、宗门、大规模炼器、额外轮回层、大数、云存档、最终美术音效及真人留存验证。

## 文档与源码

| 路径 | 职责 |
|---|---|
| [现行设计](docs/GDD-v0.9-FOUNDATION.md) | 已实现规则、数据边界、存档及验收 |
| [地图规划](docs/REALMS-AND-MAPS-v0.8.md) | 24图／20境界候选，不能当作已上线内容 |
| [AI 工程约定](AGENTS.md) | 阅读顺序、目录边界、禁止事项与验证要求 |
| `data/v8-slice.json` | 现行卡包、概率、数值及 `management` 经营配置 |
| `data/realms-maps.v0.8.proposal.json` | 地图和境界注册表，当前只启用前4图 |
| `src/v8/engine.mjs` | 唯一事务入口：战斗、奖励、抽卡、装备、轮回 |
| `src/v8/activities.mjs` | 主活动、药田、丹炉与离线事件顺序结算 |
| `src/v8/progression.mjs` | 成长节点、见闻、道统、定向与传承合法性 |
| `src/v8/combat-depth.mjs`, `combat-timeline.mjs`, `idle.mjs` | 战斗模拟、逐击表现时间线与挂机汇总 |
| `src/v8/equipment.mjs`, `artifacts.mjs`, `treasure.mjs` | 装备、法器、宝箱与战备物品规则 |
| `src/v8/relic-pool.mjs` | 普通遗物、品质保障和独立极稀有追加 |
| `src/v8/storage.mjs` | 原始备份、迁移、保存与损坏存档恢复 |
| `src/v8/ui.mjs`, `management-ui.mjs`, `bank.mjs`, `module-help.mjs` | 页面与操作；UI 不直接发奖 |
| `src/v8/pixel-ui.mjs`, `pixel-scene.mjs`, `assets/pixel/` | 像素图标、Canvas 动画和可发布素材 |
| `assets/css/preview.css` | 现行样式；`workbench.css` 同时被历史 M0 使用 |
| `tests/`, `scripts/`, `.github/workflows/` | 自动测试、节奏模拟和发布 CI |

当前事实按运行代码与测试核验，数值查现行 JSON，再参考现行设计和地图规划。旧设计与单次修复过程在 Git 历史中查看。

## 验证与发布

Node.js 22 为 CI 环境，`package.json` 最低要求20；无需 `npm install`。

```sh
npm run check                      # 现行完整检查＋历史兼容
npm run simulate:v8:full            # 300组加速战斗策略回归
npm run simulate:v8:progression:full # 3流派×10种子×连续3世正式节奏
```

日常现行检查用 `npm run check:v8`。正式节奏模拟使用实际事务、资源与毫秒时钟，按每天3次回访，当前首世约24.2小时、二世约16.0小时（中位约快34%）；战斗单项模拟使用明确的加速夹具，不能用于推断正式首世时长。自动测试不替代真人体验。

浏览器测试请使用隔离端口，防止覆盖实际试玩存档：

```sh
python -m http.server 4180 --bind 127.0.0.1
```

打开 `tests/v8-mobile-smoke.html`、`tests/v8-landscape-smoke.html`、`tests/v8-bank-smoke.html`、`tests/v8-management-smoke.html`。测试页会创建或修改该端口的测试档；切勿在此端口经营真实进度。战斗时序、损坏存档和新手流程另有 `tests/v8-*-smoke.html`。CI 额外安装固定版 `playwright-core@1.64.1`，运行 `scripts/browser-smoke-v8.mjs`，以真实 Chromium 时钟逐项等待结果并保留截图，避免虚拟时钟跳过动画帧。运行浏览器脚本需设置 `CHROME_BIN` 或在 PATH 中提供 Chromium。

`.github/workflows/v8-slice.yml` 负责现行逻辑与 Chromium 验收；`v8-combat-balance.yml` 负责完整战斗／三世模拟；`pages.yml` 仅由 `main` 推送或手动触发发布。需核验成功的 deploy 状态后才能称已上线。

## 美术来源与复现

素材由 [pixelmon](https://github.com/grymmjack/pixelmon)（MIT）、[ComfyUI](https://github.com/Comfy-Org/ComfyUI)、[SDXL Base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) 和 [Pixel Art XL](https://huggingface.co/nerijs/pixel-art-xl) 在本机生成，无云端 API、订阅或按次费用。模型分别遵循公开的 OpenRAIL 许可，不随仓库分发。来源、提示词、种子与工具提交见 `assets/pixel/manifest.json`。

首版动作由生成原画制作程序关键帧；其余地图暂复用首图美术。战斗使用预解码 PNG 与固定 Canvas 绘制，减少素材闪烁；动作、进度条和结算共用实际战斗时间戳。

复现时将 pixelmon 放入 `.cache/tools/pixelmon`，准备模型及 Pillow、NumPy、SciPy、rembg、U2Net，再执行：

```sh
python scripts/generate-pixel-preview.py --comfy-dir <ComfyUI共享目录>
```

模型、原始输出和本地工具留在忽略的 `.cache/` 或仓库外；运行游戏只需要已导出的 `assets/pixel/`。

## 兼容边界

Schema 9 沿用 `gacha-ascension-v8-slice-v1`；Schema 8 升级先备份原始字节，保留持有内容和旧战斗快照，不补造已消耗的历史发现或抽数。损坏存档提供原始导出与显式备份重开，读取失败不会静默覆盖。

[m0.html](m0.html)、`src/m0/`、历史配置与 [codex.html](codex.html) 只为旧试玩兼容保留，不代表现行玩法；不要混用旧数字等级、退层规则或旧概率。
