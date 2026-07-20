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

## 开发

需已安装 Visual Studio Build Tools（MSVC）与 Rust。

```bash
npm install
npm run tauri dev
```

若链接器冲突（Git 的 `link.exe`），确保 `src-tauri/.cargo/config.toml` 指向本机 MSVC `link.exe`。

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
