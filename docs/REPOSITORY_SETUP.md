# Grow with Time — 仓库创建信息

创建 Gitee / GitHub 仓库时，可直接复制下方内容。

---

## 基本信息

| 字段 | 建议填写 |
|------|----------|
| **仓库名称** | `grow-with-time` |
| **仓库路径** | `grow-with-time`（与名称一致即可） |
| **可见性** | 私有（个人使用）或 公开（开源分享） |
| **默认分支** | `main` |
| **是否初始化 README** | **否**（本地已有 README，避免冲突） |
| **是否添加 .gitignore** | **否**（项目已含 `.gitignore`） |
| **是否选择 License** | 可选 MIT（见下文） |

---

## 仓库简介（一句话，≤250 字）

```
Grow with Time（日进·拾光）— 本地优先的个人成长与行动桌面端。Tauri 2 + React + SQLite，支持今日执行、目标习惯、专注提醒与拾光记录，数据存本机，无需账号。
```

### 英文简介（GitHub 可选）

```
Grow with Time — Local-first personal growth & task desktop app (Tauri 2, React, SQLite). Tasks, habits, focus, and journaling stay on your device.
```

---

## 详细描述（Gitee「项目介绍」/ README 摘要）

```
日进·拾光（Grow with Time）是一款注重隐私与专注的本地个人成长工具，数据默认保存在本机 SQLite，不依赖云同步。

主要功能：
· 今日执行、「我的一天」、智能排程与晚间收尾
· 任务、项目、标签、模板、番茄钟与系统提醒
· 长期目标、习惯打卡、年度热点图与成就
· 拾念 / 今日拾光 / 备忘录 / 拾光变迁
· 托盘常驻、全局快捷键、桌面组件与 JSON/CSV 备份

技术栈：Tauri 2 · React 19 · TypeScript · Zustand · SQLite

支持平台：Windows x64、macOS Apple Silicon（需在 Mac 或 GitHub Actions 构建）
```

---

## 标签 / Topics（可选）

```
tauri
react
typescript
todo
task-manager
pomodoro
productivity
desktop-app
sqlite
local-first
```

中文标签（Gitee）：

```
待办
时间管理
番茄钟
桌面应用
本地优先
```

---

## 项目属性

| 属性 | 值 |
|------|-----|
| **主语言** | TypeScript |
| **其他语言** | Rust、CSS |
| **应用名称** | Grow with Time |
| **版本** | 1.0.0 |
| **Bundle ID** | `com.minimal.todo` |
| **npm 包名** | `minimal-todo`（内部标识，对外品牌为 Grow with Time） |

---

## License（若需开源）

推荐：**MIT License**

```
Copyright (c) 2026 Grow with Time

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 首次推送到 Gitee

在 Gitee 创建**空仓库**后，在项目根目录执行（将 `你的用户名` 换成实际 Gitee 用户名）：

```bash
cd e:/AI/todo

git init
git branch -M main
git add .
git commit -m "Initial commit: Grow with Time v1.0.0"

git remote add origin https://gitee.com/你的用户名/grow-with-time.git
git push -u origin main
```

使用 SSH：

```bash
git remote add origin git@gitee.com:你的用户名/grow-with-time.git
git push -u origin main
```

---

## 不应提交的文件（已在 .gitignore）

- `node_modules/`
- `dist/`
- `src-tauri/target/`（Rust 编译产物，体积大）
- `*.local`
- `.DS_Store`

**注意：** 不要提交 `.env`、API Key、个人数据库备份。当前项目无默认 `.env`，若后续添加请加入 `.gitignore`。

---

## macOS 安装包说明（写入 Release 说明时可复用）

Gitee **无法**在云端构建 macOS（M 芯片）安装包。Release 附件需：

1. 在 **M 系列 Mac** 上执行：`npm run tauri build -- --target aarch64-apple-darwin`
2. 或代码同步到 **GitHub**，用 Actions 工作流 `.github/workflows/build-macos.yml` 构建后，将 `.dmg` 上传到 Gitee Release

Release 标题示例：`v1.0.0 — Grow with Time`

Release 说明模板：

```markdown
## Grow with Time v1.0.0

### Windows
- 安装包：`Grow with Time_1.0.0_x64-setup.exe`（需自行在 Windows 上 `npm run tauri build` 生成）

### macOS (Apple Silicon)
- 安装包：`.dmg`（需在 Mac 或 GitHub Actions 构建，见 README）

### 说明
- 首次打开 macOS 未签名包时，请在「系统设置 → 隐私与安全性」中允许运行。
```

---

## Gitee 网页创建步骤（简要）

1. 登录 [gitee.com](https://gitee.com) → **右上角 +** → **新建仓库**
2. 仓库名称填：`grow-with-time`
3. 路径填：`grow-with-time`
4. 简介粘贴上文「仓库简介」
5. **不要**勾选「使用 Readme 文件初始化仓库」
6. 可见性按需选择 → **创建**
7. 按上文「首次推送」命令上传本地代码

---

## 可选：同步到 GitHub（用于 Mac 自动打包）

```bash
git remote add github https://github.com/你的用户名/grow-with-time.git
git push -u github main
```

推送 tag 可触发 macOS 构建：

```bash
git tag v1.0.0
git push origin v1.0.0
git push github v1.0.0
```
