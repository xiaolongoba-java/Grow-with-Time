/**
 * Create or update a Gitee Release and upload installer attachments.
 *
 * Usage:
 *   GITEE_TOKEN=xxx node scripts/sync-gitee-release.mjs --tag v1.6.0 --file path/to/setup.exe
 *   GITEE_TOKEN=xxx node scripts/sync-gitee-release.mjs --tag v1.6.0 --from-github
 *
 * GitHub Actions: store GITEE_TOKEN in repository secrets.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const DEFAULT_OWNER = "xiaolong-oba";
const DEFAULT_REPO = "grow-with-time";
const GITHUB_OWNER = "xiaolongoba-java";
const GITHUB_REPO = "Grow-with-Time";

function parseArgs(argv) {
  const options = {
    tag: "",
    files: [],
    fromGithub: false,
    owner: process.env.GITEE_OWNER || DEFAULT_OWNER,
    repo: process.env.GITEE_REPO || DEFAULT_REPO,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tag") options.tag = argv[++i] ?? "";
    else if (arg === "--file") options.files.push(argv[++i] ?? "");
    else if (arg === "--from-github") options.fromGithub = true;
    else if (arg === "--owner") options.owner = argv[++i] ?? options.owner;
    else if (arg === "--repo") options.repo = argv[++i] ?? options.repo;
  }
  if (!options.tag.startsWith("v")) {
    throw new Error("--tag 必须以 v 开头，例如 v1.6.0");
  }
  if (!options.fromGithub && !options.files.length) {
    throw new Error("请指定 --file，或使用 --from-github 从 GitHub Release 镜像");
  }
  return options;
}

/** Match GitHub Release / README: Tauri keeps spaces, gh-release rewrites them to dots. */
export function normalizeInstallerName(name) {
  return basename(name).replaceAll(" ", ".");
}

