<p align="center">
  <img src="assets/brand/app-icon-rounded.svg" width="80" height="80" alt="Pactime icon">
</p>
<h1 align="center">Pactime</h1>
<p align="center"><strong>Daily app limits for Windows and macOS.</strong></p>
<p align="center">Free and open source · Runs locally</p>
<p align="center">
  <a href="https://github.com/Vergil-coder/pactime/releases"><img src="https://img.shields.io/github/v/release/Vergil-coder/pactime?include_prereleases" alt="Latest release, including previews"></a>
  <a href="https://github.com/Vergil-coder/pactime/stargazers"><img src="https://img.shields.io/github/stars/Vergil-coder/pactime" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-2563eb" alt="License: GPL-3.0-only"></a>
  <a href="#download"><img src="https://img.shields.io/badge/macOS-Apple_Silicon-222222?logo=apple&amp;logoColor=white" alt="macOS: Apple Silicon"></a>
  <a href="#download"><img src="https://img.shields.io/badge/Windows-x64-0078d4" alt="Windows: x64"></a>
</p>
<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a><br>
  <a href="#download">Download &amp; install</a> ·
  <a href="#get-started">How it works</a> ·
  <a href="#faq">FAQ</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

Pactime limits how long desktop apps can run each day. Set an allowance, such as two hours, and it tracks running time in the background and closes the app when time is up. A closing delay of up to 30 minutes leaves time to save work or finish a task.

It works with games, video players, social apps, and other desktop software. No account is needed.

> Early preview. The interface supports English and Simplified Chinese. Change the language in Settings. App compatibility on Windows and Mac is still being tested. Save any work before trying it: forced closure can lose unsaved changes.

## Screenshots

| Light | Dark |
| --- | --- |
| ![Pactime application limits in light mode](assets/screenshots/apps-light.png) | ![Pactime application limits in dark mode](assets/screenshots/apps-dark.png) |

Screenshots show the Simplified Chinese interface on macOS with sample usage and allowances.

## Features

- Set a daily allowance for each app. Multiple processes covered by one rule share a timer.
- Keep rules and usage locally across restarts. Allowances reset at local midnight.
- Include related processes that Pactime has identified, or add the actual executable as a separate rule.
- Control popups and sound separately. Choose the default voice, a soft tone, a standard tone, or silence.
- Choose light, dark, or system appearance. Follow the system language or select English or Simplified Chinese.

## Download

