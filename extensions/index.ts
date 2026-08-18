import {
	isToolCallEventType,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { readConfig } from "./config.ts";
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
 * Intercepts tool calls and applies Windows-specific normalization. Which
 * fixes run is controlled by `rad-windows.json` in the pi global agent config
 * dir (see `extensions/config.ts`): `nulRedirect` and `tmpPathFix` default to
 * on, `pathFix` defaults to off. Config is read once at load; `/reload` to
 * apply changes.
 *
 * Fixes:
 *   1. Rewrites `> nul` / `2> nul` etc. to `> /dev/null` (prevents spurious nul files)
 *   2. Rewrites /tmp/ file paths to cwd-relative (cross-tool path consistency)
 *   3. Converts Windows drive-letter paths to MSYS/Git Bash compatible format
 *   4. Quotes paths with spaces so Git Bash doesn't split them
 *   5. Strips cmd.exe `cd /d` flag (Git Bash doesn't understand it)
 */
export default function (pi: ExtensionAPI) {
	const config = readConfig();

	pi.on("tool_call", (event) => {
		// ── write tool: normalize /tmp/ paths (tmpPathFix) ────────────
		if (
			config.tmpPathFix &&
			isToolCallEventType("write", event) &&
			typeof event.input.path === "string"
		) {
			event.input.path = normalizeTmpPath(event.input.path);
		}

		// ── bash tool: apply enabled normalizations ──────────────────
		if (isToolCallEventType("bash", event)) {
			// Heredoc bodies are data, not commands — protect them from
			// normalization, then restore after the pipeline runs.
			const extracted = extractHeredocChunks(event.input.command);
			let cmd = extracted.command;
			if (config.nulRedirect) {
				cmd = normalizeNulRedirects(cmd);
			}
			if (config.tmpPathFix) {
				cmd = normalizeBashTmpRefs(cmd);
			}
			if (config.pathFix) {
				cmd = normalizePathSpacing(normalizeBashPaths(normalizeCdD(cmd)));
			}
			event.input.command = restoreHeredocChunks(cmd, extracted.chunks);
		}
	});
}
