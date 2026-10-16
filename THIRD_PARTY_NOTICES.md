# Third-party notices

Pactime's own code is provided under [GPL-3.0-only](LICENSE). Dependencies, bundled runtimes, and fonts retain their own licenses; the project's license does not replace them.

## Runtime and bundled libraries

| Component | Role | License reference |
| --- | --- | --- |
| Electron | Desktop runtime, with Chromium and Node.js | [Electron license](https://github.com/electron/electron/blob/main/LICENSE); runtime distributions include their own notices |
| React / React DOM / scheduler | Interface runtime | [React license](https://github.com/facebook/react/blob/main/LICENSE) |
| Lucide React | Interface icons | [Lucide license](https://github.com/lucide-icons/lucide/blob/main/LICENSE) |
| Zod | Data validation | [Zod license](https://github.com/colinhacks/zod/blob/main/LICENSE) |

`scripts/build-desktop.mjs` copies the installed license texts for React, React DOM, scheduler, Lucide React, and Zod into `dist-desktop/THIRD_PARTY_NOTICES.txt`, which is included in application builds. Electron's distribution also carries its runtime notices. Release verification must check those files, not treat this overview as an exhaustive dependency inventory.

## Fonts

- [Manrope — full OFL text](assets/brand/OFL-Manrope.txt): local UI font.
- [Instrument Serif — full OFL text](assets/brand/OFL-Instrument-Serif.txt): outlined brand lettering.

Development tools have their own licenses in the lockfile-resolved packages. When adding or updating dependencies or assets, preserve their notices and check that the resulting distribution remains compatible with the project's license.

## Project identity

The name, icon, and wordmark identify the Pactime project. Forks and redistributions should clearly identify their maintainer and modifications rather than imply that they are official builds. This identification guidance does not add a restriction to the code's GPL license.
