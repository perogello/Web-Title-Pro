const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export const EditIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const SaveIcon = () => (
  <svg {...iconProps}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
);

export const ChevronUpIcon = () => (
  <svg {...iconProps}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export const ChevronDownIcon = () => (
  <svg {...iconProps}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const PlayIcon = () => (
  <svg {...iconProps}>
    <path d="m8 5 11 7-11 7z" />
  </svg>
);

export const PauseIcon = () => (
  <svg {...iconProps}>
    <path d="M10 4H6v16h4z" />
    <path d="M18 4h-4v16h4z" />
  </svg>
);

export const ResetIcon = () => (
  <svg {...iconProps}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 3v6h6" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </svg>
);

export const GripIcon = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg {...iconProps}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...iconProps}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const PaletteIcon = () => (
  <svg {...iconProps}>
    <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 3.5-4 3.5h-1.5a1.5 1.5 0 0 0-1 2.6 1.5 1.5 0 0 1-1 2.6Z" />
    <circle cx="7.5" cy="11" r="1" fill="currentColor" />
    <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    <circle cx="16.5" cy="11" r="1" fill="currentColor" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...iconProps}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const CopyIcon = () => (
  <svg {...iconProps}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...iconProps}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);
