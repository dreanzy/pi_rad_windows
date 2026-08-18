# rad-windows

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![中文文档](https://img.shields.io/badge/lang-中文-red)](README.zh.md)

Pi Windows Compatibility Plugin — fixes NUL redirects, path separators, and other Windows-specific issues when running pi under Git Bash.

## The Problem

When pi runs on **Windows** through **Git Bash** (MSYS2), two common issues arise:

**NUL redirects** — When the LLM emits `some-tool --quiet > nul` or `build.sh 2> nul`, Git Bash does not treat `nul` as a null device. It creates literal files named `nul` in the current directory. Because `nul` is a reserved Windows device name, these files are invisible to `ls`, cannot be opened in most editors, and require PowerShell to delete.

**Windows paths** — LLMs may emit commands with Windows-native paths like `cd C:\Users\...` or `diff C:\a.txt D:\b.txt`. Git Bash expects Unix-style paths (`/c/Users/...`). Backslash path separators cause command failures.

## What It Fixes

| Problem                | Before           | After                 |
| ---------------------- | ---------------- | --------------------- |
| stdout redirect to NUL | `echo hi > nul`  | `echo hi > /dev/null` |
| stderr redirect to NUL | `build 2> NUL`   | `build 2> /dev/null`  |
| combined redirect      | `cmd &>> Nul`    | `cmd &>> /dev/null`   |
| drive letter path      | `cd C:\Users`    | `cd /c/Users`         |
| backslash separators   | `cat C:\a\b.txt` | `cat /c/a/b.txt`      |

All fixes are **Windows-only**. On Linux/macOS the plugin is a no-op.

## Installation

```bash
pi install git:github.com/dreanzy/pi_rad_windows
# Reload extensions
/reload
```

Or for local development:

```bash
pi install /path/to/pi_rad_windows
/reload
```

## How It Works

The plugin hooks into pi's `tool_call` event and intercepts `bash` tool commands before execution:

1. **`normalizeNulRedirects`** — Character-level parser that tracks quote/escape state, rewrites `> nul`, `2> nul`, `&>> nul` etc. to `> /dev/null`. Respects quoted strings and escaped operators.

2. **`normalizeBashPaths`** — Converts Windows drive-letter paths (`C:\...`) to MSYS convention (`/c/...`), and replaces remaining backslash path separators with forward slashes.

Both run only on `process.platform === "win32"`. The `pathFix` group is opt-in — see [Configuration](#configuration).

## Configuration

Each fix is a feature flag in `~/.pi/agent/rad-windows.json` (the pi global agent config dir, resolved via `getAgentDir()`):

```json
{
	"nulRedirect": true,
	"tmpPathFix": true,
	"pathFix": false
}
```

| Key           | Default | Effect                                                                                    |
| ------------- | ------- | ----------------------------------------------------------------------------------------- |
| `nulRedirect` | `true`  | Rewrite `> nul` / `2> nul` etc. to `> /dev/null`                                          |
| `tmpPathFix`  | `true`  | Rewrite `/tmp/` paths to cwd-relative in both `write` and `bash` (cross-tool consistency) |
| `pathFix`     | `false` | Windows drive-letter paths → MSYS form, `cd /d` handling, spaced-path quoting             |

Omitted keys keep their defaults and unknown keys are ignored. A missing file or invalid JSON falls back to defaults. Config is read once at extension load — run `/reload` after editing it.

## Development

```bash
git clone https://github.com/dreanzy/pi_rad_windows.git
cd pi_rad_windows
npm ci
npm run typecheck     # type check
npm test              # run tests
```

## Scope

This extension only affects commands invoked by the LLM via the built-in `bash` tool. It does not affect commands you run manually in the Pi shell (`!` prefix), extensions that bypass the built-in bash tool, or the pi CLI itself.

## License

MIT
