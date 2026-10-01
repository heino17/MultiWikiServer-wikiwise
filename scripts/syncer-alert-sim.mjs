import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const BASE_URL = process.env.MWS_URL ?? "http://127.0.0.1:5099";
const WIKI = process.env.MWS_WIKI ?? "dein-tiddlywiki";
const ABORT_REASON = process.env.MWS_ABORT_REASON ?? "failed";
// The defaults are chosen for the measured behaviour of the MWS client: the
// syncer polls every 60 s, so an outage of 20 samples (100 s) is needed to see
// the first failing poll and the 5/10/30/60 s backoff. The recovery window has
// to outlast the 60 s backoff, otherwise the next attempt - the one that clears
// the alert - does not happen inside the measurement.
const OUTAGE_SAMPLES = Number(process.env.MWS_OUTAGE_SAMPLES ?? 20);
const RECOVERY_SAMPLES = Number(process.env.MWS_RECOVERY_SAMPLES ?? 16);
const SAMPLE_INTERVAL_MS = Number(process.env.MWS_SAMPLE_INTERVAL_MS ?? 5000);
const ALERT_TAG = "$:/tags/Alert";
const POLL_PATTERNS = [
	"**/recipe/**/updates*",
	"**/recipe/**/list.json*",
	"**/recipe/**/status*"
];

if (process.argv.includes("--help")) {
	console.log(`syncer-alert-sim misst das Alarmverhalten des Wiki-Syncers bei Netzausfall.

Umgebungsvariablen:
  MWS_URL             Basis-URL des Servers (Standard http://127.0.0.1:5099)
  MWS_WIKI            Wiki-Slug (Standard dein-tiddlywiki)
  MWS_ABORT_REASON    Playwright-Abbruchgrund: failed | connectionfailed | timedout (Standard failed)
  MWS_OUTAGE_SAMPLES  Messpunkte während des Ausfalls (Standard 20)
  MWS_RECOVERY_SAMPLES Messpunkte nach der Wiederkehr (Standard 16)
  MWS_SAMPLE_INTERVAL_MS Abstand zwischen zwei Messpunkten (Standard 5000)`);
	process.exit(0);
}

