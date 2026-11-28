import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { chromium } from "playwright-core";
import {
	THUMBNAIL_LAUNCH_ARGS,
	chromiumCandidates,
	findChromium,
	thumbnailSetupHint,
} from "../new-managers/WikiThumbnailRoutes";

const info: CommandInfo = {
	name: "doctor",
	description: "Check the thumbnail prerequisites: Chromium, OS libraries, fonts and paths",
	arguments: [],
	getHelp() {
		return [
			"",
			"Thumbnails are headless screenshots. MWS ships playwright-core but no",
			"browser and no fonts — both come from the host. This command reports",
			"what the renderer would use, checks the fonts Chromium needs for emoji",
			"and Korean text, and writes a sample screenshot into the store folder",
			"so you can look at the glyphs yourself.",
			"",
			"An exit code of 1 means at least one prerequisite is missing. The",
			"remedies printed at the end are Debian/Ubuntu commands; on other",
			"distributions install the equivalent packages.",
		].join("\n");
	},
};

/** `fc-list` is the standard fontconfig query tool. A null result means either
 *  that fontconfig is not installed or that the call failed — both are reported
 *  rather than treated as "no fonts", because that distinction matters. */
function fcList(args: string[]): string | null {
	try {
		return execFileSync("fc-list", args, { encoding: "utf8", timeout: 15000 });
	} catch {
		return null;
	}
}

function chromeVersion(executablePath: string): string | null {
	try {
		return execFileSync(executablePath, ["--version"], { encoding: "utf8", timeout: 15000 }).trim();
	} catch {
		return null;
	}
}

async function writeSample(outPath: string, executablePath: string): Promise<void> {
	const browser = await chromium.launch({
		executablePath,
		headless: true,
		args: THUMBNAIL_LAUNCH_ARGS,
	});
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 160 } });
		await page.setContent(
			'<!doctype html><html><body style="margin:0;font:48px sans-serif;background:#fff">'
			+ "👤 안녕 Hallo 123 👋</body></html>",
			{ waitUntil: "load" },
		);
		await page.screenshot({ path: outPath });
	} finally {
		await browser.close();
	}
}

export class DoctorCommand extends BaseCommand<[]> {
	static info = info;

	async execute() {
		const problems: string[] = [];
		console.log("MWS thumbnail environment check");
		console.log(`  data folder: ${process.cwd()}`);
		console.log(`  store:       ${this.config.storePath}`);
		for (const key of ["HOME", "MWS_CHROMIUM_PATH", "CHROME_PATH", "PLAYWRIGHT_BROWSERS_PATH"]) {
			console.log(`  ${key}: ${process.env[key] ?? "(not set)"}`);
		}

		const executablePath = findChromium();
		if (existsSync(executablePath)) {
			console.log(`OK   Chromium executable: ${executablePath}`);
			const version = chromeVersion(executablePath);
			if (version) console.log(`     ${version}`);
			else {
				console.log(`WARN ${executablePath} cannot be executed (missing libraries?)`);
				problems.push(`Chromium at ${executablePath} cannot be executed`);
			}
		} else {
			console.log("MISSING Chromium executable");
			console.log(`     Looked at: ${chromiumCandidates().join(", ")}`);
			problems.push("no Chromium executable found");
		}

		const fonts = fcList([]);
		if (fonts === null) {
			console.log("MISSING fontconfig (fc-list) — cannot check host fonts");
			problems.push("fontconfig is not available");
		} else {
			const korean = fcList([":lang=ko"]);
			const koreanFaces = korean?.trim() ? korean.trim().split("\n").length : 0;
			if (koreanFaces > 0) {
				console.log(`OK   Korean font faces: ${koreanFaces}`);
			} else {
				console.log("MISSING Korean (Hangul) fonts");
				problems.push("Korean fonts are missing");
			}
			const emojiFaces = fonts.split("\n").filter((line) => /emoji/i.test(line)).length;
			if (emojiFaces > 0) {
				console.log(`OK   Emoji font faces: ${emojiFaces}`);
			} else {
				console.log("MISSING emoji font");
				problems.push("emoji font is missing");
			}
		}

		if (existsSync(executablePath)) {
			await mkdir(this.config.storePath, { recursive: true });
			const outPath = join(this.config.storePath, "thumbnail-check.png");
			try {
				await writeSample(outPath, executablePath);
				console.log(`OK   Sample screenshot: ${outPath}  (👤 안녕 Hallo 123 👋)`);
			} catch (error: unknown) {
				const hint = thumbnailSetupHint(error) ?? "Chromium could not render the sample page.";
				console.warn(`WARN Sample render failed: ${(error as Error).message.split("\n")[0]}`);
				console.warn(`     ${hint}`);
				problems.push("sample render failed");
			}
		}

		if (problems.length === 0) {
			console.log("\nOK — thumbnail prerequisites look good.");
			return { problems };
		}

		console.log(`\n${problems.length} problem(s) found: ${problems.join("; ")}`);
		console.log("\nFixes (Debian/Ubuntu):");
		console.log("  npx playwright install chromium");
		console.log("  sudo npx playwright install-deps chromium");
		console.log("  sudo apt install -y fonts-noto-color-emoji fonts-noto-cjk fonts-nanum fonts-dejavu-core");
		console.log("  sudo fc-cache -f");
		console.log("  # In systemd, prefer an explicit path over relying on HOME:");
		console.log("  Environment=MWS_CHROMIUM_PATH=/usr/bin/chromium");
		console.log("  npx mws refresh-thumbnails");
		process.exitCode = 1;
		return { problems };
	}
}
