# Security policy

## Scope and supported versions

Pactime is early preview software. Security fixes target the newest preview source/build; older builds do not have a promised backport schedule. Check the installed version against the current release before reporting.

Treat arbitrary process termination, command injection, unintended privilege escalation, disclosure of private data, and unsafe handling of dropped files or IPC as security issues. A device administrator being able to stop, uninstall, or modify Pactime is a known boundary of a voluntary self-control tool, not a claim of administrator resistance. The current hidden test reset is also a known preview capability; it is not an access-control mechanism.

## Report privately

Once the GitHub repository has **Private vulnerability reporting** enabled, use **Security → Advisories → Report a vulnerability**. Describe affected versions, a minimal reproduction using harmless fixtures, expected impact, and any suggested fix. Do not include live credentials or other people's data.

If that private entry is unavailable and the maintainer has not provided a private contact, open a public issue requesting a private reporting channel **without exploit details, sensitive data, or a working attack payload**. This local repository does not currently publish a security email address. Maintainers must configure private reporting before presenting it as available.

There is no guaranteed response SLA or bug bounty. Please allow coordinated investigation before disclosing technical details publicly.

## Testing boundaries

Use temporary data and only deliberately launched test applications. Do not test process termination, reset behavior, or privilege changes on applications with unsaved work or on anyone else's device without authorization. Do not disable system security protections to install or test a build.

## 中文说明

安全问题请优先通过 GitHub 私密漏洞报告提交。若尚未开启，也没有维护者提供的私密联系方式，可只公开请求联系渠道，不附漏洞利用细节。当前没有公开安全邮箱或处理时限承诺。管理员可绕过本机工具、预览版保留隐藏重置入口，都是当前已知边界。
