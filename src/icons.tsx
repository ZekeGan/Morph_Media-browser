import type { ReactNode } from 'react'

const paths = {
  book: (
    <>
      <path d="M10 4C7 2 4 2 2 3v13c3-1 5 0 8 2 3-2 5-3 8-2V3c-2-1-5-1-8 1Z" />
      <path d="M10 4v14" />
    </>
  ),
  game: (
    <>
      <path d="M6 6h8c3 0 5 9 3 10-1 1-3-2-4-3H7c-1 1-3 4-4 3-2-1 0-10 3-10Z" />
      <path d="M5 9v4m-2-2h4m6-1h.1m3 2h.1" />
    </>
  ),
  music: (
    <>
      <path d="M8 14V4l9-2v10M8 7l9-2" />
      <ellipse cx="5" cy="15" rx="3" ry="2" />
      <ellipse cx="14" cy="13" rx="3" ry="2" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="4" width="11" height="12" rx="2" />
      <path d="m13 8 5-3v10l-5-3Z" />
    </>
  ),
  folder: <path d="M2 5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />,
  'folder-go': (
    <>
      <path d="M9 17H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" />
      <path d="M10 14h8m-3-3 3 3-3 3" />
    </>
  ),
  'folder-settings': (
    <>
      <path d="M9 17H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v2" />
      <circle cx="14" cy="14" r="3" />
      <path d="M14 10v1m0 6v1m-4-4h1m6 0h1m-7-3 1 1m4 4 1 1m0-6-1 1m-4 4-1 1" />
    </>
  ),
  image: (
    <>
      <rect x="2" y="3" width="16" height="14" rx="1" />
      <circle cx="6" cy="7" r="1" />
      <path d="m2 15 5-5 4 4 3-3 4 4" />
    </>
  ),
  file: (
    <>
      <path d="M4 2h8l4 4v12H4Z" />
      <path d="M12 2v5h4" />
    </>
  ),
  home: (
    <>
      <path d="m2 9 8-7 8 7M4 8v10h12V8" />
      <path d="M8 18v-6h4v6" />
    </>
  ),
  settings: (
    <>
      <path d="m8 2-.5 2-2 .8-1.8-.6-2 3.5L3.2 9v2l-1.5 1.3 2 3.5 1.8-.6 2 .8.5 2h4l.5-2 2-.8 1.8.6 2-3.5-1.5-1.3V9l1.5-1.3-2-3.5-1.8.6-2-.8-.5-2Z" />
      <circle cx="10" cy="10" r="2.7" />
    </>
  ),
  sliders: (
    <>
      <path d="M2 5h16M2 10h16M2 15h16M6 3v4M14 8v4M8 13v4" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4.5 4.5" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7h9a5 5 0 0 1 0 10H8M3 7l4-4M3 7l4 4" />
    </>
  ),
  redo: (
    <>
      <path d="M17 7H8a5 5 0 0 0 0 10h4m5-10-4-4m4 4-4 4" />
    </>
  ),
  flag: <path d="M5 17.5V3m0 0h10l-2.5 3.5L15 10H5" />,
  plus: <path d="M3 10h14M10 3v14" />,
  minus: <path d="M3 10h14" />,
  eye: (
    <>
      <path d="M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10Z" />
      <circle cx="10" cy="10" r="2.5" />
      <path d="m3 3 14 14" />
    </>
  ),
  close: <path d="m5 5 10 10M15 5 5 15" />,
  maximize: <rect x="4" y="4" width="12" height="12" rx="1" />,
  restore: (
    <>
      <rect x="3" y="6" width="11" height="11" rx="1" />
      <path d="M6 6V3h11v11h-3" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <path d="M7 3v14" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="2" y="3" width="16" height="14" rx="2" />
      <path d="M13 3v14" />
    </>
  ),
  heart: <path d="M10 17 3 10C-1 5 5-1 10 5c5-6 11 0 7 5Z" />,
  help: (
    <>
      <circle cx="10" cy="10" r="8" />
      <path d="M7.7 7a2.4 2.4 0 0 1 4.6 1c0 1.4-2.3 1.5-2.3 3M10 14v.1" />
    </>
  ),
  more: (
    <>
      <circle cx="4" cy="10" r=".8" />
      <circle cx="10" cy="10" r=".8" />
      <circle cx="16" cy="10" r=".8" />
    </>
  ),
  edit: (
    <>
      <path d="m12 3 5 5-9 9-6 1 1-6Z" />
      <path d="m10 5 5 5" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="1" />
      <path d="M3 10h14M10 3v14" />
    </>
  ),
  list: (
    <>
      <path d="M7 5h10M7 10h10M7 15h10M3 5h.1M3 10h.1M3 15h.1" />
    </>
  ),
  tree: (
    <>
      <path d="M5 5v10M5 10h7M12 5v10" />
      <rect x="2" y="2" width="6" height="4" rx="1" />
      <rect x="12" y="2" width="6" height="4" rx="1" />
      <rect x="12" y="14" width="6" height="4" rx="1" />
    </>
  ),
  refresh: (
    <>
      <path d="M3 8a7 7 0 1 1 1 7M3 3v5h5" />
    </>
  ),
  'arrow-left': <path d="M17 10H3m6-6-6 6 6 6" />,
  'arrow-right': <path d="M3 10h14m-6-6 6 6-6 6" />,
  'arrow-up': <path d="M10 17V3M4 9l6-6 6 6" />,
  'chevron-left': <path d="m12 4-6 6 6 6" />,
  'chevron-right': <path d="m8 4 6 6-6 6" />,
  check: <path d="m4 10 4 4 8-8" />,
  focus: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
  play: <path d="m7 3 10 7-10 7Z" />,
  pause: (
    <>
      <path d="M6 4v12M14 4v12" />
    </>
  ),
  volume: (
    <>
      <path d="M3 8h3l5-4v12l-5-4H3ZM14 7a5 5 0 0 1 0 6M16 4a9 9 0 0 1 0 12" />
    </>
  ),
  muted: (
    <>
      <path d="M3 8h3l5-4v12l-5-4H3ZM14 7l5 6M19 7l-5 6" />
    </>
  ),
  previous: (
    <>
      <path d="M4 4v12m12-12-9 6 9 6Z" />
    </>
  ),
  next: (
    <>
      <path d="M16 4v12M4 4l9 6-9 6Z" />
    </>
  ),
  captions: (
    <>
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <path d="M8 8H5v4h3m7-4h-3v4h3" />
    </>
  ),
  rewind: (
    <>
      <path d="M4 7a7 7 0 1 1-1 6M4 3v5h5" />
      <path d="M8 10v4m3-4h3v4h-3Z" />
    </>
  ),
  'fast-forward': (
    <>
      <path d="M16 7a7 7 0 1 0 1 6m-1-10v5h-5" />
      <path d="M8 10v4m3-4h3v4h-3Z" />
    </>
  ),
  'auto-next': (
    <>
      <path d="m8 6 6 4-6 4ZM4 3h10a4 4 0 0 1 4 4M16 1l-2 2 2 2M16 17H6a4 4 0 0 1-4-4m2 2 2 2-2 2" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M8 3v14M8 9h9" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths
export const projectIconName = (category?: string): IconName =>
  category === 'media'
    ? 'grid'
    : category === 'game'
      ? 'game'
      : category === 'music'
        ? 'music'
        : category === 'video'
          ? 'video'
          : category === 'manga'
            ? 'book'
            : category === 'album'
              ? 'image'
              : 'folder'
export function Icon({
  name,
  size = 18,
  filled = false,
  className = '',
}: {
  name: IconName
  size?: number
  filled?: boolean
  className?: string
}) {
  return (
    <svg
      className={'app-icon ' + className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
