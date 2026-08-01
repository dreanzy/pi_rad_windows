import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeNulRedirects } from "../extensions/nul-redirect.ts";
import {
	extractHeredocChunks,
	normalizeBashPaths,
	normalizeBashTmpRefs,
	normalizeCdD,
	normalizePathSpacing,
	normalizeTmpPath,
	restoreHeredocChunks,
} from "../extensions/path-fix.ts";

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

// ── cd /d normalization ────────────────────────────────────────

describe("normalizeCdD", () => {
	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizeCdD("cd /d D:\\Projects\\test")).toBe(
				"cd /d D:\\Projects\\test",
			);
		});
	});

	describe("Windows", () => {
		it("strips /d flag from cd /d D:\\...", () => {
			expect(
				normalizeCdD("cd /d D:\\Projects\\TsProjects\\pi_rad_joplin"),
			).toBe("cd /d/Projects\\TsProjects\\pi_rad_joplin");
			// 注：\ → / 由 normalizeBashPaths 在后续管线处理
		});

		it("handles uppercase /D", () => {
			expect(normalizeCdD("cd /D C:\\Windows")).toBe("cd /c/Windows");
		});

		it("handles forward slash paths too", () => {
			expect(normalizeCdD("cd /d D:/Projects/test")).toBe(
				"cd /d/Projects/test",
			);
		});

		it("leaves normal cd commands alone", () => {
			expect(normalizeCdD("cd /c/Users")).toBe("cd /c/Users");
			expect(normalizeCdD("cd /tmp")).toBe("cd /tmp");
		});

		it("does not touch /d outside of cd context", () => {
			expect(normalizeCdD("ls /d/someflag")).toBe("ls /d/someflag");
		});
	});
});

// ── /tmp/ path normalization ────────────────────────────────────

describe("normalizeTmpPath", () => {
	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizeTmpPath("/tmp/script.py")).toBe("/tmp/script.py");
		});
	});

	describe("Windows", () => {
		it("rewrites /tmp/ prefix to ./", () => {
			expect(normalizeTmpPath("/tmp/check_folders.py")).toBe(
				"./check_folders.py",
			);
		});

		it("rewrites nested paths too", () => {
			expect(normalizeTmpPath("/tmp/subdir/file.txt")).toBe(
				"./subdir/file.txt",
			);
		});

		it("leaves non-/tmp/ paths alone", () => {
			expect(normalizeTmpPath("./local/file.ts")).toBe("./local/file.ts");
			expect(normalizeTmpPath("C:\\Users\\file.txt")).toBe(
				"C:\\Users\\file.txt",
			);
		});
	});
});

describe("normalizeBashTmpRefs", () => {
	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizeBashTmpRefs("python /tmp/script.py")).toBe(
				"python /tmp/script.py",
			);
		});
	});

	describe("Windows", () => {
		it("rewrites python /tmp/... to python ./...", () => {
			expect(normalizeBashTmpRefs("python /tmp/check_folders.py")).toBe(
				"python ./check_folders.py",
			);
		});

		it("rewrites any command /tmp/...", () => {
			expect(normalizeBashTmpRefs("node /tmp/server.js")).toBe(
				"node ./server.js",
			);
			expect(normalizeBashTmpRefs("bash /tmp/deploy.sh")).toBe(
				"bash ./deploy.sh",
			);
			expect(normalizeBashTmpRefs("cat /tmp/data.txt")).toBe("cat ./data.txt");
		});

		it("rewrites /tmp/ in redirect targets", () => {
			expect(normalizeBashTmpRefs("echo log > /tmp/out.txt")).toBe(
				"echo log > ./out.txt",
			);
			expect(normalizeBashTmpRefs("cmd >> /tmp/log.txt")).toBe(
				"cmd >> ./log.txt",
			);
		});

		it("rewrites /tmp/ in flag arguments", () => {
			expect(
				normalizeBashTmpRefs("python /tmp/a.py --output /tmp/out.txt"),
			).toBe("python ./a.py --output ./out.txt");
		});

		it("does NOT rewrite /tmp/ in URLs", () => {
			expect(normalizeBashTmpRefs('curl -s "http://localhost/tmp/data"')).toBe(
				'curl -s "http://localhost/tmp/data"',
			);
		});

		it("does NOT rewrite /tmp/ after a word character", () => {
			// After normalizeBashPaths: /c/tmp/file.py → /tmp/ preceded by 'c'
			expect(normalizeBashTmpRefs("/c/tmp/file.py")).toBe("/c/tmp/file.py");
		});

		it("does NOT match /tmp without trailing slash", () => {
			expect(normalizeBashTmpRefs("ls /tmp")).toBe("ls /tmp");
		});

		it("rewrites multiple /tmp/ occurrences", () => {
			expect(normalizeBashTmpRefs("python /tmp/a.py && python /tmp/b.py")).toBe(
				"python ./a.py && python ./b.py",
			);
		});
	});
});

// ── Path spacing quoting ────────────────────────────────────────

