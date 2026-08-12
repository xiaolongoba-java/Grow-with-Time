# 日进·拾光（Grow with Time）

**日进·拾光** 是一款本地优先的个人成长与行动桌面应用。“日进”代表每天完成一点、进步一点；“拾光”代表拾起每天闪现的灵感和值得珍藏的回忆。英文名保留为 **Grow with Time**。

应用基于 Tauri 2、React 与 SQLite 构建，任务和个人记录默认保存在本机。无需注册账号，也不依赖持续联网。

> 产品定位：面向个人的轻量执行系统，而不是多人协作或重型项目管理平台。

## 为什么使用日进·拾光

很多待办工具擅长收集，却没有解决“今天到底应该先做什么”，也没有帮用户留下成长过程中的灵感与回忆。日进·拾光围绕两条主线设计：

- **日进**：目标、任务、专注和习惯形成每日行动闭环。
- **拾光**：今日拾光、拾念和拾光变迁保存灵感、收获与写给未来的话。

四种记录各有明确边界：**拾念记瞬间，今日拾光记今天，备忘录存长期，拾光变迁寄未来**。闪现的想法先进入拾念，可整理为任务；当天的收获在收尾后进入今日拾光；需要持续查阅的资料放进 Markdown 备忘录；只想在未来某天重新遇见的话，则交给拾光变迁。

1. **收集**：通过快捷输入、全局快捷键或模板快速记下任务。
2. **计划**：把任务加入“我的一天”，检查时间冲突并整理今日安排。
3. **执行**：从下一项任务开始专注，通过番茄钟、时间轴和提醒保持节奏。
4. **调整**：完成、顺延、移出今日或取消任务，每个选择都有明确结果。
5. **回顾**：在晚间收尾和周复盘中查看投入、完成情况与长期目标进展。
6. **成长**：任务、习惯和专注时间会沉淀为年度热点图、目标里程碑与成就。

## 核心功能

### 今日执行

- “今日”与“我的一天”分别表达截止日期和主动安排，避免语义混淆
- 一眼查看今日待办、完成进度、时间冲突与下一项任务
- 智能排程先预览再应用，支持选择任务和持久化锁定日程
- 支持批量完成、改期、顺延和移出今日计划
- 晚间逐项处理未完成任务，并记录一句当日反思
- 今日时间轴中每个任务独占一行，悬停即可查看任务详情

### 任务管理

- 优先级、状态、日期、起止时间、预计耗时与实际耗时
- 子任务、重复规则、多次提醒、完成标准与前置依赖
- 项目、标签、智能列表、附件和回收站
- 精力等级和灵活排程属性，帮助生成更合理的日程
- 任务历史记录，便于回看状态、时间和内容变化
- 自然语言快速输入，例如“明天下午 3 点开会 p1”

### 项目与模板

- 用项目组织相关任务，并设置颜色、目标、成功标准和截止日期
- 项目名称和规划信息支持随时编辑，已有任务归属不会受影响
- 里程碑用于标记项目中的关键阶段
- 将常用任务结构保存为模板，减少重复录入

### 长期成长

- 支持累计数量、数值变化、持续频率、累计时间、项目和自定义目标
- 任务完成、习惯打卡和关联任务的专注时间可自动贡献目标进度
- 年度热点图展示过去一年的投入强度，可按目标筛选并点击日期回看
- 目标支持手动记录、暂停、恢复和阶段里程碑
- 达成目标或里程碑后自动生成成就，也可以手动记录并置顶重要成果
- 周复盘汇总目标投入，让长期方向与每日行动保持一致

### 专注、习惯与提醒

- 任务绑定番茄钟与专注会话，自动累计实际投入时间
- 每周习惯目标、每日打卡、连续记录与成长目标关联
- 单次提醒和多提醒组合，支持系统通知、通知中心与稍后提醒
- 循环提醒适合喝水、活动和护眼等周期事项
- 事项倒计时适合会议、发布和阶段节点
- 应用重新打开时会受控补发错过的提醒，较早提醒只进入通知中心，避免集中弹窗

### 桌面体验

- Windows 与 macOS 原生桌面应用
- 托盘常驻、开机自启和全局快速添加快捷键 `Ctrl/Cmd+Shift+N`
- “清昼、晨曦玻璃、璃幕、静夜”四套完整视觉主题，并支持跟随系统自动切换
- 晨曦玻璃与璃幕以透明整窗外壳呈现氛围；Windows 圆角裁切干净，macOS 保留原生红绿灯
- 四套主题统一文字、状态、边框与交互色，对关键文字执行 WCAG AA 对比度检查
- 可拖拽的今日时间轴入口
- 桌面组件可展示日历、今日任务和备忘内容，并支持透明度与配色调整
- 命令面板用于快速切换页面和执行常用操作