function findChromium() {
	const candidates = [process.env.MWS_CHROMIUM_PATH, process.env.CHROME_PATH];
	const cacheRoot = join(homedir(), ".cache", "ms-playwright");
	let found = [];
	try {
		found = readdirSync(cacheRoot)
			.map((dir) => {
				const match = /^chromium(?:_headless_shell)?-(\d+)$/.exec(dir);
				if (!match) return undefined;
				const shell = dir.includes("headless_shell");
				const layouts = shell
					? [["chrome-linux", "headless_shell"], ["chrome-headless-shell-linux64", "chrome-headless-shell"]]
					: [["chrome-linux", "chrome"]];
				for (const [subDir, binary] of layouts) {
					const candidate = join(cacheRoot, dir, subDir, binary);
					if (existsSync(candidate)) return { rev: Number.parseInt(match[1], 10), shell, path: candidate };
				}
				return undefined;
			})
			.filter((entry) => entry !== undefined)
			.sort((a, b) => b.rev - a.rev || (a.shell ? 1 : 0) - (b.shell ? 1 : 0))
			.map((entry) => entry.path);
	} catch {
		found = [];
	}
	candidates.push(...found, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium");
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	throw new Error("Kein Chromium gefunden");
}

function classify(url) {
	if (url.includes("/updates")) return "updates";
	if (url.includes("/list.json")) return "list";
	if (url.includes("/status")) return "status";
	return undefined;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const counts = { updates: 0, list: 0, status: 0 };
const started = Date.now();
const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
const samples = [];

const browser = await chromium.launch({
	executablePath: findChromium(),
	args: ["--no-sandbox"]
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on("request", (request) => {
	const kind = classify(request.url());
	if (kind) counts[kind] += 1;
});

async function readAlerts() {
	return await page.evaluate((tag) => {
		const wiki = window.$tw?.wiki;
		if (!wiki) return [];
		return wiki.getTiddlersWithTag(tag).map((title) => {
			const tiddler = wiki.getTiddler(title);
			return {
				title,
				component: tiddler?.fields?.component ?? "",
				count: Number(tiddler?.fields?.count ?? 1),
				text: String(tiddler?.fields?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 160)
			};
		});
	}, ALERT_TAG);
}

async function sample(phase, label) {
	const alerts = await readAlerts();
	const previous = samples[samples.length - 1];
	const snapshot = { ...counts };
	samples.push({
		phase,
		label,
		t: Number(seconds()),
		alerts: alerts.length,
		updates: snapshot.updates,
		list: snapshot.list,
		status: snapshot.status,
		dUpdates: previous ? snapshot.updates - previous.updates : 0,
		dList: previous ? snapshot.list - previous.list : 0,
		dStatus: previous ? snapshot.status - previous.status : 0,
		details: alerts
	});
	return samples[samples.length - 1];
}

async function waitFor(predicate, timeoutMs, message) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await sleep(250);
	}
	throw new Error(message);
}

console.log(`Ziel: ${BASE_URL}/wiki/${WIKI}`);
console.log(`Browser: ${findChromium()}`);
console.log(`Abbruchgrund: ${ABORT_REASON}`);
console.log(`Messpunkte: ${OUTAGE_SAMPLES} × ${SAMPLE_INTERVAL_MS} ms Ausfall, ${RECOVERY_SAMPLES} × ${SAMPLE_INTERVAL_MS} ms Recovery\n`);

await page.goto(`${BASE_URL}/wiki/${encodeURIComponent(WIKI)}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.$tw?.syncer), null, { timeout: 60000 });
console.log(`${seconds()}s Wiki gebootet, Syncer aktiv`);

await waitFor(() => counts.updates >= 1, 60000, "Kein /updates-Request innerhalb von 60s beobachtet");
console.log(`${seconds()}s Erstes Polling gesehen (updates=${counts.updates})`);

await sleep(SAMPLE_INTERVAL_MS);
await sample("baseline", "letzter Wert vor Ausfall");

for (const pattern of POLL_PATTERNS) {
	await page.route(pattern, (route) => route.abort(ABORT_REASON));
}
console.log(`${seconds()}s Ausfall simuliert (${POLL_PATTERNS.join(", ")})\n`);

for (let i = 1; i <= OUTAGE_SAMPLES; i++) {
	await sleep(SAMPLE_INTERVAL_MS);
	await sample("outage", `Ausfall ${i}/${OUTAGE_SAMPLES}`);
}

await page.unrouteAll({ behavior: "ignoreErrors" });
console.log(`\n${seconds()}s Netzwerk wiederhergestellt\n`);

for (let i = 1; i <= RECOVERY_SAMPLES; i++) {
	await sleep(SAMPLE_INTERVAL_MS);
	await sample("recovery", `Recovery ${i}/${RECOVERY_SAMPLES}`);
}

await browser.close();

const pad = (value, width) => String(value).padStart(width);
const header = `${"Phase".padEnd(9)}${pad("t[s]", 7)}${pad("Alerts", 8)}${pad("count", 7)}${pad("Δupd", 7)}${pad("Δlist", 8)}${pad("Δstat", 8)}  Meldung`;
console.log(header);
console.log("-".repeat(header.length + 20));
for (const row of samples) {
	const maxCount = row.details.reduce((max, alert) => Math.max(max, alert.count), 0);
	const message = row.details[0]?.text ?? "";
	console.log(
		`${row.phase.padEnd(9)}${pad(row.t, 7)}${pad(row.alerts, 8)}${pad(maxCount, 7)}${pad(row.dUpdates, 7)}${pad(row.dList, 8)}${pad(row.dStatus, 8)}  ${message.slice(0, 70)}`
	);
}

const outage = samples.filter((row) => row.phase === "outage");
const recovery = samples.filter((row) => row.phase === "recovery");
const texts = [...new Set(samples.flatMap((row) => row.details.map((alert) => alert.text)))];
const components = [...new Set(samples.flatMap((row) => row.details.map((alert) => alert.component)))];
const alertCounts = samples.flatMap((row) => row.details.map((alert) => alert.count));
const summary = {
	baseUrl: BASE_URL,
	wiki: WIKI,
	abortReason: ABORT_REASON,
	maxAlerts: Math.max(...samples.map((row) => row.alerts)),
	maxCount: alertCounts.length ? Math.max(...alertCounts) : 0,
	alertTexts: texts,
	alertComponents: components,
	updatesDuringOutage: outage.reduce((sum, row) => sum + row.dUpdates, 0),
	alertsAfterRecovery: recovery[recovery.length - 1]?.alerts ?? 0
};
console.log("\n" + JSON.stringify(summary, null, 2));