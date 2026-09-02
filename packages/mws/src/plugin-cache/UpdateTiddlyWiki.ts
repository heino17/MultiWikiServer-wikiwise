
import { is, truthy } from "@tiddlywiki/server";
import * as fs from "node:fs";
import { mkdir, readFile, rm, writeFile, rename, stat, readdir } from "node:fs/promises";
import * as path from "node:path";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { x as extractTar } from 'tar';

interface TW5RegistryInfo {
  _id: string;
  _rev: string;
  _etag?: string | null;
  _modified?: string | null;
  versions: Record<string, any>;
  "dist-tags": { latest: string; };
}
/** @deprecated - This is only required for the 0.2 version. */
export async function startupValidateTW5Folder(wikiPath: string) {
  if (!fs.existsSync(path.resolve(wikiPath, "tw5")))
    throw new Error("You need to run update-tiddlywiki first");

  const tw5 = path.resolve(wikiPath, "tw5");
  if (fs.existsSync(path.join(tw5, "tw5-registry.json")))
    await rename(path.join(tw5, "tw5-registry.json"), path.join(tw5, "registry.json"));

  const contents = await readdir(tw5);
  for (const e of contents) {
    const s = await stat(path.join(tw5, e));
    if (!s.isDirectory() && !s.isFile()) continue;
    if (e.startsWith("tw5-"))
      await rename(path.join(tw5, e), path.join(tw5, e.slice(4))).catch(e => {
        console.log("could not rename", e);
      });
  }
}

export async function getTW5Paths(wikiPath: string) {
  if (!fs.existsSync(path.resolve(wikiPath, "tw5")))
    throw new Error("You need to run update-tiddlywiki first");

  const folders = (await Promise.all((await readdir(path.resolve(wikiPath, "tw5"))).map(async e => {
    const s = await stat(path.resolve(wikiPath, "tw5", e));
    if (!s.isDirectory()) return;
    const t = semverRegex.exec(e);
    if (!is<SemverRegexGroups>(t?.groups, !!t?.groups)) return;
    const { major, minor, patch, meta, pr } = t.groups;
    return {
      major,
      minor,
      patch,
      extra: ""
        + (pr ? "-" + pr : "")
        + (meta ? "+" + meta : ""),
      name: e
    };
  }))).filter(truthy).sort((a, b) => {
    return +a.minor - +b.minor
      || +a.patch - +b.patch
      || a.extra.localeCompare(b.extra);
  });

  if (!folders.length) {
    throw new Error("No valid tiddlywiki folder found");
  }

  await writeFile(
    path.resolve(wikiPath, "tw5", "versions.txt"),
    folders.map(e => e.name).join("\n")
  );

  return folders;
}


export const semverRegex = /^(?<major>[0-9]+)\.(?<minor>[0-9]+)\.(?<patch>[0-9]+)(?:-(?<pr>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?<meta>\+[0-9A-Za-z-]+)?$/;
interface SemverRegexGroups {
  major: string;
  minor: string;
  patch: string;
  pr?: string;
  meta?: string;
}
export class UpdateTiddlyWiki {

  constructor(
    private registryUrl: string = "https://registry.npmjs.org/tiddlywiki",
    private manualTarball: string | null = null,
  ) {

  }

  /** This figures out if TiddlyWiki is compressed inside a folder */
  findPrefix(filenames: string[], prefix: string[]): string[] {
    const tops = new Set<string>();
    for (const e of filenames) {
      const parts = e.split("/").slice(prefix.length);
      tops.add(parts[0]);
    }
    if (tops.size === 1)
      return this.findPrefix(filenames, [...prefix, [...tops][0]]);
    else if (tops.has("boot") && tops.has("core"))
      return prefix;
    else
      throw new Error("extracted files don't make sense.");
  }

  async installLatestTiddlyWiki(wikiPath: string, manualVersion: string | undefined) {
    if (!wikiPath) throw new Error("wikiPath is required");
    await mkdir(path.resolve(wikiPath, "tw5"), { recursive: true });
    let tarballPath: string;
    if (this.manualTarball) {
      tarballPath = path.resolve(this.manualTarball);
      console.log("Extracting TiddlyWiki manually");
    } else {
      console.log("Fetching latest TiddlyWiki info...");
      const tw5Info = await this.getTiddlyWikiNPM(wikiPath);
      const latest = manualVersion ?? tw5Info["dist-tags"].latest;
      const latestInfo = tw5Info.versions[latest];
      if (!latestInfo)
        throw "The specified version does not exist";
      tarballPath = path.resolve(wikiPath, "tw5", latest + ".tgz");
      if (!fs.existsSync(tarballPath)) {
        console.log("Fetching TiddlyWiki", latest, "tarball...");
        const download = await fetch(latestInfo.dist.tarball);
        await download.body!.pipeTo(Writable.toWeb(fs.createWriteStream(tarballPath)));
      }
      console.log("TiddlyWiki download complete");
    }

    const filenames: string[] = [];
    const extractFolder = path.resolve(wikiPath, "tw5", "extract");
    await rm(extractFolder, { recursive: true, force: true });
    await mkdir(extractFolder, { recursive: true });
    await pipeline(
      fs.createReadStream(tarballPath),
      createGunzip(),
      extractTar({
        C: extractFolder,
        onReadEntry: entry => filenames.push(entry.path),
      }),
    );

    const prefix = this.findPrefix(filenames, []);
    const extractFolder2 = path.resolve(wikiPath, "tw5", "extract", ...prefix);
    const { version } = JSON.parse(await readFile(path.resolve(extractFolder2, "package.json"), "utf8"));
    const newFolder = path.resolve(wikiPath, "tw5", version);
    if (fs.existsSync(newFolder))
      throw "the tw5/" + version + " folder already exists, the tarball was successfully extracted to tw5/tw5-extract.";
    await rename(extractFolder2, newFolder);
    await rm(extractFolder, { recursive: true, force: true });
    console.log("Tiddlywiki extracted to", path.relative(wikiPath, newFolder))

    return { tw5Path: path.relative(wikiPath, newFolder), version };

  }

  async getTiddlyWikiNPM(wikiPath: string): Promise<TW5RegistryInfo> {
    const registryFile = path.resolve(wikiPath, "tw5", "registry.json");
    const tw5info: TW5RegistryInfo | undefined
      = fs.existsSync(registryFile) ? JSON.parse(await readFile(registryFile, "utf8")) : undefined;

    const res = await fetch(this.registryUrl, {
      headers: tw5info ? {
        ...tw5info._etag ? { "if-none-match": "W/" + tw5info._etag } : {},
        ...tw5info._modified ? { "if-modified-since": tw5info._modified } : {},
      } : {}
    });

    if (res.status === 304) {
      if (!tw5info) throw new Error("This error should never occur. Please include the stack trace in your report.");
      return tw5info;
    } else {
      const newJson = await res.json();
      newJson._etag = res.headers.get("if-none-match");
      newJson._modified = res.headers.get("if-modified-since");
      await writeFile(path.resolve(wikiPath, "tw5", "registry.json"), JSON.stringify(newJson, null, 2));
      return newJson;
    }
  }
}