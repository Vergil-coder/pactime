# Contributing to Pactime

Thanks for helping make Pactime more reliable. You can contribute by reproducing a bug, testing a Windows or Mac configuration, improving a guide, or sending a focused code change. Reports may be in English or Chinese.

## Before opening an issue

Check existing issues and the [FAQ](README.md#faq). Include the Pactime version, OS version and architecture, steps to reproduce, expected behavior, actual behavior, and the latest relevant error. For process-control issues, include whether Pactime and the target app use administrator privileges. Redact personal paths and window titles.

Use the bug report or feature request template. For security issues, follow [SECURITY.md](SECURITY.md), not a public bug report.

## Make a change

1. Fork the repository and create a branch for one problem.
2. Follow the [development instructions](README.md#development). Use a UI-only demo or a deliberately launched disposable app for tests.
3. Keep changes focused. Discuss significant behavior, architecture, dependencies, or paid-service proposals in an issue before implementing them.
4. Explain what changes for the person using the app, why, and what you tested. Note which platform you could not test.
5. Open a pull request using the template.

For code changes, run `npm run typecheck` and `npm run build`, then manually verify the affected behavior on the target OS. For UI changes, attach screenshots in both themes. Documentation changes need accurate instructions, working relative links, and no misleading feature or download claims.

## Commit messages

Use English [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) messages in the form `type: summary`, with a space after the colon. Choose the type that describes the change: `feat`, `fix`, `docs`, `refactor`, `perf`, `build`, `ci`, or `chore`.

Examples:

```text
feat: add popup reminder preferences
fix: handle missing application paths
docs: clarify rule changes and installation
chore: update repository ignore rules
```

## Code comments

Write comments in English, including comments in scripts, configuration files, and embedded platform code. Chinese UI strings and Chinese documentation are welcome; they are separate from code comments.

## Process-control changes need extra care

Preserve PID, executable path, and process-creation-time checks, and exclusions for the monitor itself and system applications. Do not replace identity verification with closing every process that shares a name.

Use `PACTIME_*` names for new launch configurations and `window.pactime` for the desktop bridge. Legacy storage keys and the application ID are retained for upgrade compatibility; shared constants live in `src/shared/compatibility.ts`.

Keep rules, daily usage, and closing deadlines durable. A failed query must not be interpreted as an app exiting; failed closure must not be shown as successful. Do not add time or erase state as a fallback for an error.

For manual verification, use a disposable application and separate development data. Do not terminate an unrelated application or reset someone's real usage data.

## Design and writing

Reuse the existing components and theme tokens in `src/renderer/`. Use the official [brand assets](assets/brand/README.md) rather than redrawing the logo. Prefer complete, natural instructions over fragments. Describe applications generally rather than treating every app as a game. The interface supports English and Simplified Chinese. Add user-facing messages to `src/shared/messages.ts` and use the shared translation helpers. Keep app names, paths, stored rules, and process identity checks independent of language. Check both languages when changing layouts.

AI assistance is allowed, but the contributor is responsible for understanding, checking, and explaining the result. Do not submit generated changes you cannot maintain.

Public documentation should help users install and use the app or help contributors understand and maintain it. Keep raw brainstorming transcripts, assistant prompts, personal work plans, and temporary review reports out of the public tree. Reviewed architecture decisions and design proposals can be useful documentation when written for contributors.

## Licensing

Contributions are accepted under the repository's existing **GPL-3.0-only** license unless explicitly agreed otherwise before submission. Keep third-party notices and submit only work you have permission to contribute. Contributors retain their copyright; this project currently has no copyright assignment or contributor license agreement. A contribution does not automatically authorize future proprietary relicensing.

Participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). There is no guaranteed review or support response time.
