/**
 * Windows path normalization for bash commands.
 *
 * Git Bash expects Unix-style paths. Convert:
 *   - `C:\...` or `C:/...` → `/c/...`  (MSYS drive-letter convention)
 *   - Remaining `\` → `/` in path contexts
 *
 * No-op on non-Windows platforms.
 */

export function normalizeBashPaths(command: string): string {
	if (process.platform !== "win32") return command;

	// Convert whole drive-letter path segments (C:\foo, C:/foo) to MSYS
	// form (/c/foo). Only the segment starting at the drive letter is
	// rewritten — backslashes elsewhere (regex escapes like \| \b \.,
	// quoted strings) pass through untouched, so grep/sed patterns survive.
	// Spaces inside the segment are kept (C:\Program Files\Git) but a
	// space followed by a new drive letter or shell operator ends it
	// (cat C:\a.txt C:\b.txt stays two arguments).
	// ponytail: bare relative Windows paths (dir\file.txt) are left to
	// Git Bash, which mangles them loudly (file-not-found) — recoverable,
	// unlike the silent no-match corruption a global \ → / causes.
	command = command.replace(
		/\b([A-Za-z]):[\\/](?:[^\s"'`;|&<>]+|[ \t](?![A-Za-z]:[\\/]|&&|\|\||[;&|<>]))*/g,
		(m: string, drive: string) =>
			`/${drive.toLowerCase()}/${m.slice(3).replace(/\\/g, "/")}`,
	);

	return command;
}

/**
 * Convert cmd.exe `cd /d X:\...` to Git Bash `cd /x/...`.
 *
 * LLMs trained on Windows data sometimes emit `cd /d D:\path` which is
 * cmd.exe syntax — Git Bash interprets `/d` as a directory argument.
 * Strips the flag and normalizes the drive letter path.
 *
 * Must run BEFORE normalizeBashPaths so the resulting /x/ path is
 * further cleaned up (backslashes → forward slashes).
 *
 * No-op on non-Windows platforms.
 */
export function normalizeCdD(command: string): string {
	if (process.platform !== "win32") return command;

	// Convert the whole rest of the path too: normalizeBashPaths no longer
	// does a global \ → / (it would corrupt regex escapes), so a leftover
	// D:\path\with\backslashes would otherwise survive intact.
	return command.replace(
		/cd\s+\/d\s+([A-Za-z]):[\\/]([^\s"'`;|&<>]*)/gi,
		(_m, drive: string, rest: string) =>
			`cd /${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`,
	);
}

/**
 * Normalize /tmp/ prefix in write tool paths.
 *
 * On Windows, `write({path: "/tmp/foo.py"})` and `bash("python /tmp/foo.py")`
 * resolve /tmp/ to different directories (Node path.resolve vs MSYS2 translation).
 * Rewrite to cwd-relative path so both tools agree.
 *
 * No-op on non-Windows platforms.
 */
export function normalizeTmpPath(p: string): string {
	if (process.platform !== "win32") return p;
	return p.replace(/^\/tmp\//, "./");
}

/**
 * Rewrite /tmp/ file references in bash commands to cwd-relative paths.
 *
 * On Windows, `/tmp/` resolves differently in the `write` tool (Node.js
 * path.resolve) vs Git Bash (MSYS2 translation). This causes "file not
 * found" when LLM writes to `/tmp/` then runs it. Rewrites all `/tmp/`
 * bare references to `./` so both tools agree on the path.
 *
 * Uses negative lookbehind `(?<!\w)` to avoid false matches in URLs
 * (localhost/tmp/...) and already-normalized MSYS paths (/c/tmp/...).
 *
 * No-op on non-Windows platforms.
 */
export function normalizeBashTmpRefs(command: string): string {
	if (process.platform !== "win32") return command;

	return command.replace(/(?<!\w)\/tmp\//g, "./");
}

/**
 * Extract heredoc bodies (`<<EOF` … `EOF`) so path normalization can skip
 * them: heredoc content is data (written to files / fed to stdin), not
 * shell-parsed commands — rewriting `D:\` or `/tmp/` inside it corrupts the
 * data. Bodies are replaced with NUL-prefixed placeholders (single tokens
 * that no normalizer touches) and restored afterwards.
 *
 * ponytail: line-scan, not a full bash tokenizer; `<<` inside quotes/strings
 * would false-positive. Heredoc bodies in real LLM commands rarely contain
 * literal `<<`. Works for `<<EOF`, `<<'EOF'`, `<<"EOF"`, `<<\EOF`, `<<-EOF`.
 */
export function extractHeredocChunks(command: string): {
	command: string;
	chunks: string[];
} {
	const lines = command.split("\n");
	const chunks: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i]!.match(/<<-?\s*\\?(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
		if (!m) continue;
		const delim = m[2]!;
		const allowTabs = lines[i]!.includes("<<-");
		// `<<\EOF` (escaped delimiter) is bash-equivalent to `<<'EOF'` —
		// normalize it so the backslash doesn't fall into the `\`→`/`
		// conversion of normalizeBashPaths and corrupt the delimiter.
		if (m[0].includes("\\")) {
			lines[i] = lines[i]!.replace(m[0], `<<${allowTabs ? "-" : ""}'${delim}'`);
		}
		for (let j = i + 1; j < lines.length; j++) {
			const content = lines[j]!;
			if ((allowTabs ? content.replace(/^\t+/, "") : content) === delim) {
				i = j;
				break;
			}
			chunks.push(content);
			lines[j] = `\u0000RAD_HEREDOC_${chunks.length - 1}\u0000`;
		}
	}
	return { command: lines.join("\n"), chunks };
}

/** Restore heredoc bodies replaced by {@link extractHeredocChunks}. */
export function restoreHeredocChunks(
	command: string,
	chunks: string[],
): string {
	return command.replace(
		/\u0000RAD_HEREDOC_(\d+)\u0000/g,
		(_m, i: string) => chunks[Number(i)] ?? "",
	);
}

/**
 * Quote paths with spaces so Git Bash doesn't split them into multiple args.
 *
 * LLMs commonly emit paths like `/c/Program Files/Git` without quoting,
 * which Git Bash interprets as two arguments. This function detects path-like
 * segments (starting with `/x/` — normalized drive letters) containing spaces
 * that aren't already quoted, and wraps them in double quotes.
 *
 * ponytail: heuristic regex, not a full bash tokenizer. Covers the common LLM
 * patterns (cd, cat, diff, redirects, pipes) via negative lookbehind for
 * already-quoted paths, a lookahead to avoid eating into a subsequent `/x/`
 * path, and operator-safe character classes. A full tokenizer would be needed
 * for 100% coverage.
 *
 * No-op on non-Windows platforms.
 */
export function normalizePathSpacing(command: string): string {
	if (process.platform !== "win32") return command;

	// `\s` → `[ \t]`: the repeated group must not cross line boundaries
	// (a newline would let it swallow the NUL placeholder row of a heredoc
	// body after a spaced path on the `<<` line).
	return command.replace(
		/(?<!["'`])(\/[a-z]\/[^\s"'`;|&<>]+(?:[ \t]+(?!\/[a-z]\/|\d+(?=[>&]))[^\s"'`;|&<>]+)+)/g,
		'"$1"',
	);
}
