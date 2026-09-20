// Admin storage overview endpoint.
//
// Returns a snapshot of disk usage and record counts so the admin panel can
// display a storage overview table similar to the Speicherübersicht_Vorlage.pdf.

import { zodRoute } from "@tiddlywiki/server";
import { Prisma } from "@tiddlywiki/mws-prisma";
import { promises as fs } from "fs";
import { statfsSync } from "fs";
import path from "path";

// MIME type patterns that identify binary blob content (images, videos,
// audio, PDFs, fonts, raw binaries). Wiki content that is stored as JSON,
// text, or scripting languages is not counted as a blob.
const BINARY_TYPE_PATTERNS = [
  "image/%",
  "video/%",
  "audio/%",
  "application/pdf",
  "application/octet-stream",
  "font/%",
] as const;

export interface StorageCategory {
  path: string;
  category: string;
  files: number;
  directories: number;
  totalSizeBytes: number;
  lastModified: string;
}

export interface StorageBlobsInfo {
  blobCount: number;
  blobBytes: number;
  contentBytes: number;
  tiddlerCount: number;
  storeFiles: {
    files: number;
    directories: number;
    totalSizeBytes: number;
    lastModified: string;
  };
  inbox: {
    files: number;
    totalSizeBytes: number;
  };
  orphanedStoreFiles: number;
}

export interface StorageUserUsage {
  username: string;
  wikiCount: number;
  wikiContentBytes: number;
  fileStoreBytes: number;
  totalBytes: number;
}

export interface StorageInfo {
  disk: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
  };
  lastScan: string;
  recordCounts: {
    tiddlers: number;
    bags: number;
    recipes: number;
    users: number;
    templates: number;
  };
  categories: StorageCategory[];
  blobs: StorageBlobsInfo;
  topUsers: StorageUserUsage[];
}

function binaryTypeCondition(tableAlias?: "t") {
  const column = tableAlias ? `${tableAlias}.fields` : "fields";
  return Prisma.join(
    BINARY_TYPE_PATTERNS.map((pattern) => Prisma.sql`json_extract(${Prisma.raw(column)}, '$.type') LIKE ${pattern}`),
    " OR "
  );
}

async function getDirStats(dirPath: string): Promise<{ files: number; directories: number; totalSizeBytes: number; lastModified: string }> {
  let files = 0;
  let directories = 0;
  let totalSizeBytes = 0;
  let lastModified = "";

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (entry.isDirectory()) {
          directories++;
          const sub = await getDirStats(fullPath);
          files += sub.files;
          directories += sub.directories;
          totalSizeBytes += sub.totalSizeBytes;
          if (sub.lastModified > lastModified) lastModified = sub.lastModified;
        } else {
          files++;
          totalSizeBytes += stat.size;
          const mtime = stat.mtime.toISOString();
          if (mtime > lastModified) lastModified = mtime;
        }
      } catch {
        // skip unreadable entries
      }
    }
  } catch {
    // directory doesn't exist or can't be read
  }

  return { files, directories, totalSizeBytes, lastModified };
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

