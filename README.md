# Grow with Time

本地优先的任务管理桌面端（Tauri 2 + React + SQLite）。

## 功能概览

- 四维视图 / 看板 / 日历、标签、智能列表、NLP 快速输入
- 子任务进度、重复任务、附件、回收站
- 托盘常驻、开机自启、系统提醒、全局快捷键 `Ctrl/Cmd+Shift+N`
- 专注番茄钟、习惯追踪、生产力复盘、Karma/连击
- JSON / CSV 导入导出备份
- AI 拆解与智能排期（设置中配置 OpenAI 兼容 API Key；未配置则禁用）

不做：云同步、在线协作。

## 下载

最新版本：[Releases](https://github.com/xiaolongoba-java/Grow-with-Time/releases/latest)

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
npm run tauri build -- --target aarch64-apple-darwin
```

产物一般在：

- `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`
- `src-tauri/target/aarch64-apple-darwin/release/bundle/macos/`

**B. 用 GitHub Actions（仓库已含工作流）**

1. 把项目推到 GitHub
2. Actions 里手动跑 **Build macOS (Apple Silicon)**，或打 `v*` 标签触发
3. 下载产物 `grow-with-time-macos-aarch64`（未签名；首次打开可能需在「隐私与安全性」里允许）
