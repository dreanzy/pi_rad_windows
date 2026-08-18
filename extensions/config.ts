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

/**
 * Keep a value only when it is an explicit boolean; otherwise use the default.
 *
 * ponytail: lenient fallback instead of failing the whole extension on a
 * typo'd value — a wrong-type key is treated as absent. Revisit if config
 * errors should ever be loud.
 */
function boolFlag(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

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
		const cfg = parsed as Record<string, unknown>;
		return {
			nulRedirect: boolFlag(cfg.nulRedirect, DEFAULT_CONFIG.nulRedirect),
			tmpPathFix: boolFlag(cfg.tmpPathFix, DEFAULT_CONFIG.tmpPathFix),
			pathFix: boolFlag(cfg.pathFix, DEFAULT_CONFIG.pathFix),
		};
	} catch {
		console.warn(`[rad-windows] Failed to parse ${path}; using defaults.`);
		return { ...DEFAULT_CONFIG };
	}
}
