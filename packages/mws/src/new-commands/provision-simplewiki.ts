import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { readFileSync } from "fs";
import * as path from "path";
import { defaultPreloadFunction } from "../plugin-cache";

/** Where the server splices in the store, and how it spells the call.
 *
 *  Both are a byte-exact `indexOf` and a name, so the shell has to fit them
 *  exactly. The point is an element of its own rather than `</head>`: the
 *  shell carries an embedded editor, and that bundle contains a closing head
 *  tag inside a string literal long before the real one. `indexOf` does not
 *  know the difference, takes the copy in the bundle, and drops the store
 *  there — invisible, so the wiki comes up empty. */
const INJECTION_LOCATION = `<script class="simplewiki-store-point"></script>`;

/** Class name of the JSON island the server fills in the regular
 *  tiddlywiki5.html. A custom shell never sees it and has no use for it. */
const TW_STORE_MARKER = "tiddlywiki-tiddler-store";

export const SIMPLEWIKI_TEMPLATE = "SimpleWiki";

const info: CommandInfo = {
	name: "provision-simplewiki",
	description: "Create or update the SimpleWiki template from a built simplewiki.html, so wikis can be created that serve the SimpleWiki interface instead of TiddlyWiki",
	arguments: [
		["path", "Path to the built simplewiki.html"],
	],
	options: [
		["template <string>", `Name of the template to write (default: ${SIMPLEWIKI_TEMPLATE}).`],
		["users <string...>", "Roles that may create wikis from this template (default: every role with teacher capability)."],
	],
};

type ProvisionSimpleWikiOptions = {
	"template"?: [string];
	"users"?: string[];
};

/**
 * How often the shell carries the injection point. Exactly one is required.
 * The server takes the first occurrence in the raw text, and a shell that
 * documents itself may well mention the point inside an HTML comment. The
 * browser never sees that comment, but the server does — and it then writes
 * the store into it, where it stays invisible. The wiki comes up perfectly,
 * only empty.
 */
function countInjectionLocations(html: string): number {
	let count = 0;
	let at = html.indexOf(INJECTION_LOCATION);
	while (at !== -1) {
		count++;
		at = html.indexOf(INJECTION_LOCATION, at + 1);
	}
	return count;
}

/**
 * Reads the shell and refuses anything that would serve a broken wiki.
 *
 * A custom HTML shell is not booted by TiddlyWiki. The server writes
 * `$tw.preloadTiddler({…});` calls behind the injection location and leaves the
 * rest of the page to the shell, which means the shell itself has to define
 * that function — the server ships no bootstrap of its own for custom HTML.
 * Get either half wrong and nothing crashes: the page renders and the pages are
 * simply not there.
 */
export function readSimpleWikiShell(filePath: string): { html: string; bytes: number } {
	const html = readFileSync(filePath, "utf8");
	const bytes = Buffer.byteLength(html, "utf8");

	const locations = countInjectionLocations(html);
	if (locations === 0) {
		throw new Error(
			`The shell has no store point. The store is written directly behind the ` +
			`first occurrence of that string, so it has to appear on one line, exactly:\n  ${INJECTION_LOCATION}`
		);
	}
	if (locations > 1) {
		throw new Error(
			`The shell carries the store point ${locations} times. Only the first ` +
			`occurrence is used, so a copy inside an HTML comment would take the store and ` +
			`leave the wiki empty. Keep one, and describe it in words instead of quoting it.`
		);
	}

	const injectionAt = html.indexOf(INJECTION_LOCATION);
	const bootstrapAt = html.indexOf(`${defaultPreloadFunction} =`);
	if (bootstrapAt === -1) {
		throw new Error(
			`The shell does not define ${defaultPreloadFunction}. The server injects calls ` +
			`to it, but no bootstrap of its own, because a custom shell is expected to take ` +
			`care of that. Put this in front of the store point:\n` +
			`  <script>\n` +
			`  window.$tw = window.$tw || Object.create(null);\n` +
			`  $tw.preloadTiddlers = $tw.preloadTiddlers || [];\n` +
			`  ${defaultPreloadFunction} = function (fields) { $tw.preloadTiddlers.push(fields); };\n` +
			`  </script>`
		);
	}
	if (bootstrapAt > injectionAt) {
		throw new Error(
			`The shell defines ${defaultPreloadFunction} behind the store point. The ` +
			`store arrives before it and would call an undefined function.`
		);
	}

	if (html.includes(TW_STORE_MARKER)) {
		throw new Error(
			`The shell carries the TiddlyWiki store marker. That marker belongs to the regular ` +
			`tiddlywiki5.html, which the server fills with a JSON array; a custom shell is ` +
			`served $tw.preloadTiddler calls instead and never sees the marker.`
		);
	}

	return { html, bytes };
}


