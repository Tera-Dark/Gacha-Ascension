# 抽卡修仙传 · Gacha Ascension

**经营一世，传承一脉。** 以长期挂机经营为底盘，抽卡发现机缘，构筑攻克难关，轮回积累道统。

当前代码为 **v0.10.7 经营与传承预览**（2026-10-22），本地单人，支持网页和离线安卓试玩包。可玩范围是前4张地图、炼气四阶段和筑基初期。`preview-v0.8.html` 保留原名，确保公开入口与存档键稳定。

## 开始试玩

无需安装依赖；在仓库根目录启动静态服务器：

```sh
python -m http.server 4173 --bind 127.0.0.1
```

打开 [本地试玩](http://127.0.0.1:4173/preview-v0.8.html)。[GitHub Pages](https://tera-dark.github.io/Gacha-Ascension/preview-v0.8.html) 由 `main` 部署，功能分支的提交不会自动更新在线站点。

存档保存在当前浏览器或安卓应用的 LocalStorage。设置支持导出／导入 JSON；导入先校验并备份原档，实时战斗中须等结束。网页与 APK 不会自动同步，可用此功能转移进度。清理应用数据或卸载会删除本地进度，目前没有云账号、付费抽卡或服务器存档。

### 安卓试玩

在 Windows 安装 JDK 17 和 Android SDK（Platform 35），配置 `ANDROID_HOME` 或 `android/local.properties` 的 `sdk.dir`，执行：

```powershell
npm run build:android
# 连接已开启 USB 调试的安卓手机后，也可构建并安装：
powershell -NoProfile -File scripts/build-android.ps1 -Install
```

输出为 `dist/android/Gacha-Ascension-0.10.7-preview.apk`，拷到手机安装。最低 Android 8.0，需可运行现代 JavaScript 的 Android System WebView。首包采用横屏离线 WebView，全部游戏代码／素材打入 APK，使用 HTTPS 本地资源源站，不需要联网或存储权限；保留24小时离线结算。系统返回键先关闭弹窗或返回探索，再确认退出；切后台暂停前台播放，回来按引擎结算。构建脚本执行 Android lint，并逐字节核验 APK 中的现行资源，防止打包旧代码。

当前继续使用 WebView 与现有事务引擎，Cocos 移植不在首版范围。调试包用于本地试玩；公开包使用原生 TapSDK 4.11.0（登录＋合规认证），隐私同意前不初始化平台SDK，认证成功才加载游戏，失败／退出／受限即阻止前台操作。SDK代码已通过Release Java编译，尚未完成真实平台联调与真机验收，不能称为已上架。

公开包配置放用户级 Gradle 属性文件（`~/.gradle/gradle.properties`）或同名环境变量，不要提交仓库：`TAP_CLIENT_ID`、`TAP_CLIENT_TOKEN`、`GACHA_PRIVACY_URL`、`GACHA_TERMS_URL`、`GACHA_FEEDBACK_URL`、`GACHA_KEYSTORE`（本机绝对路径）、`GACHA_STORE_PASSWORD`、`GACHA_KEY_ALIAS`、`GACHA_KEY_PASSWORD`。URL使用HTTPS，密钥由开发者生成与保管。配置齐备后执行 `npm run build:android:release`；未配置时拒绝产生公开包。此构建执行lint、资源字节核验及签名验证，拒绝Android Debug证书。参考[官方Android接入](https://developer.taptap.cn/docs/sdk/integration-guides/android/)、[原生合规认证](https://developer.taptap.cn/docs/en/sdk/anti-addiction/development-guide/android-native/)。

调试签名切换正式签名：在旧包导出并确认JSON已在应用外保存 → 卸载旧包 → 安装正式包 → 导入JSON并核对进度；同一包名不同签名不能覆盖安装。此后保持正式包名与签名固定，用更高versionCode覆盖升级。正常升级继续读取相同存档键并迁移，不要求重开；仍需真机验证。
## 当前内容

- **修行经营**：修士在探索、采药、闭关中安排一种主活动；药田、丹炉独立生产，统一结算最多24小时离线收益。基础回春草和回春丹必定可用，高级配方由抽卡解锁。
- **丹炉排程**：默认3个顺序任务，可炼指定数量或维护库存目标。缺料等候、补足后续炼，达到目标或库存上限暂停；不即时炼制，不自动消耗突破丹。
- **九类机缘**：战力、聚财、修为、功法、洞府、灵宠、丹道、装备、法器随进度开放。功法／灵宠／洞府在1／3／6份解锁节点，最多6份数值；普通抽卡每20抽额外定向选择一张已开放核心卡，进度跨世保留。
- **命痕主线**：在残庙醒来，与守卷人「阿烬」用灵石照亮前人的命痕。开局仅战力包，首位守卫后依次引入功法、装备、洞府、灵宠与悟道，跨图后开放聚财和丹道；法器仍需筑基。先发现御灵功法可触发灵契支线，提前开放御兽。短对话可以跳过、翻看旧页；阅读不代替真实关卡进度。已抽过或有明确非装备发现记录的旧包不回锁，最高关卡跨世保留。
- **回访与安全**：最近5次回访账单随奖励事务一起落盘，可在设置回看产出、消耗、掉装和暂停原因；收起不领奖。模块Worker使用一个固定24小时窗口恢复，页面保持响应；Web Locks只允许一个页面写档，其他页只读，关闭原页后重新载入可接管。冲突或保存失败停止写入，原档保留。
- **三种构筑**：剑意爆发、护盾反击、灵契追击。四图分别强调爆发预警、命中压力、恢复压制和反震应对；可推演已持有构筑，不消耗资源或偷看真实随机数；功法页展开三条路线可查目标组合、替代卡和下一节点，失败提示引用该场实际战报并通往反制页面。
- **战斗与装备**：双方攻击条、命中动作、扣血与奖励结算共用真实战斗时钟。10个普通装备槽，筑基起每大境界解锁1个独立法器槽，预留4槽；当前只开放首个法器槽。
- **战利品与战备**：胜利概率掉基础装备箱、药草箱；装备箱仅出黄／玄基础装备，药草箱给2–5份药草。真正死亡有50%概率损失一份已穿戴普通装备，行动超时不算死亡。回春丹、护体散、剑意散可备战；自动服药消耗25因果永久解锁，默认关闭。
- **轮回传承**：击败第四图 Boss 后自愿轮回。永久见闻、6个道统节点、两席有限传承及定向进度支持第二世；本世库存、装备、叠层、熟练度和排程重置，因果与天命遗物保留。
- **长期收藏**：常规天命箱40因果，含无上限永久成长与有限叠层遗物；太古奇珍每箱独立十万分之一、鸿蒙异宝百万分之一，均不保底，不是通关条件。
- **像素界面**：青绿／旧金像素主题。资源只在顶栏展示，探索首屏突出战斗、开始／停止探索与守卫挑战；手动战斗和刷怪策略在「战斗设置」，构筑、备战、战报默认折叠。手机横屏保留双栏，竖屏先呈现战斗。抽卡短卡片按三类分组，未开放卡包和未发现收藏收起；洞府区分药田／丹炉，轮回按道统／传承／遗物切换。说明与完整数值在标题问号，地图只在探索页。行囊为统一仓库，选择物品后在右栏操作，竖屏详情置于下方。
- **修行手册**：各页标题旁的「手册」查看14项引导，覆盖入门、经营、构筑和传承；按真实进度给下一步建议，可自由安排，不另发任务奖励。模块初见及药田、定向、法器等实际解锁时只提示一句，可逐条关闭、统一隐藏或重看。旧档跳过入门后仍能查阅手册，轮回后的本世实践与永久进展分别判断。

探索标题旁的「残卷」进入当前剧情。首次核心机缘会解释新机制／产线，达到3／6份时强调熟练／精通；快捷揭晓保留首次发现、新节点与高品质演出。基本采药、回春丹与挂机不依赖随机解锁；没有可选核心池时，20抽定向次数留存并提示首卫后可选。功法／灵宠／突破／道统／世界图鉴导航随相关能力引入，基础经营与仓库始终可用。

**未完成**：其余20图、完整五大境界、宗门、大规模炼器、额外轮回层、大数、云存档、视听细节终审、正式平台联调、真机与真人留存验证。

当前可交付熟人做四图／三世小范围试玩；对外放量前须补真机与SDK联调、首30分钟无指导试玩和至少7天真实玩家体验。四图代码绘制场景／敌人、关键合成音效和静音已接入，辨识度和音量仍待真机评价。完整盘点和退出标准见[现行设计的试玩准备度](docs/GDD-v0.9-FOUNDATION.md#试玩准备度与后续顺序)。扩地图和宗门暂不作为首轮试玩前置。

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
| `src/v8/storage.mjs`, `session.mjs`, `restore.mjs`, `restore-worker.mjs` | 原始备份、迁移、单写会话与后台恢复 |
| `src/v8/return-ledger.mjs`, `return-ui.mjs`, `diagnostics.mjs` | 最近5次回访账单、确认与脱敏诊断 |
| `src/v8/ui.mjs`, `management-ui.mjs`, `bank.mjs`, `module-help.mjs` | 页面与操作；UI 不直接发奖 |
| `src/v8/onboarding.mjs`, `guidance-ui.mjs` | 现有事实驱动的入门／手册和可关闭初见提示；不改游戏存档 |
| `src/v8/story.mjs`, `story-ui.mjs` | 命痕章节、解锁支线与短对话；正文和开放关卡在现行 JSON |
| `src/v8/pixel-ui.mjs`, `pixel-scene.mjs`, `assets/pixel/` | 像素图标、Canvas 动画和现有素材；`pixel-world.mjs`绘制地图／敌人，`audio.mjs`合成关键音效 |
| `assets/css/preview.css` | 现行样式；`workbench.css` 同时被历史 M0 使用 |
| `android/`, `scripts/build-android.ps1` | 离线 Android 宿主与构建核验；打包现行资源，不复制玩法 |
| `tests/`, `scripts/`, `.github/workflows/` | 自动测试、节奏模拟和发布 CI |

当前事实按运行代码与测试核验，数值查现行 JSON，再参考现行设计和地图规划。旧设计与单次修复过程在 Git 历史中查看。

## 验证与发布

Node.js 22 为 CI 环境，`package.json` 最低要求20；无需 `npm install`。

```sh
npm run check                      # 现行完整检查＋历史兼容
npm run simulate:v8:full            # 300组加速战斗策略回归
npm run simulate:v8:progression:full # 3流派×10种子×连续3世正式节奏
```

日常现行检查用 `npm run check:v8`。正式节奏模拟使用实际事务、资源与毫秒时钟，按每天3次回访，当前首世约32.2小时、二世约16.0小时（中位约快50%）；战斗单项模拟使用明确的加速夹具，不能用于推断正式首世时长。自动测试不替代真人体验。

浏览器测试请使用隔离端口，防止覆盖实际试玩存档：

```sh
python -m http.server 4180 --bind 127.0.0.1
```

打开 `tests/v8-mobile-smoke.html`、`tests/v8-landscape-smoke.html`、`tests/v8-bank-smoke.html`、`tests/v8-management-smoke.html`。测试页会创建或修改该端口的测试档；切勿在此端口经营真实进度。战斗时序、损坏存档和新手流程另有 `tests/v8-*-smoke.html`。CI 额外安装固定版 `playwright-core@1.64.1`，运行 `scripts/browser-smoke-v8.mjs`，以真实 Chromium 时钟逐项等待结果并保留截图，避免虚拟时钟跳过动画帧。运行浏览器脚本需设置 `CHROME_BIN` 或在 PATH 中提供 Chromium。

`.github/workflows/v8-slice.yml` 在推送和 Pull Request 上运行现行逻辑与 Chromium 验收（含所有 `tests/v8-*-smoke.html`），并显式定位 Chromium；`v8-combat-balance.yml` 负责完整战斗／三世模拟；`pages.yml` 仅由 `main` 推送或手动触发发布，发布前先运行 `check:v8`，门禁不过不会部署。需核验成功的 deploy 状态后才能称已上线。`npm run check:v8` 也会校验产品版本在 `package.json`、脱敏诊断和安卓 `versionName` 三处一致。

物料草稿可在隔离4180服务上用 `npm run capture:v8:materials` 复现（先设置 `CHROME_BIN` 并运行 `node node_modules/playwright-core/cli.js install ffmpeg`）。输出 `dist/store-preview/` 的3张1280×720实机界面截图及真实时钟的无声WebM录屏草稿，不注入资源、不上传。最终商店图标、宣传图、视频编码／声音、实际运营主体隐私文本仍须在真机验收后确认；草稿不代表已提交审核。

## 美术来源与复现

素材由 [pixelmon](https://github.com/grymmjack/pixelmon)（MIT）、[ComfyUI](https://github.com/Comfy-Org/ComfyUI)、[SDXL Base 1.0](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) 和 [Pixel Art XL](https://huggingface.co/nerijs/pixel-art-xl) 在本机生成，无云端 API、订阅或按次费用。模型分别遵循公开的 OpenRAIL 许可，不随仓库分发。来源、提示词、种子与工具提交见 `assets/pixel/manifest.json`。

主角与首图狼妖动作由既有原画制作程序关键帧；竹谷、鬼林、剑冢背景及各图首领使用本项目代码绘制的像素场景与轮廓，避免继续四图同狼同背景。战斗使用载入完成的透明 PNG 与固定 Canvas 绘制；加载不依赖可能失败的 `decode()`，缺帧保留可用帧或独立立绘，不再把概念界面多边形裁片作为角色回退。动作、进度条和结算共用实际战斗时间戳；结算后保留850毫秒最终血量，经营刷新不提前抹去结果。手机横屏将备战说明排在控制区后，保证首屏战斗可见。新增素材加载／画布恢复和安卓生命周期／存档转移浏览器验收，现有 Chromium 脚本共24个用例。

复现时将 pixelmon 放入 `.cache/tools/pixelmon`，准备模型及 Pillow、NumPy、SciPy、rembg、U2Net，再执行：

```sh
python scripts/generate-pixel-preview.py --comfy-dir <ComfyUI共享目录>
```

模型、原始输出和本地工具留在忽略的 `.cache/` 或仓库外；运行游戏只需要已导出的 `assets/pixel/`。

## 兼容边界

Schema 10 沿用 `gacha-ascension-v8-slice-v1`；Schema 8／9 升级先备份原始字节，保留持有内容和旧战斗快照，不补造已消耗的历史发现或抽数。浏览器须支持模块Worker和Web Locks（新版Chrome／Android System WebView）；缺少安全锁时只读，不退回无保护写入。设置提供主动复制脱敏诊断和反馈跳转，不自动上传存档、账号或实名信息。损坏存档提供原始导出与显式备份重开，读取失败不会静默覆盖。

[m0.html](m0.html)、`src/m0/`、历史配置与 [codex.html](codex.html) 只为旧试玩兼容保留，不代表现行玩法；不要混用旧数字等级、退层规则或旧概率。
