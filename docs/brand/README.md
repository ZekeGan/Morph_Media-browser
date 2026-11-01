# M:orph brand assets

M:orph is the product name; **Media Browser** is the subtitle and **Same data, any shape.** the tagline. The package is named `morph` (product name "Morph" for file names, because a colon cannot be used in them). The hidden `.media-viewer` folder inside managed folders is part of the portable data format, and the application's data folder in `%APPDATA%` is still `media-viewer`, so neither is renamed. The name and the artwork are covered by the [name and logo policy](../../TRADEMARK.md).

## The mark

A blocky **M** with the **colon** set in its notch (the colon is the "key : value" pair and the morph). One colour only; it never gets a gradient, shadow or outline.

| File | Use |
| --- | --- |
| `morph-mark-light.svg` | Dark ink on a light background (README, documents) |
| `morph-mark-dark.svg` | Light ink on a dark background |
| `morph-icon.svg` | Square app icon, 48 px and larger |
| `morph-icon-small.svg` | Square app icon for 16 to 32 px: bigger M, bigger colon squares, no outline |

In the app the mark is drawn by `src/BrandMark.tsx` with the surrounding text colour (`currentColor`), so it follows all three themes. The app icon is always the same near-black tile with a white mark, so the Windows taskbar looks the same whatever the theme.

## Rules

- Keep clear space of at least one colon-square (about 1/7 of the mark's width) on every side.
- Minimum size: 16 px tall for the bare mark, 16 px for the icon tile (use the small icon drawing).
- Do not recolour with theme accents, stretch, rotate, outline or put it on busy pictures.

## Regenerating the icons

`build/icon.ico` (16, 24, 32, 48, 64, 128, 256 px), `build/icon.png` (512 px) and `build/icons/*.png` are rendered from the two icon SVGs:

```bash
pnpm exec electron scripts/render-icons.cjs
```

`electron/main.ts` uses `build/icon.ico` for the taskbar and Alt+Tab icon when the file exists; packaging will use the same folder.
