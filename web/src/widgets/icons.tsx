import type { SVGProps } from "react";

/**
 * Compact stroke icon set for the widget toolbar (24x24, currentColor).
 * Kept inline to avoid pulling an icon font / extra asset-path setup.
 */
export type IconName =
  | "layers"
  | "basemap"
  | "filter"
  | "ruler"
  | "draw"
  | "coordConvert"
  | "buffer"
  | "enrich"
  | "table"
  | "addData"
  | "share"
  | "close"
  | "target"
  | "copy"
  | "trash"
  | "check"
  | "home";

const PATHS: Record<IconName, string> = {
  layers:
    "M12 2 2 7l10 5 10-5-10-5Z M2 12l10 5 10-5 M2 17l10 5 10-5",
  basemap:
    "M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2Z M9 3v16 M15 5v16",
  filter: "M3 4h18l-7 8v6l-4 2v-8L3 4Z",
  ruler:
    "M3 8 8 3l13 13-5 5L3 8Z M7 8l1.5 1.5 M10 5l1.5 1.5 M11 12l1.5 1.5 M8 15l1.5 1.5",
  draw: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  coordConvert:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M2 12h20 M12 2c3 3 3 17 0 20 M12 2c-3 3-3 17 0 20",
  buffer:
    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 12m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0 M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  enrich: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  table:
    "M3 4h18v16H3V4Z M3 9h18 M3 14h18 M9 4v16 M15 4v16",
  addData:
    "M12 5v14 M5 12h14 M4 4h6 M4 20h6",
  share:
    "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
  close: "M6 6l12 12 M18 6 6 18",
  target:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 6v4 M12 14v4 M6 12h4 M14 12h4",
  copy:
    "M9 9h11v11H9V9Z M5 15H4V4h11v1",
  trash: "M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14",
  check: "M20 6 9 17l-5-5",
  home: "M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5 M10 21v-6h4v6",
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name].split(" M").map((seg, i) => (
        <path key={i} d={(i === 0 ? seg : "M" + seg).trim()} />
      ))}
    </svg>
  );
}
