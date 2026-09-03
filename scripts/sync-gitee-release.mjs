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
import { basename } from "node:path";
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

function extractReleaseNotes(version) {
  const readme = readFileSync(new URL("README.md", root), "utf8");
  const marker = `#### v${version}`;
  const start = readme.indexOf(marker);
  if (start < 0) return `Release v${version}`;
  const next = readme.indexOf("\n#### v", start + marker.length);
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
  const response = await fetch(url, {
    headers: { "User-Agent": "grow-with-time-release-sync" },
  });
  if (!response.ok) {
    throw new Error(`下载 ${name} 失败 (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { name, buffer };
}

async function ensureGiteeRelease({ token, owner, repo, tag }) {
  const version = tag.replace(/^v/, "");
  try {
    return await giteeApi(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`, {
      token,
    });
  } catch (error) {
    if (!String(error.message).includes("(404)")) throw error;
  }

  return giteeApi(`/repos/${owner}/${repo}/releases`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body: extractReleaseNotes(version),
      target_commitish: "main",
    }),
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
  const sameName = existing.filter((item) => item.name === file.name);
  for (const item of sameName) {
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
    files = await Promise.all(assets.map((asset) => downloadToTemp(asset.url, asset.name)));
  } else {
    files = await Promise.all(
      options.files.map(async (filePath) => {
        const { readFile } = await import("node:fs/promises");
        const name = basename(filePath);
        return { name, buffer: await readFile(filePath) };
      }),
    );
  }

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

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
