/**
 * Feature configuration for rad-windows.
 *
 * Reads `rad-windows.json` from the pi global agent config directory
 * (`getAgentDir()`, typically `~/.pi/agent/`). The file is optional: a
 * missing file, invalid JSON, or a JSON value that is not a boolean-keyed
 * object all fall back to the defaults below (with one `console.warn`).
 * Unknown keys are ignored.
 *
 * Config is read once at extension load; changing it requires `/reload`.
 */

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface RadWindowsConfig {
	/** Rewrite `> nul` / `2> nul` etc. to `> /dev/null`. Default: on. */
	nulRedirect: boolean;
	/** Align `/tmp/` paths between the write and bash tools. Default: on. */
	tmpPathFix: boolean;
	/** Drive-letter paths, `cd /d`, spaced-path quoting. Default: off. */
	pathFix: boolean;
}

const DEFAULT_CONFIG: RadWindowsConfig = {
	nulRedirect: true,
	tmpPathFix: true,
	pathFix: false,
};

export function readConfig(): RadWindowsConfig {
	const path = join(getAgentDir(), "rad-windows.json");
	let raw: string;
	try {
		raw = readFileSync(path, "utf-8");
	} catch {
		// Not configured — use defaults.
		return { ...DEFAULT_CONFIG };
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			console.warn(
				`[rad-windows] ${path} must be a JSON object; using defaults.`,
			);
			return { ...DEFAULT_CONFIG };
		}
		// Keep only explicit booleans for known keys; wrong-type or unknown
		// keys are treated as absent (lenient fallback instead of failing the
		// whole extension on a typo'd value). ponytail: revisit if config
		// errors should be loud.
		const bools = Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>).filter(
				([k, v]) => Object.hasOwn(DEFAULT_CONFIG, k) && typeof v === "boolean",
			),
		);
		return { ...DEFAULT_CONFIG, ...bools };
	} catch {
		console.warn(`[rad-windows] Failed to parse ${path}; using defaults.`);
		return { ...DEFAULT_CONFIG };
	}
}
