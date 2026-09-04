import { getVersion } from "@tauri-apps/api/app";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export type VersionUpdate = {
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string | null;
  source: "GitHub" | "Gitee";
};

type ReleasePayload = {
  tag_name?: string;
  name?: string;
  body?: string;
  html_url?: string;
  published_at?: string;
  created_at?: string;
};

const SOURCES = [
  {
    name: "GitHub" as const,
    api: "https://api.github.com/repos/xiaolongoba-java/Grow-with-Time/releases/latest",
    page: "https://github.com/xiaolongoba-java/Grow-with-Time/releases/latest",
  },
  {
    name: "Gitee" as const,
    api: "https://gitee.com/api/v5/repos/xiaolong-oba/grow-with-time/releases/latest",
    page: "https://gitee.com/xiaolong-oba/grow-with-time/releases",
  },
];

export function normalizeVersion(version: string): number[] {
  const clean = version.trim().replace(/^v/i, "").split("-")[0];
  return clean.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(latest: string, current: string): boolean {
  const left = normalizeVersion(latest);
  const right = normalizeVersion(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function checkForVersionUpdate(): Promise<VersionUpdate | null> {
  const currentVersion = await getVersion();
  let lastError: unknown = null;
  for (const source of SOURCES) {
    try {
      const response = await tauriFetch(source.api, {
        headers: { Accept: "application/json" },
        connectTimeout: 8_000,
      });
      if (!response.ok) throw new Error(`${source.name} 返回 ${response.status}`);
      const release = await response.json() as ReleasePayload;
      const latestVersion = (release.tag_name ?? release.name ?? "").replace(/^v/i, "");
      if (!latestVersion) throw new Error(`${source.name} 未返回版本号`);
      if (!isNewerVersion(latestVersion, currentVersion)) return null;
      return {
        currentVersion,
        latestVersion,
        releaseName: release.name || `v${latestVersion}`,
        releaseNotes: release.body?.trim() || "新版本已经发布，建议前往发布页查看更新内容。",
        releaseUrl: release.html_url || source.page,
        publishedAt: release.published_at || release.created_at || null,
        source: source.name,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("暂时无法连接版本服务");
}