export class ProvisionSimpleWikiCommand extends BaseCommand<[string], ProvisionSimpleWikiOptions> {
	static info = info;

	async execute() {
		if (this.params.length < 1) {
			throw "Missing parameters for provision-simplewiki command";
		}

		const filePath = path.resolve(this.params[0]);
		const templateName = this.options["template"]?.[0] ?? SIMPLEWIKI_TEMPLATE;
		const { html, bytes } = readSimpleWikiShell(filePath);

		const engine = this.config.engine;
		const namedUsers = this.options["users"];

		const result = await engine.$transaction(async (prisma) => {
			// The site admin keeps the template editable through the admin app.
			const adminRole = await prisma.roles.findUnique({
				where: { role_name: "ADMIN" },
				select: { role_id: true },
			});
			if (!adminRole) throw new Error(`The store has no ADMIN role; run init-store first`);

			// Who may build a wiki from this template. Default is every role
			// carrying teacher capability, named by the is_teacher flag rather
			// than by role name: that flag is what the capability rides on, and
			// these roles may be renamed freely.
			const userRoles = namedUsers
				? await prisma.roles.findMany({
					where: { role_name: { in: namedUsers } },
					select: { role_id: true, role_name: true },
				})
				: await prisma.roles.findMany({
					where: { is_teacher: true },
					select: { role_id: true, role_name: true },
				});
			const missing = (namedUsers ?? []).filter(name => !userRoles.some(role => role.role_name === name));
			if (missing.length) throw new Error(`These roles do not exist: ${missing.join(", ")}`);

			const definition = {
				type: "simpleV1",
				description: "Serves the SimpleWiki interface instead of TiddlyWiki. Wikis from this template start empty.",
				readonlyBags: [],
				writablePrefixBags: [],
				// No plugins at all: a custom shell is not booted by TiddlyWiki,
				// so $:/core and the sync client would only be dead weight. The
				// interface reads and writes through the /recipe/<slug>/batch
				// routes instead.
				plugins: [],
				requiredPluginsEnabled: false,
				customHtmlEnabled: true,
				htmlContent: html,
				// The shell carries its own scripts and styles inline, which the
				// per-wiki CSP allows. Nothing is loaded from a plugin route.
				//
				// This name is not a route here, it is the call the server writes
				// into the page: it emits `$tw.preloadTiddler({…});` behind
				// INJECTION_LOCATION. The shell has to define that function, and
				// the command above refuses shells that do not.
				injectionFunction: defaultPreloadFunction,
				injectionLocation: INJECTION_LOCATION,
				externalPlugins: false,
				externalStore: false,
				twVersion: null,
			};

			const existing = await prisma.template.findUnique({ where: { name: templateName } });
			const permissions = [
				{ level: "B_write" as const, role_id: adminRole.role_id },
				...userRoles.map(role => ({ level: "A_read" as const, role_id: role.role_id })),
			];

			if (existing) {
				await prisma.templatePermission.deleteMany({ where: { template_id: existing.id } });
				await prisma.template.update({
					where: { name: templateName },
					data: { definition: definition as any, permissions: { create: permissions } },
				});
				return { action: "updated", id: existing.id, mayUse: userRoles.map(role => role.role_name) };
			}

			const created = await prisma.template.create({
				data: {
					name: templateName,
					type: "simpleV1",
					definition: definition as any,
					permissions: { create: permissions },
				},
				select: { id: true },
			});
			return { action: "created", id: created.id, mayUse: userRoles.map(role => role.role_name) };
		});

		console.log(`Template "${templateName}" ${result.action} (id ${result.id})`);
		console.log(`  shell      ${filePath}`);
		console.log(`  size       ${(bytes / 1024).toFixed(1)} kB`);
		console.log(`  injects    $tw.preloadTiddler behind a single ${INJECTION_LOCATION}`);
		console.log(`  editable   ADMIN`);
		console.log(`  may use    ${result.mayUse.join(", ") || "(nobody yet)"}`);
		console.log("");
		console.log("New wikis are created from it in the admin app under \"Create a wiki\".");
	}
}
