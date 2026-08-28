import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const tauri = JSON.parse(readFileSync(new URL("src-tauri/tauri.conf.json", root), "utf8"));
const cargo = readFileSync(new URL("src-tauri/Cargo.toml", root), "utf8");
const readme = readFileSync(new URL("README.md", root), "utf8");
const migrationTest = readFileSync(new URL("src/lib/migration.test.ts", root), "utf8");
const backupTest = readFileSync(new URL("src/lib/backup.test.ts", root), "utf8");

const failures = [];
if (pkg.version !== tauri.version) failures.push(`package.json (${pkg.version}) 与 tauri.conf.json (${tauri.version}) 版本不一致`);
if (!cargo.includes(`version = "${pkg.version}"`)) failures.push("Cargo.toml 版本未同步");
if (!readme.includes(`v${pkg.version}`)) failures.push("README 缺少当前版本说明");
if (!/^[\x20-\x7E]+$/.test(String(tauri.productName ?? ""))) {
  failures.push(`productName 必须为 ASCII（当前: ${tauri.productName}），否则安装包文件名会被剥空`);
}
if (!String(tauri.productName ?? "").includes("Grow with Time")) {
  failures.push('productName 应包含 "Grow with Time"，以保持安装包命名稳定');
}
if (!migrationTest.includes("future_letters") || !migrationTest.includes("anniversaries")) {
  failures.push("migration 测试未覆盖未来信 / 纪念日");
}
if (
  !backupTest.includes("daily_reflections") ||
  !backupTest.includes("inspirations") ||
  !backupTest.includes("future_letters") ||
  !backupTest.includes("anniversaries")
) {
  failures.push("备份测试未覆盖完整拾光数据");
}
if (tauri.bundle?.windows?.webviewInstallMode?.type !== "skip") {
  failures.push("Windows 安装包不得捆绑或下载 WebView2（webviewInstallMode 必须为 skip）");
}
if (tauri.bundle?.windows?.nsis?.template) {
  failures.push("Windows 安装包应使用 Tauri 标准 NSIS 模板，避免自定义安装壳依赖");
}

if (failures.length) {
  console.error(`发布检查失败：\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`发布静态检查通过：v${pkg.version} · README / Cargo / Tauri / 拾光迁移与备份覆盖一致`);

const cargoCheck = spawnSync(
  "cargo",
  ["check", "--manifest-path", "src-tauri/Cargo.toml"],
  {
    cwd: fileURLToPath(root),
    stdio: "inherit",
    shell: false,
    // A clean CI checkout intentionally has neither dist/ nor the generated
    // widget sidecar yet. Source validation must not require bundle outputs;
    // `tauri build` runs the real beforeBuildCommand and validates both later.
    env: {
      ...process.env,
      TAURI_CONFIG: JSON.stringify({
        bundle: { resources: [], externalBin: [] },
      }),
    },
  },
);
if (cargoCheck.error) {
  console.error(`发布检查失败：无法启动 cargo check（${cargoCheck.error.message}）`);
  process.exit(1);
}
if (cargoCheck.status !== 0) {
  console.error("发布检查失败：cargo check 未通过");
  process.exit(1);
}
console.log("cargo check 通过");
