import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "memo"
  | "timer"
  | "heart"
  | "review"
  | "panel"
  | "trash"
  | "settings"
  | "today"
  | "inbox"
  | "check"
  | "layers"
  | "search"
  | "sparkle"
  | "brand"
  | "tag"
  | "bell"
  | "edit"
  | "pin"
  | "archive";

const paths: Record<AppIconName, ReactNode> = {
  memo: <><path d="M5 4.75A1.75 1.75 0 0 1 6.75 3h7.5A1.75 1.75 0 0 1 16 4.75v10.5A1.75 1.75 0 0 1 14.25 17h-7.5A1.75 1.75 0 0 1 5 15.25z" /><path d="M8 7h5M8 10h5M8 13h3" /></>,
  timer: <><circle cx="10" cy="11" r="6.5" /><path d="M10 7.5V11l2.25 1.5M8 2.5h4M14.5 5l1.5-1.5" /></>,
  heart: <path d="M10 16.5S3.75 13 3.75 8.25A3.25 3.25 0 0 1 10 7a3.25 3.25 0 0 1 6.25 1.25C16.25 13 10 16.5 10 16.5Z" />,
  review: <><path d="M4 10a6 6 0 1 0 2-4.47" /><path d="M4 4.5v4h4M10 6.5V10l2.5 1.5" /></>,
  panel: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M7.5 4v12M10.5 8h3M10.5 11h3" /></>,
  trash: <><path d="M4.5 6h11M8 3.5h4M6 6l.65 10h6.7L14 6M8.5 9v4M11.5 9v4" /></>,
  settings: <><circle cx="10" cy="10" r="2.25" /><path d="M10 3v1.25M10 15.75V17M17 10h-1.25M4.25 10H3M14.95 5.05l-.9.9M5.95 14.05l-.9.9M14.95 14.95l-.9-.9M5.95 5.95l-.9-.9" /></>,
  today: <><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M6.5 2.75v3.5M13.5 2.75v3.5M3.5 8h13M7 11h2v2H7z" /></>,
  inbox: <><path d="M4 4h12l1.5 8.5v2A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5v-2z" /><path d="M2.5 12.5h4l1 1.5h5l1-1.5h4" /></>,
  check: <><circle cx="10" cy="10" r="7" /><path d="m6.75 10 2.1 2.1 4.5-4.5" /></>,
  layers: <><path d="m10 3 7 4-7 4-7-4z" /><path d="m4.25 10 5.75 3.25L15.75 10M4.25 13l5.75 3.25L15.75 13" /></>,
  search: <><circle cx="8.75" cy="8.75" r="5.25" /><path d="m12.75 12.75 3.75 3.75" /></>,
  sparkle: <><path d="M10 2.5c.35 3.2 1.8 5.1 5 5.5-3.2.4-4.65 2.3-5 5.5-.35-3.2-1.8-5.1-5-5.5 3.2-.4 4.65-2.3 5-5.5Z" /><path d="M15.5 12.5c.15 1.4.8 2.2 2.2 2.4-1.4.2-2.05 1-2.2 2.4-.15-1.4-.8-2.2-2.2-2.4 1.4-.2 2.05-1 2.2-2.4Z" /></>,
  /** Grow with Time 品牌标：完成当下，也拾起沿途的光。 */
  brand: <>
    <path d="M14.55 3.75H5.45A2.2 2.2 0 0 0 3.25 5.95v8.6a2.2 2.2 0 0 0 2.2 2.2h8.6a2.2 2.2 0 0 0 2.2-2.2V8.1" stroke="#2F6FED" />
    <path d="m6.45 10.35 2.4 2.4 4.75-4.75" stroke="#2F6FED" />
    <path d="M16.35 2.45c.18 1.15.8 1.77 1.95 1.95-1.15.18-1.77.8-1.95 1.95-.18-1.15-.8-1.77-1.95-1.95 1.15-.18 1.77-.8 1.95-1.95Z" fill="#F4B942" stroke="none" />
  </>,
  tag: <><path d="M3.5 4.5v5l6.5 6.5 6-6-6.5-6.5z" /><circle cx="7.25" cy="7.25" r=".8" fill="currentColor" stroke="none" /></>,
  bell: <><path d="M10 2.75a4.5 4.5 0 0 1 4.5 4.5c0 3.2 1.25 4.5 1.25 4.5H4.25s1.25-1.3 1.25-4.5A4.5 4.5 0 0 1 10 2.75Z" /><path d="M8 16.2a2 2 0 0 0 4 0" /></>,
  edit: <><path d="M4 14.8 4.45 12l7.9-7.9a1.55 1.55 0 0 1 2.2 0l1.35 1.35a1.55 1.55 0 0 1 0 2.2L8 15.55z" /><path d="m11.4 5.05 3.55 3.55M10.5 16H16" /></>,
  pin: <><path d="m7 3 6 1-1 4 2 2-3 1-2 6-1-5-3-1 2-2z" /><path d="m6 14-2 2" /></>,
  archive: <><path d="M3.5 5.5h13v10h-13zM2.5 3h15v3h-15z" /><path d="M8 9h4" /></>,
};

export function AppIcon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: AppIconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