### 备忘录与数据管理

- 备忘录支持 Markdown 编写与预览
- JSON 完整备份覆盖任务、项目、习惯、提醒、倒计时、目标、里程碑和成就
- CSV 可用于任务数据的便携导出
- 自动数据库快照与启动前备份降低升级风险
- 可从设置中检查数据库状态、打开数据目录和恢复历史快照

## 数据与隐私

- 核心数据存储在本机 SQLite 数据库中，不要求账号或云服务
- 应用不提供云同步、在线协作、团队权限和远程数据托管
- AI 拆解与智能排期为可选能力；只有用户主动配置 OpenAI 兼容 API 后才会启用
- 建议定期导出 JSON 备份，并将备份文件保存到独立磁盘或可信的个人同步目录

## 适合哪些人

- 希望把每天的计划、执行和复盘集中在一个应用中的个人用户
- 需要可靠桌面提醒、周期倒计时或专注计时的人
- 想通过长期目标和年度热点图看到持续投入的人
- 重视本地数据、希望离线使用且不愿注册账号的人

如果你需要多人协作、权限审批、甘特图或企业级项目管理，本项目目前并不以这些场景为目标。

## 下载

最新版本：[Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/latest)

> 维护约定：从 v1.4.3 起，每次代码推送都必须同步更新 README 中的版本说明，确保仓库首页与实际代码状态一致。

#### v1.5.9 周视图可读性与稳定性

- 周时间网格保留左侧时间轴；矮任务块不再用时段行挤压标题，完整时间改到悬停提示。
- 周起始统一为周一，与周清单 / 成长统计一致。
- 桌面仪表盘不再抢先结算倒计时，避免主窗口漏发提醒；无痕模式下仪表盘文案脱敏。

### v1.5.9

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.9_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.9/Grow.with.Time_1.5.9_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.9_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.9/Grow.with.Time_1.5.9_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.9) 或 Actions Artifacts 下载。

#### v1.5.8 周清单与桌面仪表盘

- 新增「周清单」视图：本周目标分栏、当周日历、完成统计与日负荷。
- 用标签「工作 / 生活 / 健康 / 学习」自动归类本周任务。
- 新增桌面横条仪表盘（问候、备忘、打卡、月历、倒计时、金句）；设置可在横条与经典三件套间切换。

### v1.5.8

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.8_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.8/Grow.with.Time_1.5.8_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.8_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.8/Grow.with.Time_1.5.8_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.8) 或 Actions Artifacts 下载。

#### v1.5.7 执行反馈与工程健康

- 今日「开始」会打开详情并进入专注，按钮即时反馈；引导页「开始日进·拾光」更可靠。
- 初始化/操作失败提示更可读，支持重试与关闭。
- 无痕模式生效：系统通知标题与正文脱敏，避免锁屏或通知中心泄露任务内容。
- 网络权限收窄为 HTTPS 与本机 HTTP（localhost / 127.0.0.1），兼容自定义 AI 与本地模型。
- 发布检查接入 CI；Windows 安装包继续使用标准 Tauri NSIS + WebView2 downloadBootstrapper。
- 备份恢复摘要与合并语义抽出可测纯逻辑，加强契约测试。
- 测试依赖固定 Vitest 3，避免 Node 24 下 Vitest 4 用例收集失败。

### v1.5.7

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.7_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.7/Grow.with.Time_1.5.7_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.7_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.7/Grow.with.Time_1.5.7_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.7) 或 Actions Artifacts 下载。

#### v1.5.6 外观精装：璃幕主题与整窗圆角

- 新增「璃幕」深色磨砂主题，与清昼、晨曦玻璃、静夜并列可选。
- 四套主题统一为整窗外壳圆角 + 应用内标题栏，去掉系统标题栏割裂感。
- Windows 使用自定义窗控；macOS 保留红绿灯并采用 Overlay 标题栏留白。
- 关闭主窗 acrylic/矩形阴影并加强圆角裁切，减轻四角残影。
- 品牌标改为圆形「朝阳 + 地平线」图标，侧栏与主题预览同步更新。

### v1.5.6

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.6_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.6/Grow.with.Time_1.5.6_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.6_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.6/Grow.with.Time_1.5.6_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.6) 或 Actions Artifacts 下载。

#### v1.5.5 数据可靠性加固