Visit [Releases](https://github.com/Vergil-coder/pactime/releases) and expand **Assets** for the version you want to download. If no public installer is available yet, [run Pactime from source](#development).

| Platform | Requirements | Files |
| --- | --- | --- |
| Windows | Windows 10/11, x64 | `.exe` installer or full application `.zip` |
| macOS | macOS 12+, Apple Silicon | `.dmg` or application `.zip` |

Builds for Intel Mac, Linux, iOS, and Android are not currently available.

Extract the entire Windows ZIP before running it. Data stays in the local application data directory. GitHub's **Source code** downloads contain the source files. Current Windows builds have no Authenticode signature. Mac builds are ad-hoc signed and not notarized. Check the download source and release notes if the OS blocks the app, and keep OS security protections enabled.

## Get started

1. Open Pactime and choose **Add app**.
2. Select a running app, browse for it, or drag in a supported file. Windows accepts `.exe` and `.lnk`; Mac accepts `.app`.
3. Set a daily allowance and closing delay. For a first try, use an app with no unsaved work, a one-minute allowance, and no delay.
4. Closing the main window leaves Pactime running in the tray or menu bar.

**Before adding a rule:** installed builds keep running and enable startup at login while any rules exist. The normal Quit command is unavailable during that time. Increasing an allowance, extending the closing delay, or removing a rule takes effect the next day. Stricter changes, such as reducing an allowance, apply immediately. Disabling related-process coverage also takes effect the next day; enabling it applies immediately.

## Things to know

Pactime counts process running time, including time spent in the background. A launcher downloading files still uses its allowance. It cannot tell when a match, video, or task has finished. Choose the closing delay in advance; the maximum is 30 minutes, and reminders do not offer another extension. Exiting during the delay ends it, and reopening does not grant another delay.

Sleep pauses usage counting but does not extend an existing closing deadline. Pactime cannot record usage while it is not running.

Once the deadline passes, Pactime keeps checking for the app and attempts to close it again if it restarts. Its window may appear briefly before detection. Some elevated or protected processes cannot be closed, and launcher relationships can be missed. Adding the actual executable can help when a launcher rule misses an app.

Exclusive fullscreen can hide popups, so try the voice or tone reminder beforehand. Pactime is intended for voluntary limits; a device administrator can still stop or uninstall it.

## FAQ

### What if an app is missing or cannot be closed?

Refresh the list and search by name, window title, or path. Browsing for the executable or dragging it in is another option. On Windows, access-denied errors may require restarting Pactime as administrator. Protected processes may remain inaccessible even with administrator rights.

### Why can a restricted app open briefly?

Pactime checks for processes after they start, usually about every two seconds, then attempts to close them. The window can appear before closure.

### Where is the data? Do upgrades or uninstalling clear it?

Use **Settings → Open data location**. Upgrades keep rules and usage in the existing directory. Uninstalling can leave data behind; the Windows installer preserves these files. Exit the old version before upgrading. Rule removal takes effect the next day, and normal quitting becomes available once no rules remain.

### How do I report a problem?

Open an issue with the app version, OS, reproduction steps, and actual result. For closure problems, include privilege levels and the latest error. Redact personal information in screenshots and logs. Report vulnerabilities through the [security policy](SECURITY.md).

## Privacy

Rules, usage, and the last 14 days of usage history stay on the device. Pactime has no accounts, ads, analytics SDKs, cloud sync, crash-report uploads, or automatic update downloads.

Selecting an app reads its process name and executable path. On Windows, the picker also reads window titles for search. Pactime does not collect keystrokes, screen contents, document contents, or browsing history. See the [privacy notice](PRIVACY.md).

## Development

Requires Node.js 22.12+ and npm. Native Mac development also needs Xcode Command Line Tools.

```sh
npm ci
npm run dev
```

Development uses a separate data directory and allows normal quitting, but it can still close real apps selected in a rule. For UI work, use `npm run dev:web` to open the browser preview.

Common commands:

```sh
npm run dev:web    # Preview the UI in a browser
npm run typecheck  # Check TypeScript types
npm run build      # Build the application
npm run dist:win   # Build Windows x64 EXE and ZIP packages
npm run dist:mac   # Build macOS arm64 DMG and ZIP packages
```

Dependency installation downloads Electron. If that download fails, run `npx install-electron` and retry. UI edits reload automatically; restart development after changing desktop or native code. The browser preview at `http://127.0.0.1:5178` uses simulated data and cannot read or close local apps.

Packages are written to `release/`. Mac packaging requires an Apple Silicon Mac. After cross-building a Windows package on Mac, check it on a Windows device.

## Contributing

Reports in Issues, platform testing, documentation fixes, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details and the [security policy](SECURITY.md) for vulnerability reports.

Current work focuses on Windows and Mac compatibility, permission handling, and background resource use. Mobile apps are still planned. Community participation follows the [code of conduct](CODE_OF_CONDUCT.md).

## Author

Created and maintained by [快跑啊小卢\_](https://github.com/Vergil-coder), an independent developer.

[GitHub](https://github.com/Vergil-coder) · [Xiaohongshu](https://www.xiaohongshu.com/user/profile/5b07793a6b58b7646b6cea16) · [Bilibili](https://space.bilibili.com/237050518)

For Pactime questions and bug reports, please use this repository's Issues so others can follow the discussion.

## License

Pactime is licensed under **GPL-3.0-only**. See [LICENSE](LICENSE) and the [third-party notices](THIRD_PARTY_NOTICES.md) for dependency and font licenses.

Pactime is currently free to use. Any future paid features or services will be announced when they are released.
