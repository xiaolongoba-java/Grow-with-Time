# Grow with Time

**Grow with Time** 是一款本地优先的个人任务管理桌面应用。它不只记录“要做什么”，还把长期目标、今日计划、专注执行、可靠提醒和每日复盘连接成一条完整路径，帮助你持续完成真正重要的事情。

应用基于 Tauri 2、React 与 SQLite 构建，任务和个人记录默认保存在本机。无需注册账号，也不依赖持续联网。

> 产品定位：面向个人的轻量执行系统，而不是多人协作或重型项目管理平台。

## 为什么使用 Grow with Time

很多待办工具擅长收集，却没有解决“今天到底应该先做什么”。Grow with Time 围绕日常执行设计：

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
- 浅色、深色及跟随系统主题
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