- 拾念「转为任务」仅在创建成功后才标记为已处理，失败时保留灵感并提示；转换过程增加防连点保护。
- 完整备份恢复改为事务提交，中途失败会回滚，避免留下空库或半恢复状态。
- 旧备份缺少成长/拾光/提醒等扩展字段时，不再误删当前对应数据，并在确认框中写明将保留的内容。
- 空闲时段推荐会同时考虑截止日期与「我的一天」占用，减少撞车。
- 新建任务弹窗在手动改过时间后不再被自动推荐覆盖；改日期或预计时长时才会重新推荐。

### v1.5.5

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.5_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.5/Grow.with.Time_1.5.5_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.5_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.5/Grow.with.Time_1.5.5_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.5) 或 Actions Artifacts 下载。

#### v1.5.4 发布门面与日进拾光衔接

- 安装包 `productName` 恢复为 ASCII 的 `Grow with Time`，修复中文产品名导致产物变成 `_1.5.4_...` 的问题；窗口标题仍展示「日进·拾光 · Grow with Time」。
- README 补充当前版本下载表，并与 GitHub Releases 真实文件名对齐。
- 今日页增加「今日拾光」入口，方便从执行切到沉淀。
- 拾念「转为任务」会加入我的一天，并自动推荐当天第一个空闲时段。
- 发布检查增加 `productName` ASCII 约束，避免以后再次踩包名坑。
- 移除未引用的 Windows 安装器背景草稿资源。

### v1.5.4

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.5.4_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.4/Grow.with.Time_1.5.4_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.5.4_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.5.4/Grow.with.Time_1.5.4_x64-setup.exe) |

> 若链接暂不可用，请打开 [Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/tag/v1.5.4) 或 Actions Artifacts 下载。

#### v1.5.3 新建任务体验

- “+ 新建任务”现在会立即打开完整创建弹窗，不再只聚焦侧栏快速输入框；自然语言快速录入仍作为独立的轻量入口保留。
- 新任务在保存前保持为本地草稿，只有确认创建后才写入数据库，避免意外产生空白任务。
- 根据所选日期和预计时长自动寻找当天第一个连续空闲时段，避开已有日程并忽略已完成任务。
- 默认时间按 15 分钟对齐，修改日期或预计时长后会重新推荐，用户也可以继续手动调整起止时间。
- 创建弹窗补充优先级、项目、预计时长和任务说明，并兼容窄窗口与三套主题。

#### v1.5.2 三主题精修

- 将浅色、玻璃与深色分别命名为“清昼、晨曦玻璃、静夜”，建立清爽、通透、沉静三种明确气质。
- 设置页新增三张实时主题预览卡，跟随系统作为独立自动切换选项，选择结果更直观。
- 晨曦玻璃接入 Windows 原生 Acrylic，移除应用内部伪造的渐变壁纸，让真实桌面背景透过窗口。
- 建立统一的标题、正文、标签、弱文字、输入框和焦点环语义色，减少页面之间颜色漂移。
- 加强深色模式卡片、弹窗、时间轴与表单边界；玻璃模式增加文字保护与高光边缘，兼顾氛围和可读性。
- 新增主题对比度测试，三套主题的主要文字与代表性表面均达到 WCAG AA 4.5:1 基线。
- 通知中心移入侧栏“更多”，底部工具栏恢复为设置、回收站和桌面组件三个稳定入口。

#### v1.5.1 安装体验

- 重新设计 Windows 安装器封面与步骤页页眉，统一日进·拾光的蓝色光轨、品牌标识和中英文名称。
- 移除旧安装界面的网点图标、冗余口号、标签胶囊和错误版本号，提升高 DPI 显示清晰度。
- 修复晚间收尾覆盖白天已写拾光内容的问题；部分保存只更新明确传入的字段，已有心情、重要时刻和明日寄语会被完整保留。
- 今日完成摘要统一使用本地日期，避免东八区凌晨完成的任务被算入前一天。
- 统一晚间内容来源：今日拾光作为正式沉淀，日快照只保存执行统计；复盘页继续兼容旧版“每日一句”。
- 今日拾光存在未保存内容时，切换页面或关闭窗口会先提醒确认。

#### v1.5.0 日进·拾光

