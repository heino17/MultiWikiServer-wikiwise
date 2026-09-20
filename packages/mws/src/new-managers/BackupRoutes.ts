// Admin backup endpoints.
//
// Everything the wiki stores (tiddlers, bags, recipes, users, roles) lives in
// the single SQLite database inside the `store` folder. A consistent snapshot
// of that running database plus a few small side files (password key, config,
// versions) is therefore a complete backup.
//
// The snapshot is produced with SQLite's `VACUUM INTO`, which is safe to run
// while the server is live and picks up everything that is in the write-ahead
// log. Backups are written to `backups/<timestamp>/` next to the `store`
// folder and pruned to the newest RETENTION entries.

import { zodRoute } from "@tiddlywiki/server";
import { promises as fs } from "fs";
import path from "path";
import { crc32, deflateRawSync } from "zlib";

const RETENTION = 10;
const BACKUP_DIRNAME = "backups";
const BACKUP_NAME = /^mws-[0-9][0-9-]*$/;

export interface BackupEntry {
  name: string;
  createdAt: string;
  sizeBytes: number;
  files: { name: string; sizeBytes: number }[];
}

function backupsRoot(wikiPath: string) {
  return path.join(wikiPath, BACKUP_DIRNAME);
}

function readMeta(value: any): BackupEntry | null {
  if (!value || typeof value !== "object") return null;
  const files = Array.isArray(value.files) ? value.files : [];
  return {
    name: String(value.name ?? ""),
    createdAt: String(value.createdAt ?? ""),
    sizeBytes: Number(value.sizeBytes ?? 0),
    files,
  };
}

async function listBackups(wikiPath: string): Promise<BackupEntry[]> {
  const root = backupsRoot(wikiPath);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const backups: BackupEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("mws-")) continue;
    try {
      const meta = readMeta(JSON.parse(await fs.readFile(path.join(root, entry.name, "backup.json"), "utf8")));
      if (meta) backups.push(meta);
    } catch {
      // ignore incomplete backup folders
    }
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

function timestamp() {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    now.getUTCFullYear(), pad(now.getUTCMonth() + 1), pad(now.getUTCDate()),
    "-", pad(now.getUTCHours()), pad(now.getUTCMinutes()), pad(now.getUTCSeconds()),
    pad(now.getUTCMilliseconds(), 3),
  ].join("");
}

async function nextBackupName(root: string) {
  const base = `mws-${timestamp()}`;
  let name = base;
  for (let i = 1; ; i++) {
    try {
      await fs.access(path.join(root, name));
    } catch {
      return name;
    }
    name = `${base}-${i}`;
  }
}

/**
 * Builds a zip archive from in-memory file contents. Uses deflate when it
 * actually shrinks the data, otherwise stores it. Only depends on node's zlib,
 * so no extra package is needed.
 */
function buildZip(entries: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data) >>> 0;
    const compressed = deflateRawSync(entry.data);
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // UTF-8 file names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra length
    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);        // version made by
    central.writeUInt16LE(20, 6);        // version needed
    central.writeUInt16LE(0x0800, 8);    // UTF-8 file names
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);        // extra length
    central.writeUInt16LE(0, 32);        // comment length
    central.writeUInt16LE(0, 34);        // disk start
    central.writeUInt16LE(0, 36);        // internal attributes
    central.writeUInt32LE(0, 38);        // external attributes
    central.writeUInt32LE(offset, 42);   // local header offset
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);               // disk number
  end.writeUInt16LE(0, 6);               // central directory disk
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);              // comment length

  return Buffer.concat([...localParts, centralBuf, end]);
}

function backupDir(wikiPath: string, name: string) {
  if (!BACKUP_NAME.test(name)) return null;
  return path.join(backupsRoot(wikiPath), name);
}

