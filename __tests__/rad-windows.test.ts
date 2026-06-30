import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeNulRedirects } from "../extensions/nul-redirect.ts";
import { normalizeBashPaths } from "../extensions/path-fix.ts";

// ── NUL redirect ────────────────────────────────────────────────

describe("normalizeNulRedirects", () => {
	it("leaves commands without NUL redirects unchanged", () => {
		expect(normalizeNulRedirects("echo hello")).toBe("echo hello");
		expect(normalizeNulRedirects("grep nul file.txt")).toBe(
			"grep nul file.txt",
		);
	});

	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizeNulRedirects("echo hello > nul")).toBe(
				"echo hello > nul",
			);
		});
	});

	describe("Windows", () => {
		it("replaces > nul with >/dev/null", () => {
			expect(normalizeNulRedirects("echo hello > nul")).toBe(
				"echo hello >/dev/null",
			);
			expect(normalizeNulRedirects("echo hello > NUL")).toBe(
				"echo hello >/dev/null",
			);
		});

		it("replaces >> nul / 2> nul / &> nul variants", () => {
			expect(normalizeNulRedirects("echo >> nul")).toBe("echo >>/dev/null");
			expect(normalizeNulRedirects("echo 2> nul")).toBe("echo 2>/dev/null");
			expect(normalizeNulRedirects("echo 2>> nul")).toBe("echo 2>>/dev/null");
			expect(normalizeNulRedirects("echo &> nul")).toBe("echo &>/dev/null");
			expect(normalizeNulRedirects("echo &>> nul")).toBe("echo &>>/dev/null");
		});

		it("does not rewrite nul as part of a filename", () => {
			expect(normalizeNulRedirects("echo > nul.txt")).toBe("echo > nul.txt");
			expect(normalizeNulRedirects("echo > nul-backup")).toBe(
				"echo > nul-backup",
			);
		});

		it("handles pipe/semicolon/&& boundaries", () => {
			expect(normalizeNulRedirects("echo a > nul && echo b > nul")).toBe(
				"echo a >/dev/null && echo b >/dev/null",
			);
			expect(normalizeNulRedirects("echo > nul|cat")).toBe(
				"echo >/dev/null|cat",
			);
			expect(normalizeNulRedirects("echo > nul;echo done")).toBe(
				"echo >/dev/null;echo done",
			);
		});

		it("does not replace escaped redirect operators", () => {
			expect(normalizeNulRedirects("echo \\> nul")).toBe("echo \\> nul");
			expect(normalizeNulRedirects("echo \\\\\\> nul")).toBe(
				"echo \\\\\\> nul",
			);
		});
	});
});

// ── Path normalization ───────────────────────────────────────────

describe("normalizeBashPaths", () => {
	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizeBashPaths("cd C:\\Users")).toBe("cd C:\\Users");
		});
	});

	describe("Windows", () => {
		it("converts C:\\ to /c/", () => {
			expect(normalizeBashPaths("cd C:\\Users")).toBe("cd /c/Users");
		});

		it("converts D:/ also", () => {
			expect(normalizeBashPaths("cat D:/data/file.txt")).toBe(
				"cat /d/data/file.txt",
			);
		});

		it("handles multiple drive letters", () => {
			expect(normalizeBashPaths("diff C:\\a.txt D:\\b.txt")).toBe(
				"diff /c/a.txt /d/b.txt",
			);
		});

		it("converts remaining backslashes to forward slashes", () => {
			expect(normalizeBashPaths("cd C:\\Users\\Daniel\\Projects")).toBe(
				"cd /c/Users/Daniel/Projects",
			);
		});

		it("leaves already-normal paths alone", () => {
			expect(normalizeBashPaths("echo hello")).toBe("echo hello");
			expect(normalizeBashPaths("ls -la")).toBe("ls -la");
		});
	});
});
