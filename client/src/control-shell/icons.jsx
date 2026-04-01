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

export const StopwatchIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="13" r="7" />
    <path d="M12 13V9" />
    <path d="M12 13l3 2" />
    <path d="M9 3h6" />
    <path d="M12 3v3" />
  </svg>
);

export const ZoomIcon = () => (
  <svg {...iconProps}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.2-4.2" />
    <path d="M11 8v6" />
    <path d="M8 11h6" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...iconProps}>
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg {...iconProps}>
    <path d="M3 3l18 18" />
    <path d="M10.7 5.1A11.5 11.5 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-4 4.9" />
    <path d="M6.6 6.6A18.2 18.2 0 0 0 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1" />
    <path d="M9.5 9.5A3.5 3.5 0 0 0 14.5 14.5" />
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

export const FolderIcon = () => (
  <svg {...iconProps}>
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M3 10h18" />
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
    <path d="m15 18-6-6-6 6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...iconProps}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