export const AdminBackup = zodRoute({
  method: ["PUT"],
  path: "/admin/backup",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();

    const wikiPath = state.config.wikiPath as string;
    const root = backupsRoot(wikiPath);
    const name = await nextBackupName(root);
    const dir = path.join(root, name);
    await fs.mkdir(dir, { recursive: true });

    // Consistent snapshot of the live database (includes WAL contents).
    // VACUUM cannot run inside a transaction, so this uses the engine directly.
    const snapshotPath = path.join(dir, "database.sqlite");
    await state.engine.$executeRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

    const files: { name: string; sizeBytes: number }[] = [];
    files.push({ name: "database.sqlite", sizeBytes: (await fs.stat(snapshotPath)).size });

    const optional: [string, string][] = [
      [path.join(wikiPath, "passwords.key"), "passwords.key"],
      [path.join(wikiPath, "package.json"), "package.json"],
      [path.join(wikiPath, "package-lock.json"), "package-lock.json"],
      [path.join(wikiPath, "tw5", "versions.txt"), "tw5-versions.txt"],
    ];
    // include any config files at the top level (mws.json, mws.dev.json, …)
    try {
      for (const entry of await fs.readdir(wikiPath, { withFileTypes: true })) {
        if (entry.isFile() && /^mws.*\.json$/.test(entry.name))
          optional.push([path.join(wikiPath, entry.name), entry.name]);
      }
    } catch {
      // ignore unreadable data folder listing
    }

    for (const [src, dest] of optional) {
      try {
        await fs.copyFile(src, path.join(dir, dest));
        files.push({ name: dest, sizeBytes: (await fs.stat(path.join(dir, dest))).size });
      } catch {
        // optional file not present, skip it
      }
    }

    const createdAt = new Date().toISOString();
    const entry: BackupEntry = {
      name,
      createdAt,
      sizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      files,
    };
    await fs.writeFile(
      path.join(dir, "backup.json"),
      JSON.stringify({ ...entry, versions: state.config.versions }, null, 2),
    );

    // retention: drop the oldest entries beyond the limit
    for (const old of (await listBackups(wikiPath)).slice(RETENTION))
      await fs.rm(path.join(root, old.name), { recursive: true, force: true });

    return { backup: entry, backups: await listBackups(wikiPath) };
  }
});

export const AdminBackupList = zodRoute({
  method: ["GET"],
  path: "/admin/backup/list",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();
    return { backups: await listBackups(state.config.wikiPath as string) };
  }
});

export const AdminBackupDownload = zodRoute({
  method: ["GET"],
  path: "/admin/backup/download",
  bodyFormat: "ignore",
  zodPathParams: z => ({}),
  zodQueryKeys: ["name"],
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();

    const name = state.query.get("name") ?? "";
    const dir = backupDir(state.config.wikiPath as string, name);
    if (!dir) throw state.sendEmpty(404, { "x-reason": "Unknown backup" });

    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      throw state.sendEmpty(404, { "x-reason": "Unknown backup" });
    }

    const entries: { name: string; data: Buffer }[] = [];
    for (const dirent of dirents) {
      if (!dirent.isFile()) continue;
      entries.push({ name: `${name}/${dirent.name}`, data: await fs.readFile(path.join(dir, dirent.name)) });
    }
    if (!entries.length) throw state.sendEmpty(404, { "x-reason": "Empty backup" });

    return state.sendBuffer(200, {
      contentType: "application/zip",
      contentDisposition: `attachment; filename="${name}.zip"`,
      cacheControl: "no-store",
    }, buildZip(entries));
  }
});

export const AdminBackupDelete = zodRoute({
  method: ["PUT"],
  path: "/admin/backup/delete",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    name: z.string().min(1).max(120),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();

    const { name } = state.data;
    const dir = backupDir(state.config.wikiPath as string, name);
    if (!dir) throw state.sendEmpty(404, { "x-reason": "Unknown backup" });

    await fs.rm(dir, { recursive: true, force: true });
    return { name, deleted: true, backups: await listBackups(state.config.wikiPath as string) };
  }
});

