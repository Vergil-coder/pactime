# Changelog

Changes to Pactime are listed below. Installers and version-specific notes are published through GitHub Releases when available.

## 0.3.6 — 2026-10-16

- Use Pactime names for the desktop bridge, development launch configuration, and bundled license file while keeping legacy identifiers compatible.

- Support English and Simplified Chinese in one app, with a saved language preference, translated reminders and menus, and voice reminders that follow the selected language.

- Read Mac application icon resources before falling back to the OS file icon, avoiding generic icons for some bundles.
- Add English and Simplified Chinese READMEs with macOS screenshots.
- Document installation, rule behavior, development, privacy, contributions, and security reporting.
- Prepare issue and pull-request templates and a manual Windows installer build workflow.

## 0.3.5 — 2026-10-14

### Fixed

- Windows multi-process closure no longer treats several process IDs as one value when decoding JSON in Windows PowerShell 5.1.
- PowerShell failures return readable messages and diagnostic IDs rather than full encoded commands or CLIXML. Chinese diagnostics use an ASCII-framed UTF-8 payload.
- Script failures are no longer automatically described as missing administrator permissions.
- Long historical error messages wrap inside the records page without pushing timestamps out of the window.

## Earlier development builds

The 0.3.0–0.3.4 builds established the desktop UI, application and shortcut selection, reminders and sound preferences, local persistence, and contextual Windows privilege recovery.
