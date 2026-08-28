import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

if (process.platform !== "win32") process.exit(0);

const triple = process.arch === "arm64"
  ? "aarch64-pc-windows-msvc"
  : "x86_64-pc-windows-msvc";
const cargo = process.env.CARGO ?? "cargo";
const build = spawnSync(
  cargo,
  ["build", "--manifest-path", "src-tauri/Cargo.toml", "--bin", "widget-host", "--release"],
  { cwd: resolve("."), stdio: "inherit", shell: false },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const source = resolve("src-tauri", "target", "release", "widget-host.exe");
const target = resolve("src-tauri", "binaries", `widget-host-${triple}.exe`);
if (!existsSync(source)) throw new Error(`widget-host build output missing: ${source}`);
mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`widget-host prepared: ${target}`);