- 品牌正式升级为“日进·拾光”，主界面与窗口标题持续展示英文名 Grow with Time；应用数据目录与数据库标识保持不变，保障平滑升级。
- 今日拾光、拾念箱、拾光变迁采用三个独立页面，并在侧栏组成清晰的“拾光”产品主线。
- 精简左侧图标栏，将完整功能导航统一收进文字侧栏，避免重复入口。
- 重塑三类拾光页面的视觉结构：今日拾光采用沉浸式回望纸张，拾念采用便签瀑布流，拾光变迁采用信封与送达倒计时，并补齐深色模式、空状态、窄屏布局和键盘焦点反馈。
- 首页导航围绕“日进 / 拾光”重新分层，默认只保留每日高频入口，低频视图、工具、标签和智能列表收进“更多”。
- 晚间完成“今日收尾”后自动进入今日拾光，已完成事项和投入时长成为回望摘要，形成执行到沉淀的闭环。
- 新增拾光规则测试与一键发布检查，校验版本号、README、迁移和备份覆盖，降低文档与安装包不同步风险。
- 今日拾光自动汇总当天完成任务和投入时长，支持记录收获、重要时刻、心情与给明天的话。
- 新增“拾念”快捷浮窗，使用 `Ctrl/Cmd + Shift + Space` 呼出，回车即可保存灵感，并支持 `#标签`。
- 拾念箱支持将灵感转为待办任务或归档。
- 新增“拾光变迁”，可以写信给未来的自己；关闭应用期间到期的信会在下次启动时补发。
- 长期目标支持一键生成“加入今日行动”的关联任务，让目标进入每日执行闭环。
- 完整备份升级到 v6，覆盖今日拾光、拾念与未来信件；数据库增加正式 v13 migration。

#### v1.4.3 稳定性与数据修复

- 修复项目编辑弹窗背景透明、内容叠加、窄屏滚动和底部操作区挤压问题。
- 手动完成的长期目标不再因后续对账或新增记录被自动恢复为“进行中”。
- 自定义目标调整为仅手动记账，并从任务、习惯的自动关联入口移除，避免完成与专注重复计数。
- 任务完成和专注投入统一按照本地日期记录，修复东八区凌晨记录落到前一天的问题。
- 新增 v12 正式数据库迁移，以 `task_planning_metadata` 统一保存多提醒和预计耗时；历史补列仅作为旧数据升级桥接。
- 修复完整备份恢复时多提醒数组可能丢失的问题，并增加回归检查。
- 休眠恢复后的提醒水位只在真实扫描完成后推进，降低系统唤醒时漏补提醒的概率。
- 成长热点图回看对数值变化目标显示“当前值”，与目标详情语义保持一致。

### v1.4.2

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.4.2_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.4.2/Grow.with.Time_1.4.2_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.4.2_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.4.2/Grow.with.Time_1.4.2_x64-setup.exe) |

> macOS 版本使用 ad-hoc 签名并经过构建完整性验证。由于尚未使用 Apple Developer ID 公证，首次打开时可能仍需在“系统设置 → 隐私与安全性”中选择允许打开。请直接从 GitHub Releases 下载，不要通过微信等工具二次转存。

#### v1.4.2 成长数据可信度

- 成长贡献按目标类型分流，避免任务完成与专注时长重复计入
- 数量与频率目标接受任务/习惯，时间目标只接受专注，数值变化只接受手动记录
- 数值变化目标改为录入“当前值”，支持体重等上升或下降目标
- 暂停、完成、放弃和归档目标不再接受自动贡献
- 目标详情支持编辑、完成、放弃、归档及不兼容贡献检查清理
- 频率目标按照本周目标次数计算，项目目标按照关联项目完成率计算
- 修复东八区周起点偏移，并让今日未记录时延续昨日连续天数
- 区分“今日任务完成率”和“长期成长目标”的内部命名，项目文案改为“项目成果”

#### v1.4.1 修复

- 项目现在支持编辑名称、颜色、目标、成功标准和截止日期
- 完整备份加入循环提醒与事项倒计时，恢复后不再丢失 timers 数据
- 旧备份缺少 `flexible` 时按可灵活排程恢复，与新建任务保持一致
- 智能排程锁定改为数据库持久化，重启及备份恢复后仍然有效
- 启动时受控补发关闭期间错过的提醒，超过 30 分钟只进入通知中心
- 今日 Hero 样式统一收口至 `global.css`，减少暗色和窄屏覆盖冲突
- 数据库增加 v11 migration，并保持所有已发布 migration 不变

#### v1.4.0 重点更新