export const AdminStorage = zodRoute({
  method: ["GET"],
  path: "/admin/storage",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();

    const wikiPath = state.config.wikiPath as string;
    const storePath = path.join(wikiPath, "store");
    const backupsPath = path.join(wikiPath, "backups");
    const cachePath = path.join(wikiPath, "cache");

    // Disk usage via statfs
    let disk = { totalBytes: 0, usedBytes: 0, availableBytes: 0 };
    try {
      const stats = statfsSync(wikiPath);
      disk = {
        totalBytes: stats.blocks * stats.bsize,
        availableBytes: stats.bavail * stats.bsize,
        usedBytes: (stats.blocks - stats.bfree) * stats.bsize,
      };
    } catch {
      // statfs not available on this platform
    }

    // Record counts from database
    const prisma = state.engine;
    const [tiddlerCount, bagCount, recipeCount, userCount, templateCount] = await Promise.all([
      prisma.tiddler.count(),
      prisma.bag.count(),
      prisma.recipe.count(),
      prisma.users.count(),
      prisma.template.count(),
    ]);

    // Blob & content stats: binary-type tiddlers (stored inline in the
    // database as base64 text) and the total size of all tiddler fields.
    const [blobRows, contentRows] = await Promise.all([
      prisma.$queryRaw<{ count: number; total_bytes: number }[]>`
        SELECT
          count(*) AS count,
          coalesce(sum(length(json_extract(fields, '$.text'))), 0) AS total_bytes
        FROM tiddler
        WHERE (${binaryTypeCondition()})
      `,
      prisma.$queryRaw<{ total_bytes: number }[]>`
        SELECT coalesce(sum(length(fields)), 0) AS total_bytes FROM tiddler
      `,
    ]);
    const blobCount = Number(blobRows[0]?.count ?? 0);
    const blobBytes = Number(blobRows[0]?.total_bytes ?? 0);
    const contentBytes = Number(contentRows[0]?.total_bytes ?? 0);

    // Per-user storage usage (top 10): attribute each user's wikis (recipes
    // they own) and the tiddlers in the bags used by those wikis. Binary
    // blob content is reported separately as the "file store".
    const topUserRows = await prisma.$queryRaw<
      { username: string; wiki_count: number; total_bytes: number; blob_bytes: number }[]
    >`
      SELECT
        u.username AS username,
        count(DISTINCT r.id) AS wiki_count,
        coalesce(sum(length(t.fields)), 0) AS total_bytes,
        coalesce(sum(
          CASE WHEN (${binaryTypeCondition("t")})
            THEN length(json_extract(t.fields, '$.text'))
            ELSE 0
          END
        ), 0) AS blob_bytes
      FROM users u
      LEFT JOIN recipe r ON r.owner_user_id = u.user_id
      LEFT JOIN recipe_bag rb ON rb.recipe_id = r.id
      LEFT JOIN bag b ON b.id = rb.bag_id
      LEFT JOIN tiddler t ON t.bag_id = b.id
      GROUP BY u.user_id
      HAVING count(DISTINCT r.id) > 0
      ORDER BY total_bytes DESC
      LIMIT 10
    `;
    const topUsers: StorageUserUsage[] = topUserRows.map((row) => ({
      username: row.username,
      wikiCount: Number(row.wiki_count),
      totalBytes: Number(row.total_bytes),
      fileStoreBytes: Number(row.blob_bytes),
      wikiContentBytes: Number(row.total_bytes) - Number(row.blob_bytes),
    }));

    // Category scans
    const categories: StorageCategory[] = [];

    // Database
    const dbPath = path.join(storePath, "database.sqlite");
    const dbSize = await getFileSize(dbPath);
    let dbLastMod = "";
    try {
      const stat = await fs.stat(dbPath);
      dbLastMod = stat.mtime.toISOString();
    } catch {}
    categories.push({
      path: "store/database.sqlite",
      category: "Database",
      files: dbSize > 0 ? 1 : 0,
      directories: 0,
      totalSizeBytes: dbSize,
      lastModified: dbLastMod,
    });

    // Store files (excluding database, backups subfolder, and inbox)
    const storeStats = await getDirStats(storePath);
    // subtract database size and sub-categories already counted
    let storeFiles = storeStats.files;
    if (dbSize > 0) storeFiles -= 1;
    let storeDirSize = storeStats.totalSizeBytes - dbSize;

    // Subtract inbox and files subdirectories if they exist
    const inboxPath = path.join(storePath, "inbox");
    const filesPath = path.join(storePath, "files");
    const inboxStats = await getDirStats(inboxPath);
    const attachmentStats = await getDirStats(filesPath);
    storeDirSize -= inboxStats.totalSizeBytes;
    storeDirSize -= attachmentStats.totalSizeBytes;
    storeFiles -= (inboxStats.files + attachmentStats.files);

    // Orphaned files in the attachments folder: entries that don't form a
    // valid blob (a <sha256> directory containing meta.json and a data file).
    let orphanedStoreFiles = 0;
    try {
      const entries = await fs.readdir(filesPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(filesPath, entry.name);
        try {
          if (entry.isDirectory()) {
            const isValidName = /^[a-f0-9]{64}$/.test(entry.name);
            const subEntries = await fs.readdir(entryPath);
            const hasMeta = subEntries.includes("meta.json");
            const hasData = subEntries.some((name) => name.startsWith("data"));
            if (!isValidName || !hasMeta || !hasData) orphanedStoreFiles++;
          } else {
            // Stray file directly in the attachments folder
            orphanedStoreFiles++;
          }
        } catch {
          orphanedStoreFiles++;
        }
      }
    } catch {}

    categories.push({
      path: "store/",
      category: "Application data",
      files: Math.max(0, storeFiles),
      directories: Math.max(0, storeStats.directories),
      totalSizeBytes: Math.max(0, storeDirSize),
      lastModified: storeStats.lastModified,
    });

    // Attachments
    if (attachmentStats.files > 0 || attachmentStats.totalSizeBytes > 0) {
      categories.push({
        path: "store/files/",
        category: "Attachments",
        files: attachmentStats.files,
        directories: attachmentStats.directories,
        totalSizeBytes: attachmentStats.totalSizeBytes,
        lastModified: attachmentStats.lastModified,
      });
    }

    // Inbox
    if (inboxStats.files > 0 || inboxStats.totalSizeBytes > 0) {
      categories.push({
        path: "store/inbox/",
        category: "Temporary data",
        files: inboxStats.files,
        directories: inboxStats.directories,
        totalSizeBytes: inboxStats.totalSizeBytes,
        lastModified: inboxStats.lastModified,
      });
    }

    // Backups
    const backupStats = await getDirStats(backupsPath);
    categories.push({
      path: "backups/",
      category: "Backups",
      files: backupStats.files,
      directories: backupStats.directories,
      totalSizeBytes: backupStats.totalSizeBytes,
      lastModified: backupStats.lastModified,
    });

    // Cache
    const cacheStats = await getDirStats(cachePath);
    categories.push({
      path: "cache/",
      category: "Cache",
      files: cacheStats.files,
      directories: cacheStats.directories,
      totalSizeBytes: cacheStats.totalSizeBytes,
      lastModified: cacheStats.lastModified,
    });

    // Remaining wiki-level files (package.json, config, etc.)
    try {
      const topEntries = await fs.readdir(wikiPath, { withFileTypes: true });
      let topLevelFilesBytes = 0;
      let topLevelFileCount = 0;
      for (const entry of topEntries) {
        if (entry.isFile()) {
          try {
            const stat = await fs.stat(path.join(wikiPath, entry.name));
            topLevelFilesBytes += stat.size;
            topLevelFileCount++;
          } catch {}
        }
      }
      if (topLevelFileCount > 0) {
        categories.push({
          path: ".",
          category: "System & configuration",
          files: topLevelFileCount,
          directories: 0,
          totalSizeBytes: topLevelFilesBytes,
          lastModified: "",
        });
      }
    } catch {}

    return {
      disk,
      lastScan: new Date().toISOString(),
      recordCounts: {
        tiddlers: tiddlerCount,
        bags: bagCount,
        recipes: recipeCount,
        users: userCount,
        templates: templateCount,
      },
      categories,
      blobs: {
        blobCount,
        blobBytes,
        contentBytes,
        tiddlerCount,
        storeFiles: {
          files: attachmentStats.files,
          directories: attachmentStats.directories,
          totalSizeBytes: attachmentStats.totalSizeBytes,
          lastModified: attachmentStats.lastModified,
        },
        inbox: {
          files: inboxStats.files,
          totalSizeBytes: inboxStats.totalSizeBytes,
        },
        orphanedStoreFiles,
      },
      topUsers,
    } satisfies StorageInfo;
  }
});
