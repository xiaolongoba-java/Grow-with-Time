# Grow with Time

本地优先的任务管理桌面端（Tauri 2 + React + SQLite）。

## 功能概览

- 四维视图 / 看板 / 日历、标签、智能列表、NLP 快速输入
- 子任务进度、重复任务、附件、回收站
- 托盘常驻、开机自启、系统提醒、全局快捷键 `Ctrl/Cmd+Shift+N`
- 专注番茄钟、习惯追踪、生产力复盘、Karma/连击
- 循环提醒与事项倒计时（桌面浮窗、系统通知）
- JSON / CSV 导入导出备份
- AI 拆解与智能排期（设置中配置 OpenAI 兼容 API Key；未配置则禁用）
- 任务生命周期、依赖关系、完成标准、精力等级与实际耗时
- 我的⼀天早间规划/晚间复盘、项目目标与里程碑、参数化模板
- 命令面板、通知中心、批量操作与完整数据备份
- 今日计划预览、可锁定智能排程、逐项晚间收尾
- 可拖拽时间轴入口与高对比深色模式

不做：云同步、在线协作。

## 下载

最新版本：[Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/latest)

### v1.4.1

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | [Grow.with.Time_1.4.1_aarch64.dmg](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.4.1/Grow.with.Time_1.4.1_aarch64.dmg) |
| Windows x64 | `.exe` 安装包 | [Grow.with.Time_1.4.1_x64-setup.exe](https://github.com/xiaolongoba-java/Grow-with-Time/releases/download/v1.4.1/Grow.with.Time_1.4.1_x64-setup.exe) |

> macOS 版本使用 ad-hoc 签名并经过构建完整性验证。由于尚未使用 Apple Developer ID 公证，首次打开时可能仍需在“系统设置 → 隐私与安全性”中选择允许打开。请直接从 GitHub Releases 下载，不要通过微信等工具二次转存。

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

> macOS 安装包未签名，首次打开若被拦截，请在「系统设置 → 隐私与安全性」中允许。

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
3. 下载产物 `grow-with-time-macos-aarch64`（未签名；首次打开可能需在「隐私与安全性」里允许）
