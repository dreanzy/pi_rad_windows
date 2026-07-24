import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { normalizeNulRedirects } from "./nul-redirect.ts";
import {
	normalizeBashPaths,
	normalizeBashTmpRefs,
	normalizeCdD,
	normalizePathSpacing,
	normalizeTmpPath,
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
			event.input.command = normalizePathSpacing(
				normalizeBashPaths(
					normalizeBashTmpRefs(
						normalizeCdD(normalizeNulRedirects(event.input.command)),
					),
				),
			);
		}
	});
}
