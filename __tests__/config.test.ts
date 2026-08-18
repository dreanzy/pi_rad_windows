import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: vi.fn(),
}));

import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readConfig } from "../extensions/config.ts";

const mockedGetAgentDir = vi.mocked(getAgentDir);

const DEFAULTS = { nulRedirect: true, tmpPathFix: true, pathFix: false };

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "rad-config-"));
	mockedGetAgentDir.mockReturnValue(dir);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function writeConfig(json: string) {
	writeFileSync(join(dir, "rad-windows.json"), json, "utf-8");
}

function expectDefaults() {
	expect(readConfig()).toEqual(DEFAULTS);
}

describe("readConfig", () => {
	it("defaults when config file is missing", () => {
		expectDefaults();
	});

	it("defaults when config file is an empty object", () => {
		writeConfig("{}");
		expectDefaults();
	});

	it("reads user-provided booleans", () => {
		writeConfig('{"nulRedirect": false, "tmpPathFix": false, "pathFix": true}');
		expect(readConfig()).toEqual({
			nulRedirect: false,
			tmpPathFix: false,
			pathFix: true,
		});
	});

	it("keeps defaults for keys not present", () => {
		writeConfig('{"pathFix": true}');
		expect(readConfig()).toEqual({ ...DEFAULTS, pathFix: true });
	});

	it("falls back to default for non-boolean values", () => {
		writeConfig('{"nulRedirect": "yes", "tmpPathFix": 1, "pathFix": null}');
		expectDefaults();
	});

	it("ignores unknown keys", () => {
		writeConfig('{"foo": "bar", "pathFix": true}');
		expect(readConfig()).toEqual({ ...DEFAULTS, pathFix: true });
	});

	describe("malformed config falls back to defaults with one warning", () => {
		it("invalid JSON", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeConfig("{not json");
			expectDefaults();
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("JSON array", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeConfig("[1]");
			expectDefaults();
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("JSON string", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeConfig('"nulRedirect"');
			expectDefaults();
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it("JSON null", () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			writeConfig("null");
			expectDefaults();
			expect(warn).toHaveBeenCalledTimes(1);
		});
	});
});
