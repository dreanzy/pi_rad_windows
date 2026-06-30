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

	// Convert drive letters: C:\ or C:/ → /c/ (lowercase)
	// Only match word-boundary drive letters (X:\ or X:/)
	command = command.replace(/\b([A-Za-z]):[\\/]/g, (_match, drive: string) => {
		return `/${drive.toLowerCase()}/`;
	});

	// Convert remaining backslashes to forward slashes.
	// In LLM-emitted bash commands for Git Bash, backslash path separators
	// are far more common than deliberate escape sequences.
	// ponytail: naive \ → / replacement; escape-aware version if edge cases arise.
	command = command.replace(/\\/g, "/");

	return command;
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

	return command.replace(
		/(?<!["'`])(\/[a-z]\/[^\s"'`;|&<>]+(?:\s+(?!\/[a-z]\/)[^\s"'`;|&<>]+)+)/g,
		'"$1"',
	);
}
