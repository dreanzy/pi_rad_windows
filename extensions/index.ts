import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { normalizeNulRedirects } from "./nul-redirect.ts";
import { normalizeBashPaths, normalizePathSpacing } from "./path-fix.ts";

/**
 * rad-windows: Pi Windows Compatibility Plugin.
 *
 * Intercepts bash tool calls and applies Windows-specific normalization:
 *   1. Rewrites `> nul` / `2> nul` etc. to `> /dev/null` (prevents spurious nul files)
 *   2. Converts Windows paths to MSYS/Git Bash compatible format
 *   3. Quotes paths with spaces so Git Bash doesn't split them
 */
export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (isToolCallEventType("bash", event)) {
			event.input.command = normalizePathSpacing(
				normalizeBashPaths(normalizeNulRedirects(event.input.command)),
			);
		}
	});
}
