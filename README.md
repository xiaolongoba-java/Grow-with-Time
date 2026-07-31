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

### v1.3.3

| 平台 | 文件 | 下载 |
|------|------|------|
| macOS（Apple Silicon，M1/M2/M3/M4） | `.dmg` | 发布后提供 |
| Windows x64 | `.exe` 安装包 | 发布后提供 |

> macOS 版本使用 ad-hoc 签名并经过构建完整性验证。由于尚未使用 Apple Developer ID 公证，首次打开时可能仍需在“系统设置 → 隐私与安全性”中选择允许打开。请直接从 GitHub Releases 下载，不要通过微信等工具二次转存。

#### v1.3.3 重点更新

- 每次启动前自动保存数据库快照，保留最近 10 个版本
- 设置页增加数据健康检查、启动备份恢复和打开数据目录
- 数据库恢复在重启阶段执行，避免运行中覆盖造成数据损坏
- 启动失败显示可读的系统错误窗口，不再静默闪退
- Windows Release 增加全新安装与已有数据库两轮启动测试
- 固化已发布 migration 契约，防止历史迁移被意外修改
- 项目创建按钮支持空名称提示与自动聚焦
- 备忘录支持 Markdown 编辑、分屏预览、任务清单、表格和代码块

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
