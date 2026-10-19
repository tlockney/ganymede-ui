// Line icons drawn on a 20px grid to sit next to SF Symbols.
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

type P = SVGProps<SVGSVGElement>;

export const SidebarIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="3" />
    <path d="M8 3.5v13M4.5 6.5h1.5M4.5 9h1.5" />
  </svg>
);
export const PlayIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 4.5v11l9-5.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const ForwardIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 5v10l6.5-5zM10.5 5v10l6.5-5z" fill="currentColor" stroke="none" />
  </svg>
);
export const StopIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor" stroke="none" />
  </svg>
);
export const RestartIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" />
    <path d="M14.5 2.8v3.6h-3.6" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 4.5v11M4.5 10h11" />
  </svg>
);
export const TextIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5h12M4 9.5h12M4 13.5h7" />
  </svg>
);
export const CodeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M7.5 6 3.5 10l4 4M12.5 6l4 4-4 4" />
  </svg>
);
export const SaveIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h7.4l3.1 3.1v7.4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 14.5z" />
    <path d="M7 4v3.5h5V4M7 16v-4.5h6V16" />
  </svg>
);
export const DownloadIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
    <path d="M4 13.5v1A2.5 2.5 0 0 0 6.5 17h7a2.5 2.5 0 0 0 2.5-2.5v-1" />
  </svg>
);
export const NotebookIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="2.5" width="12" height="15" rx="2.5" />
    <path d="M7.5 6.5h5M7.5 9.5h5M7.5 12.5h3" />
  </svg>
);
export const FolderIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 6A1.5 1.5 0 0 1 4 4.5h3.3l1.7 1.8h7A1.5 1.5 0 0 1 17.5 7.8v6.7a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
);
export const FileIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 2.5h6.5L15 6v10a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V4a1.5 1.5 0 0 1 1-1.5z" />
    <path d="M11.5 2.5V6H15" />
  </svg>
);
export const ChevronLeftIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.5 6.5 10l5.5 5.5" />
  </svg>
);
export const ComposeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3.5H5.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11" />
    <path d="m14.2 3.3 2.5 2.5L10 12.5l-3.2.7.7-3.2z" />
  </svg>
);
export const ServerIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3.5" width="14" height="5.5" rx="1.8" />
    <rect x="3" y="11" width="14" height="5.5" rx="1.8" />
    <path d="M6 6.25h.01M6 13.75h.01" strokeWidth="2.2" />
  </svg>
);
export const BrowserIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
    <path d="M2.5 7.5h15M5 5.5h.01M7 5.5h.01" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
  </svg>
);
export const PowerIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 3v6.5" />
    <path d="M6.2 5.6a6 6 0 1 0 7.6 0" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 2.75 4 5v4.5c0 3.6 2.5 6.4 6 7.75 3.5-1.35 6-4.15 6-7.75V5z" />
    <path d="m7.5 10 1.75 1.75L12.75 8.25" />
  </svg>
);
export const KeyboardIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="5" width="15" height="10" rx="2" />
    <path d="M5.5 8h.01M8.5 8h.01M11.5 8h.01M14.5 8h.01M5.5 11h.01M14.5 11h.01M8 11.5h4" />
  </svg>
);
