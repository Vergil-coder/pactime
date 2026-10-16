# Pactime brand assets

This directory contains the Interlock symbol, outlined Instrument Serif lettering, and their production variants. Use these masters for app and project branding.

| Files | Use |
| --- | --- |
| `mark.svg`, `mark-inverse.svg` | Standard monochrome symbol |
| `mark-small.svg`, `mark-small-inverse.svg` | Optical variant for 15–20px monochrome display |
| `wordmark.svg`, `wordmark-inverse.svg` | Standalone outlined lettering |
| `logo-horizontal.svg`, `logo-horizontal-inverse.svg` | Custom split-P wordmark for the sidebar |
| `app-icon-rounded.svg` | Rounded desktop app-icon master |
| `app-icon-square.svg`, `app-icon-square.png` | Unmasked square icon source |
| `manrope.ttf`, `OFL-Manrope.txt` | Local UI font and license |
| `OFL-Instrument-Serif.txt` | Outlined lettering font license |
| `brand.json` | Name, colors, asset paths, and compatibility identifiers |
| `manifest.json` | Source hashes and generated platform assets |

Regenerate symbols and platform exports from the repository root:

```sh
node scripts/build-interlock-masters.mjs
npm run brand:assets
```

Symbol contours are defined in the first script; wordmark SVGs are source assets. Exporting does not require design software or installed system fonts. Keep the original proportions and clear space around the symbol. Use the small variant for 15–20px monochrome display and the inverse assets on dark surfaces.

## Colors

| Role | Value |
| --- | --- |
| Icon orange | `#CF542D` |
| Brand ink | `#292521` |
| Brand paper | `#EEE8DF` |
| Inverse symbol | `#FFF6EC` |
| Light UI accent | `#AE3C1B` |
| Dark UI accent | `#FC9978` |
