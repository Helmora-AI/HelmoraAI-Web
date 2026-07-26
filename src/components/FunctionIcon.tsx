import type { ReactNode } from "react";

export const FUNCTION_ICON_NAMES = [
  "chat",
  "conversations",
  "research",
  "tools",
  "overview",
  "providers",
  "routes",
  "tasks",
  "memory",
  "files",
  "knowledge",
  "api-keys",
  "usage",
  "audit",
  "runtime",
] as const;

export type FunctionIconName = (typeof FUNCTION_ICON_NAMES)[number];

const ICONS: Record<FunctionIconName, ReactNode> = {
  chat: <>
    <path d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H11l-4.5 3v-3h-1a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </>,
  conversations: <>
    <path d="M8 6h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-5l-3.5 2.5V16H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
    <path d="M6 9H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1v2l2.5-2H10" />
  </>,
  research: <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m14.8 9.2-1.5 4.1-4.1 1.5 1.5-4.1 4.1-1.5Z" />
  </>,
  tools: <>
    <path d="M14.4 6.2a4 4 0 0 0-5.1 5.1L4 16.6 7.4 20l5.3-5.3a4 4 0 0 0 5.1-5.1l-2.4 2.4-3.4-3.4 2.4-2.4Z" />
    <path d="m5.7 17.7.1.1" />
  </>,
  overview: <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="4" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
  </>,
  providers: <>
    <path d="M8 4v5M16 4v5M6 9h12v2a6 6 0 0 1-6 6v3" />
    <path d="M9 20h6" />
  </>,
  routes: <>
    <circle cx="5" cy="6" r="2" />
    <circle cx="19" cy="6" r="2" />
    <circle cx="12" cy="18" r="2" />
    <path d="M7 6h4a3 3 0 0 1 3 3v1M17 6h-1a2 2 0 0 0-2 2v2M12 16v-2a4 4 0 0 1 4-4h1" />
  </>,
  tasks: <>
    <path d="M8 5H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H16" />
    <path d="M9 3h6a1 1 0 0 1 1 1v3H8V4a1 1 0 0 1 1-1ZM8 13l2.5 2.5L16 10" />
  </>,
  memory: <>
    <path d="M9.5 4.2A3.2 3.2 0 0 0 5 7.1a3.3 3.3 0 0 0-1 5.8A3.4 3.4 0 0 0 7 18a3 3 0 0 0 5-2.2V7a3 3 0 0 0-2.5-2.8Z" />
    <path d="M14.5 4.2A3.2 3.2 0 0 1 19 7.1a3.3 3.3 0 0 1 1 5.8A3.4 3.4 0 0 1 17 18a3 3 0 0 1-5-2.2M8 9a3 3 0 0 1-3-1.9M16 9a3 3 0 0 0 3-1.9M8.5 14.5A3.5 3.5 0 0 0 12 11M15.5 14.5A3.5 3.5 0 0 1 12 11" />
  </>,
  files: <>
    <path d="M3.5 7.5h6l2-2h7a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z" />
    <path d="M3.5 10h17" />
  </>,
  knowledge: <>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z" />
  </>,
  "api-keys": <>
    <circle cx="8.5" cy="12" r="4" />
    <path d="M12.5 12H21M17 12v3M20 12v2" />
  </>,
  usage: <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>,
  audit: <>
    <path d="M12 3 19 6v5.2c0 4.3-2.9 7.6-7 9.8-4.1-2.2-7-5.5-7-9.8V6l7-3Z" />
    <path d="m8.5 12 2.2 2.2 4.8-4.8" />
  </>,
  runtime: <>
    <rect x="3.5" y="4" width="17" height="6" rx="2" />
    <rect x="3.5" y="14" width="17" height="6" rx="2" />
    <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
  </>,
};

export function FunctionIcon({ name, size = 16, className }: { name: FunctionIconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className ? `function-icon ${className}` : "function-icon"}
      data-function-icon={name}
      focusable="false"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      {ICONS[name]}
    </svg>
  );
}
