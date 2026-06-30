/**
 * NUL redirect fix for Windows/Git Bash.
 *
 * On Windows, Git Bash does not treat `nul` as a null device; `> nul` creates a literal file.
 * Rewrites NUL redirect targets to /dev/null, respecting quotes and backslash escapes.
 * No-op on non-Windows platforms.
 */

export function normalizeNulRedirects(command: string): string {
	if (process.platform !== "win32") return command;

	let result = "";
	let inSingleQuotes = false;
	let inDoubleQuotes = false;
	let i = 0;
	let trailingBackslashes = 0;
	const redirectRe = /([12&]?)(>>?)\s*nul(?=\s|$|[|&;()<>])/iy;

	while (i < command.length) {
		const char = command[i]!;

		if (char === "\\") {
			trailingBackslashes++;
			result += char;
			i++;
			continue;
		}

		const isEscaped = trailingBackslashes % 2 === 1;
		trailingBackslashes = 0;

		if (char === "'" && !inDoubleQuotes) {
			if (!inSingleQuotes && isEscaped) {
				result += char;
				i++;
				continue;
			}
			inSingleQuotes = !inSingleQuotes;
			result += char;
			i++;
			continue;
		}

		if (char === '"' && !inSingleQuotes && !isEscaped) {
			inDoubleQuotes = !inDoubleQuotes;
			result += char;
			i++;
			continue;
		}

		if (!inSingleQuotes && !inDoubleQuotes && !isEscaped) {
			redirectRe.lastIndex = i;
			const match = redirectRe.exec(command);
			if (match) {
				result += `${match[1]}${match[2]}/dev/null`;
				i += match[0].length;
				continue;
			}
		}

		result += char;
		i++;
	}

	return result;
}
