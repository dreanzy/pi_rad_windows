import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { normalizeNulRedirects } from "./nul-redirect.ts";
import {
	extractHeredocChunks,
	normalizeBashPaths,
	normalizeBashTmpRefs,
	normalizeCdD,
	normalizePathSpacing,
	normalizeTmpPath,
	restoreHeredocChunks,
} from "./path-fix.ts";

/**
 * rad-windows: Pi Windows Compatibility Plugin.
 *
 * Intercepts tool calls and applies Windows-specific normalization:
 *   1. Rewrites `> nul` / `2> nul` etc. to `> /dev/null` (prevents spurious nul files)
 *   2. Converts Windows paths to MSYS/Git Bash compatible format
 *   3. Quotes paths with spaces so Git Bash doesn't split them
 *   4. Strips cmd.exe `cd /d` flag (Git Bash doesn't understand it)
 *   5. Rewrites /tmp/ file paths to cwd-relative (cross-tool path consistency)
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		// ── write tool: normalize /tmp/ paths ──────────────────────
		if (
			isToolCallEventType("write", event) &&
			typeof event.input.path === "string"
		) {
			event.input.path = normalizeTmpPath(event.input.path);
		}

		// ── bash tool: apply all normalizations ────────────────────
		if (isToolCallEventType("bash", event)) {
			// Heredoc bodies are data, not commands — protect them from
			// path normalization, then restore after the pipeline runs.
			const { command, chunks } = extractHeredocChunks(event.input.command);
			event.input.command = restoreHeredocChunks(
				normalizePathSpacing(
					normalizeBashPaths(
						normalizeBashTmpRefs(normalizeCdD(normalizeNulRedirects(command))),
					),
				),
				chunks,
			);
		}
	});
}