- 新增“成长”中心，将长期目标、每日行动、里程碑和成就连成闭环
- 支持累计数量、数值变化、持续频率、累计时间、项目与自定义目标
- 年度热点图展示过去一年的行动强度，并支持按目标筛选和日期回看
- 任务完成、习惯打卡和关联任务的专注时间可自动计入目标进度
- 任务详情与习惯页支持关联目标和设置单次贡献值
- 支持手动记录进展、目标暂停/恢复、阶段里程碑与自动完成判断
- 达成里程碑或目标时自动生成成就，也可手动记录并置顶重要成果
- 生产力复盘新增本周目标投入，长期成长与每日执行保持一致
- 备份格式升级至 v4，完整包含目标、贡献、里程碑和成就数据
- 数据库增加正式 v10 migration，并保留历史 migration 不可变性

#### v1.3.2 热修复

- 修复升级安装后数据库 migration 校验失败导致 Windows 启动即闪退
- 恢复已发布 migration 的不可变性，保留现有任务和设置数据
- SQL 插件初始化前确保应用数据目录存在

#### v1.3.1 重点更新

- 统一为清晰的成长蓝视觉系统，提升浅色与深色模式的文字对比度
- 精简今日首屏，突出“开始任务”主操作并显示即将执行的任务
- 下一任务按照当前时间、优先级、计划时间和手动排序智能选择
- 收拢 Hero 与进度环样式来源，清理重复 CSS 和无效网络字体依赖
- 为 Hero 增加轻量暖色氛围，统一导航、按钮、卡片和状态色

#### v1.3.0 重点更新

- “我的一天”形成计划、执行、批量顺延、晚间收尾与复盘闭环
- 整理今日支持预览、选择、锁定与确认后应用，已应用任务不再重复重排
- 明确区分今日计划与任务截止日期，支持批量改期和移出我的一天
- 详情编辑增加未保存保护，排程与收尾增加确认及防重复提交
- 复盘页展示最近每日一句和计划/完成时长
- 时间轴入口支持拖拽安全区，并在详情抽屉打开时自动隐藏
- 加强原生提醒生命周期、重复任务字段与数据库 schema 测试

### v1.2.0

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.2.0_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.2.0/Grow.with.Time_1.2.0_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.2.0_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.2.0/Grow.with.Time_1.2.0_x64-setup.exe) |

### v1.1.0

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.1.0_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.1.0/Grow.with.Time_1.1.0_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.1.0_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.1.0/Grow.with.Time_1.1.0_x64-setup.exe) |

### v1.0.2

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.0.2_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.2/Grow.with.Time_1.0.2_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.0.2_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.2/Grow.with.Time_1.0.2_x64-setup.exe) |

### v1.0.1

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.0.1_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.1/Grow.with.Time_1.0.1_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.0.1_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.1/Grow.with.Time_1.0.1_x64-setup.exe) |

### v1.0.0

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.0.0_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.0/Grow.with.Time_1.0.0_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.0.0_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.0.0/Grow.with.Time_1.0.0_x64-setup.exe) |

若 Release 尚未发布或链接不可用，可在 [GitHub Actions](https://github.com/xiaolongoba-java/Grow-with-Time/actions) 打开对应平台的最新成功构建，在页面底部 **Artifacts** 下载：

- macOS：`grow-with-time-macos-aarch64`
- Windows：`grow-with-time-windows-x64`

> macOS 安装包使用 ad-hoc 签名，但尚未经过 Apple Developer ID 公证。首次打开若被拦截，请在“系统设置 → 隐私与安全性”中选择允许打开。

## 开发

需已安装 Visual Studio Build Tools（MSVC）与 Rust。

```bash
npm install
npm run tauri dev
```

发布前请跑本地门禁（版本对齐、测试与前端构建）：

```bash
npm run release:check
```

若链接器冲突（Git 的 `link.exe`），复制 `src-tauri/.cargo/config.toml.example` 为 `config.toml`，并指向本机 MSVC 的 `link.exe`（该文件已加入 `.gitignore`，不会影响 CI）。

## 构建

```bash
npm run tauri build
```

### macOS（Apple Silicon / M 芯片）

无法在 Windows 上交叉编译出可用的 Mac 安装包。任选其一：

**A. 在 M 系列 Mac 本机打包**

```bash
npm install 
python scripts/generate-dmg-assets.py   # DMG 背景图 724×464，需与 windowSize 660×400 配套
npm run tauri build -- --target aarch64-apple-darwin --bundles dmg
```

产物一般在：

- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`
- `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/`

**B. 用 GitHub Actions（仓库已含工作流）**

1. 把项目推到 GitHub
2. Actions 里手动跑 **Build macOS (Apple Silicon)**，或打 `v*` 标签触发
3. 下载产物 `grow-with-time-macos-aarch64`（ad-hoc 签名；首次打开可能仍需在“隐私与安全性”中允许）