export function extractReleaseNotes(version, readme = readFileSync(new URL("README.md", root), "utf8")) {
  const marker = `#### v${version}`;
  const start = readme.indexOf(marker);
  if (start < 0) return `Release v${version}`;
  const after = start + marker.length;
  const nextMarkers = ["\n#### v", "\n### v"]
    .map((token) => readme.indexOf(token, after))
    .filter((index) => index > start);
  const next = nextMarkers.length ? Math.min(...nextMarkers) : -1;
  const block = next > start ? readme.slice(start, next) : readme.slice(start, start + 4000);
  return block.replace(/^####[^\n]*\n?/, "").trim();
}

async function giteeApi(path, { token, method = "GET", body, headers = {} } = {}) {
  const url = new URL(`https://gitee.com/api/v5${path}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, {
    method,
    headers,
    body,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message ? data.message : text || response.statusText;
    throw new Error(`Gitee API ${method} ${path} 失败 (${response.status}): ${message}`);
  }
  return data;
}

async function getGithubReleaseAssets(tag) {
  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "grow-with-time-release-sync" } },
  );
  if (!response.ok) {
    throw new Error(`GitHub Release ${tag} 不存在或暂不可访问 (${response.status})`);
  }
  const release = await response.json();
  return (release.assets ?? []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
  }));
}

async function downloadToTemp(url, name) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "grow-with-time-release-sync" },
    });
  } catch (cause) {
    throw new Error(
      `下载 ${name} 失败：${cause instanceof Error ? cause.message : String(cause)}。可改用 gh release download 后 --file 上传。`,
    );
  }
  if (!response.ok) {
    throw new Error(`下载 ${name} 失败 (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { name, buffer };
}

async function ensureGiteeRelease({ token, owner, repo, tag }) {
  const version = tag.replace(/^v/, "");
  const payload = {
    tag_name: tag,
    name: tag,
    body: extractReleaseNotes(version),
    target_commitish: "main",
  };
  let existing = null;
  try {
    existing = await giteeApi(
      `/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`,
      { token },
    );
  } catch (error) {
    if (!String(error.message).includes("(404)")) throw error;
  }
  if (existing?.id) {
    try {
      await giteeApi(`/repos/${owner}/${repo}/releases/${existing.id}`, {
        token,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.warn(`更新 Gitee Release 说明失败：${error.message}`);
    }
    return existing;
  }

  return giteeApi(`/repos/${owner}/${repo}/releases`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function listAttachFiles({ token, owner, repo, releaseId }) {
  try {
    return await giteeApi(`/repos/${owner}/${repo}/releases/${releaseId}/attach_files`, { token });
  } catch (error) {
    if (String(error.message).includes("(404)")) return [];
    throw error;
  }
}

async function deleteAttachFile({ token, owner, repo, releaseId, attachId }) {
  await giteeApi(
    `/repos/${owner}/${repo}/releases/${releaseId}/attach_files/${attachId}`,
    { token, method: "DELETE" },
  );
}

async function uploadAttachFile({ token, owner, repo, releaseId, file }) {
  const form = new FormData();
  form.append("access_token", token);
  form.append("file", new Blob([file.buffer]), file.name);

  const url = new URL(
    `https://gitee.com/api/v5/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
  );
  const response = await fetch(url, { method: "POST", body: form });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message =
      typeof data === "object" && data?.message ? data.message : text || response.statusText;
    throw new Error(`上传 ${file.name} 失败 (${response.status}): ${message}`);
  }
  return data;
}

async function uploadLocalFile({ token, owner, repo, releaseId, filePath }) {
  const { readFile } = await import("node:fs/promises");
  const name = basename(filePath);
  const buffer = await readFile(filePath);
  return uploadAttachFile({ token, owner, repo, releaseId, file: { name, buffer } });
}

async function replaceAttachment(ctx, file) {
  const existing = await listAttachFiles(ctx);
  const sameInstaller = existing.filter(
    (item) => normalizeInstallerName(item.name) === file.name,
  );
  for (const item of sameInstaller) {
    await deleteAttachFile({ ...ctx, attachId: item.id });
  }
  await uploadAttachFile({ ...ctx, file });
}

async function main() {
  const token = process.env.GITEE_TOKEN;
  if (!token) {
    throw new Error("缺少 GITEE_TOKEN 环境变量。请在 Gitee 私人令牌页创建 token 并赋予 projects 权限。");
  }

  const options = parseArgs(process.argv.slice(2));
  const version = options.tag.replace(/^v/, "");
  console.log(`同步 Gitee Release：${options.owner}/${options.repo} ${options.tag}`);

  const release = await ensureGiteeRelease({
    token,
    owner: options.owner,
    repo: options.repo,
    tag: options.tag,
  });
  const ctx = {
    token,
    owner: options.owner,
    repo: options.repo,
    releaseId: release.id,
  };
  console.log(`Release #${release.id} 已就绪`);

  let files = [];
  if (options.fromGithub) {
    const assets = await getGithubReleaseAssets(options.tag);
    if (!assets.length) throw new Error(`GitHub Release ${options.tag} 没有可下载的安装包`);
    console.log(`从 GitHub 下载 ${assets.length} 个文件…`);
    const installers = assets.filter((asset) => /\.(exe|dmg)$/i.test(asset.name));
    if (!installers.length) throw new Error(`GitHub Release ${options.tag} 没有 .exe/.dmg 安装包`);
    console.log(`从 GitHub 下载 ${installers.length} 个安装包…`);
    files = await Promise.all(installers.map((asset) => downloadToTemp(asset.url, asset.name)));
  } else {
    files = await Promise.all(
      options.files.map(async (filePath) => {
        const { readFile } = await import("node:fs/promises");
        const name = basename(filePath);
        return { name, buffer: await readFile(filePath) };
      }),
    );
  }

  files = files.map((file) => ({ ...file, name: normalizeInstallerName(file.name) }));

  for (const file of files) {
    console.log(`上传 ${file.name}…`);
    await replaceAttachment(ctx, file);
    const encoded = encodeURIComponent(file.name);
    console.log(
      `  下载链接：https://gitee.com/${options.owner}/${options.repo}/releases/download/${options.tag}/${encoded}`,
    );
  }

  console.log(
    `\nGitee Release 页：https://gitee.com/${options.owner}/${options.repo}/releases/${options.tag}`,
  );
  console.log(`请在 README v${version} 下载表中补充 Gitee 链接。`);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(fileURLToPath(import.meta.url)).toLowerCase() === resolve(entry).toLowerCase();
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