describe("normalizePathSpacing", () => {
	describe("non-Windows no-op", () => {
		beforeEach(() => {
			vi.stubGlobal("process", { ...process, platform: "linux" });
		});
		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("does nothing", () => {
			expect(normalizePathSpacing("cd /c/Program Files/Git")).toBe(
				"cd /c/Program Files/Git",
			);
		});
	});

	describe("Windows", () => {
		it("quotes cd path with spaces", () => {
			expect(normalizePathSpacing("cd /c/Program Files/Git")).toBe(
				'cd "/c/Program Files/Git"',
			);
		});

		it("handles multiple drive-letter paths, quoting only the one with spaces", () => {
			expect(normalizePathSpacing("diff /c/a.txt /d/My Documents/b.txt")).toBe(
				'diff /c/a.txt "/d/My Documents/b.txt"',
			);
		});

		it("quotes path before pipe", () => {
			expect(
				normalizePathSpacing("cat /c/Program Files/data.txt | grep foo"),
			).toBe('cat "/c/Program Files/data.txt" | grep foo');
		});

		it("quotes redirect target path", () => {
			expect(normalizePathSpacing("echo hi > /c/Program Files/out.txt")).toBe(
				'echo hi > "/c/Program Files/out.txt"',
			);
		});

		it("does not double-quote already double-quoted paths", () => {
			expect(normalizePathSpacing('cd "/c/Program Files/Git"')).toBe(
				'cd "/c/Program Files/Git"',
			);
		});

		it("does not quote already single-quoted paths", () => {
			expect(normalizePathSpacing("cd '/c/Program Files/Git'")).toBe(
				"cd '/c/Program Files/Git'",
			);
		});

		it("leaves paths without spaces alone", () => {
			expect(normalizePathSpacing("cd /c/Users/Daniel")).toBe(
				"cd /c/Users/Daniel",
			);
		});

		it("handles path before &&", () => {
			expect(normalizePathSpacing("cd /c/Program Files/Git && ls")).toBe(
				'cd "/c/Program Files/Git" && ls',
			);
		});

		it("handles multiple path arguments in pipes", () => {
			expect(
				normalizePathSpacing(
					"cd /c/Program Files/Git && cat /d/My Docs/readme.txt",
				),
			).toBe('cd "/c/Program Files/Git" && cat "/d/My Docs/readme.txt"');
		});

		it("does not swallow fd-redirect numbers into the quoted path", () => {
			expect(normalizePathSpacing("ls /d/foo/src 2>/dev/null")).toBe(
				"ls /d/foo/src 2>/dev/null",
			);
			expect(
				normalizePathSpacing("cd /c/Program Files/x && ls /d/foo/src 2>&1"),
			).toBe('cd "/c/Program Files/x" && ls /d/foo/src 2>&1');
			expect(normalizePathSpacing("ls /d/foo/src 2>>/dev/null")).toBe(
				"ls /d/foo/src 2>>/dev/null",
			);
		});

		it("leaves commands without paths unchanged", () => {
			expect(normalizePathSpacing("echo hello")).toBe("echo hello");
			expect(normalizePathSpacing("ls -la | grep foo")).toBe(
				"ls -la | grep foo",
			);
		});
	});

	describe("heredoc protection", () => {
		it("skips path normalization inside heredoc bodies", () => {
			const cmd =
				"cat > out.txt <<'EOF'\n" +
				"D:\\Projects\\foo 2> nul\n" +
				"/tmp/x.py\n" +
				"EOF\n" +
				"ls D:/Projects && echo done";
			const { command, chunks } = extractHeredocChunks(cmd);
			const normalized = normalizeBashTmpRefs(
				normalizeBashPaths(normalizeNulRedirects(command)),
			);
			expect(restoreHeredocChunks(normalized, chunks)).toBe(
				"cat > out.txt <<'EOF'\n" +
					"D:\\Projects\\foo 2> nul\n" +
					"/tmp/x.py\n" +
					"EOF\n" +
					"ls /d/Projects && echo done",
			);
		});

		it("handles <<- tab-indented delimiters", () => {
			const cmd = "cat <<-END\n\tD:\\x\n\tEND";
			const { command, chunks } = extractHeredocChunks(cmd);
			expect(restoreHeredocChunks(normalizeBashPaths(command), chunks)).toBe(
				"cat <<-END\n\tD:\\x\n\tEND",
			);
		});

		it("handles <<\\ escaped delimiters", () => {
			const cmd = "cat <<\\EOF\nD:\\x\nEOF";
			const { command, chunks } = extractHeredocChunks(cmd);
			expect(restoreHeredocChunks(normalizeBashPaths(command), chunks)).toBe(
				"cat <<'EOF'\nD:\\x\nEOF",
			);
		});

		it("does not quote across newlines after a spaced path on the << line", () => {
			const cmd =
				"cat <<EOF > /d/My Docs/out.txt\n" +
				"\u0000RAD_HEREDOC_0\u0000\n" +
				"EOF";
			expect(normalizePathSpacing(cmd)).toBe(
				'cat <<EOF > "/d/My Docs/out.txt"\n' +
					"\u0000RAD_HEREDOC_0\u0000\n" +
					"EOF",
			);
		});

		it("supports multiple heredocs", () => {
			const cmd = "a <<A\n1\nA\nb <<B\n2\nB";
			const { command, chunks } = extractHeredocChunks(cmd);
			expect(restoreHeredocChunks(command, chunks)).toBe(cmd);
		});
	});
});
