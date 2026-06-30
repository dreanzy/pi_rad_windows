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
