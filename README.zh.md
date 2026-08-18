# rad-windows

[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![English](https://img.shields.io/badge/lang-English-blue)](README.md)

Pi Windows 兼容性插件 — 修复在 Git Bash 下运行 pi 时的 NUL 重定向、路径分隔符等 Windows 特有问题。

## 问题

当 pi 在 **Windows** 上通过 **Git Bash**（MSYS2）运行时，有两个常见问题：

**NUL 重定向** — LLM 发出 `some-tool --quiet > nul` 或 `build.sh 2> nul` 时，Git Bash 不把 `nul` 当作空设备处理，而是在当前目录创建名为 `nul` 的文件。由于 `nul` 是 Windows 保留设备名，这些文件对 `ls` 不可见、多数编辑器无法打开，只能用 PowerShell 删除。

**Windows 路径** — LLM 可能发出 `cd C:\Users\...` 或 `diff C:\a.txt D:\b.txt` 这类 Windows 原生路径，Git Bash 要求 Unix 风格路径（`/c/Users/...`），反斜杠分隔符会导致命令失败。

## 修复内容

| 问题                | 之前             | 之后                  |
| ------------------- | ---------------- | --------------------- |
| stdout 重定向到 NUL | `echo hi > nul`  | `echo hi > /dev/null` |
| stderr 重定向到 NUL | `build 2> NUL`   | `build 2> /dev/null`  |
| 合并重定向          | `cmd &>> Nul`    | `cmd &>> /dev/null`   |
| 盘符路径            | `cd C:\Users`    | `cd /c/Users`         |
| 反斜杠分隔符        | `cat C:\a\b.txt` | `cat /c/a/b.txt`      |

所有修复**仅 Windows 生效**。Linux/macOS 下插件为 no-op。

## 安装

```bash
pi install git:github.com/dreanzy/pi_rad_windows
# 重载扩展
/reload
```

本地开发：

```bash
pi install /path/to/pi_rad_windows
/reload
```

## 工作原理

插件拦截 pi 的 `tool_call` 事件，在 `bash` 工具执行前修改命令：

1. **`normalizeNulRedirects`** — 字符级解析器，追踪引号/转义状态，将 `> nul`、`2> nul`、`&>> nul` 等重写为 `> /dev/null`，尊重引号字符串和转义操作符。

2. **`normalizeBashPaths`** — 将 Windows 盘符路径（`C:\...`）转为 MSYS 约定格式（`/c/...`），并将剩余反斜杠路径分隔符替换为正斜杠。

两者仅在 `process.platform === "win32"` 时运行。`pathFix` 组默认为关闭（opt-in），见[配置](#配置)。

## 配置

每个修复是 `~/.pi/agent/rad-windows.json`（pi 全局 agent 配置目录，经 `getAgentDir()` 解析）中的一个开关：

```json
{
	"nulRedirect": true,
	"tmpPathFix": true,
	"pathFix": false
}
```

| 键            | 默认值  | 作用                                                                      |
| ------------- | ------- | ------------------------------------------------------------------------- |
| `nulRedirect` | `true`  | 将 `> nul` / `2> nul` 等重写为 `> /dev/null`                              |
| `tmpPathFix`  | `true`  | 将 `write` 与 `bash` 中的 `/tmp/` 路径重写为 cwd 相对路径（跨工具一致性） |
| `pathFix`     | `false` | Windows 盘符路径转 MSYS 格式、`cd /d` 处理、带空格路径自动加引号          |

省略的键保持默认值，未知键被忽略。文件缺失或 JSON 非法时回退默认值。配置在扩展加载时读取一次——改完需执行 `/reload`。

## 开发

```bash
git clone https://github.com/dreanzy/pi_rad_windows.git
cd pi_rad_windows
npm ci
npm run typecheck     # 类型检查
npm test              # 运行测试
```

## 作用范围

仅影响 LLM 通过内置 `bash` 工具调用的命令。不影响你手动在 Pi shell 中运行的命令（`!` 前缀）、绕过内置 bash 工具的扩展、或 pi CLI 本身。

## 许可

MIT
