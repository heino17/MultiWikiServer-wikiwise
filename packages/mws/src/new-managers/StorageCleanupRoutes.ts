// Admin storage cleanup endpoint.
//
// Finds and (optionally) removes disk space that is no longer needed:
//   1. stale upload spools in store/inbox/ (aborted multipart uploads),
//   2. structurally orphaned entries in store/files/ (no valid byte store),
//   3. unreferenced content-addressed blobs in store/files/ (valid sha256
//      dir that is not referenced by any UserFile).
//
// GET /admin/storage/cleanup  -> dry run: preview only, nothing is deleted.
// POST /admin/storage/cleanup -> real run: deletes the found candidates.
//
// Everything is admin-only (same checks as the storage overview endpoint).

import { zodRoute } from "@tiddlywiki/server";
import { promises as fs } from "fs";
import path from "path";
import { getDirStats } from "./StorageRoutes";

// A candidate is only touched when the newest file inside it is older than
// this, so a concurrent (in-flight) write can never be interrupted.
const STALE_AGE_MS = 60 * 60 * 1000;

const SHA256_RE = /^[a-f0-9]{64}$/;

export interface StorageCleanupCategory {
  count: number;
  bytes: number;
  samples: string[];
}

export interface StorageCleanupPreview {
  generatedAt: string;
  dryRun: boolean;
  staleAfterMs: number;
  categories: {
    inbox: StorageCleanupCategory;
    orphaned: StorageCleanupCategory;
    unreferenced: StorageCleanupCategory;
  };
  total: {
    count: number;
    bytes: number;
  };
}

async function hasBlobStructure(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath);
    const hasData = entries.some((f) => f === "data" || f.startsWith("data."));
    return entries.includes("meta.json") && hasData;
  } catch {
    return false;
  }
}

export const AdminStorageCleanup = zodRoute({
  method: ["GET", "POST"],
  path: "/admin/storage/cleanup",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();

    const dryRun = state.method === "GET";
    const storePath = state.config.storePath as string;
    const filesDir = path.join(storePath, "files");
    const inboxDir = path.join(storePath, "inbox");
    const now = Date.now();

    const userFiles = await state.engine.userFile.findMany({ select: { sha256: true } });
    const referenced = new Set(userFiles.map((row) => row.sha256));

    const staleInbox: string[] = [];
    if (inboxDir.startsWith(storePath)) {
      try {
        const entries = await fs.readdir(inboxDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const fullPath = path.join(inboxDir, entry.name);
          if (!fullPath.startsWith(storePath)) continue;
          const stats = await getDirStats(fullPath);
          if (!stats.lastModified || now - new Date(stats.lastModified).getTime() > STALE_AGE_MS) {
            staleInbox.push(fullPath);
          }
        }
      } catch {
        // missing/unreadable inbox → nothing to clean
      }
    }

    const orphaned: string[] = [];
    const unreferenced: { dir: string; bytes: number }[] = [];
    if (filesDir.startsWith(storePath)) {
      try {
        const entries = await fs.readdir(filesDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(filesDir, entry.name);
          if (!fullPath.startsWith(storePath)) continue;
          if (entry.isDirectory()) {
            const isBlob = SHA256_RE.test(entry.name) && (await hasBlobStructure(fullPath));
            if (isBlob) {
              if (!referenced.has(entry.name)) {
                const stats = await getDirStats(fullPath);
                if (!stats.lastModified || now - new Date(stats.lastModified).getTime() > STALE_AGE_MS) {
                  unreferenced.push({ dir: fullPath, bytes: stats.totalSizeBytes });
                }
              }
            } else {
              orphaned.push(fullPath);
            }
          } else {
            orphaned.push(fullPath);
          }
        }
      } catch {
        // missing/unreadable files dir → nothing to clean
      }
    }

    let staleInboxBytes = 0;
    for (const dir of staleInbox) {
      staleInboxBytes += (await getDirStats(dir)).totalSizeBytes;
    }
    let orphanedBytes = 0;
    for (const dir of orphaned) {
      orphanedBytes += (await getDirStats(dir)).totalSizeBytes;
    }
    let unreferencedBytes = 0;
    for (const item of unreferenced) {
      unreferencedBytes += item.bytes;
    }

    if (!dryRun) {
      for (const dir of staleInbox) await fs.rm(dir, { recursive: true, force: true });
      for (const dir of orphaned) await fs.rm(dir, { recursive: true, force: true });
      for (const item of unreferenced) await fs.rm(item.dir, { recursive: true, force: true });
    }

    const samples = (dirs: string[]) => dirs.slice(0, 10).map((d) => path.basename(d));

    return {
      generatedAt: new Date().toISOString(),
      dryRun,
      staleAfterMs: STALE_AGE_MS,
      categories: {
        inbox: { count: staleInbox.length, bytes: staleInboxBytes, samples: samples(staleInbox) },
        orphaned: { count: orphaned.length, bytes: orphanedBytes, samples: samples(orphaned) },
        unreferenced: {
          count: unreferenced.length,
          bytes: unreferencedBytes,
          samples: samples(unreferenced.map((i) => i.dir)),
        },
      },
      total: {
        count: staleInbox.length + orphaned.length + unreferenced.length,
        bytes: staleInboxBytes + orphanedBytes + unreferencedBytes,
      },
    } satisfies StorageCleanupPreview;
  }
});