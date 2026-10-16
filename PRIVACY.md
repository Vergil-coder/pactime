# Privacy notice / 隐私说明

This notice describes the current desktop implementation, version 0.3.5. Future network features must update this notice before release.

## Data used on your device

Pactime reads process identities to measure running time and close the correct target: process IDs, parent IDs, executable paths, names, and creation times. On Windows, opening or refreshing the application picker can also read file descriptions and window titles for search. These richer picker details are not added to routine background polling.

Rules, tracked identities, daily usage, recent events, and a 14-day usage history are saved locally. Error records can contain executable paths or other system-provided details. Reminder preferences, theme settings, and Electron's own local preferences are also stored on the device. There is no app-level encryption guarantee for these files; device permissions and disk protection still matter.

Pactime does not capture keystrokes, screen recordings, document contents, or browsing history. It does not currently include account registration, advertising, analytics SDKs, cloud sync, crash-report upload, or an automatic update downloader. Speech uses the operating system's installed voice support; Pactime does not call a cloud speech API or download a voice model. Operating-system services and development dependency downloads have their own behavior and policies.

## Storage and control

Find the exact directory in **Settings → Open data location**. Installed builds use the legacy `yuliang-app-limits` name for compatibility:

- Windows: typically `%APPDATA%\yuliang-app-limits`.
- Mac: typically `~/Library/Application Support/yuliang-app-limits`.
- Development: an independent `yuliang-app-limits-development` directory.
- Browser preview: local storage for that browser origin, separate from desktop data.

The state store uses a primary file and a recovery backup. Uninstalling the program does not guarantee deletion of these files; the Windows installer is configured to preserve them. To remove local data, first stop the application and consider whether you need a backup. Do not delete only one copy expecting all history to be removed. Normal rule removal and quitting restrictions are described in [rule behavior](README.md#get-started).

## Information you choose to share

GitHub issue reports, screenshots, pull requests, and release downloads are handled by GitHub. Issue content is usually public. Redact account names, personal executable paths, private window titles, and sensitive records before attaching them. Maintainers do not receive your local usage history unless you choose to provide it.

## 中文说明

当前版本在本机读取进程身份，保存规则、用时、14 天使用历史、提醒偏好和必要记录。Windows 应用选择器会读取窗口标题以帮助搜索。没有账号、广告、分析 SDK、云同步、自动上传崩溃记录或自动更新下载器，不采集键盘、屏幕、文档内容或浏览历史。

本地文件不承诺应用层加密，卸载也不保证清除数据与恢复备份。向 GitHub 提交的问题和截图可能公开，请先遮住私人信息。后续如加入联网功能，需要先更新本说明。
