import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { SqlDriverAdapter, SqlMigrationAwareDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import { readdir, readFile } from "fs/promises";
import { dist_resolve } from "../utils";
import { createHash, randomUUID } from "crypto";
import { existsSync } from "fs";

export class SqliteAdapter {
  constructor(private databasePath: string) {
    this.adapter = new PrismaBetterSQLite3({ url: "file:" + this.databasePath });
  }

  adapter!: SqlMigrationAwareDriverAdapterFactory;
  async init() {
    const libsql = await this.adapter.connect();

    if (process.env.RUN_OLD_MWS_DB_SETUP_FOR_TESTING) {
      await libsql.executeScript(await readFile(dist_resolve(
        "../prisma/migrations/20250406213424_init/migration.sql"
      ), "utf8"));
    }

    const tables = await libsql.queryRaw({
      sql: `SELECT tbl_name FROM sqlite_master WHERE type='table'`,
      args: [],
      argTypes: [],
    }).then(e => e?.rows as [string][] | undefined);

    const hasExisting = !!tables?.length;

    const hasMigrationsTable = !!tables?.length && !!tables?.some((e) => e[0] === "_prisma_migrations");
    if (!hasMigrationsTable) await this.createMigrationsTable(libsql);
    await this.checkMigrationsTable(libsql, hasExisting && !hasMigrationsTable);

    await libsql.dispose();
  }
  async createMigrationsTable(libsql: SqlDriverAdapter) {
    await libsql.executeScript(
      'CREATE TABLE "_prisma_migrations" (\n' +
      '    "id"                    TEXT PRIMARY KEY NOT NULL,\n' +
      '    "checksum"              TEXT NOT NULL,\n' +
      '    "finished_at"           DATETIME,\n' +
      '    "migration_name"        TEXT NOT NULL,\n' +
      '    "logs"                  TEXT,\n' +
      '    "rolled_back_at"        DATETIME,\n' +
      '    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,\n' +
      '    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0\n' +
      ')',
    )
  }
  async checkMigrationsTable(libsql: SqlDriverAdapter, migrateExisting: boolean) {

    const applied_migrations = new Set(
      await libsql.queryRaw({
        sql: `Select migration_name from _prisma_migrations`,
        args: [],
        argTypes: [],
      }).then(e => e.rows.map(e => e[0]))
    );

    // this checks the migration path and 
    if (applied_migrations.size && !applied_migrations.has("20250406213424_init")) {
      console.log("Unknown migrations have been found in the database.");
      console.log("There is no way to guarentee the integrity of the database under these conditions.");
      console.log("The only way I know of that you could be seeing this message is if you installed this verion of MWS in a project either from the PR branch or from a newer version of MWS.");
      console.log("Please revert back to the version you had installed before.");
      console.log("The sqlite database can be opened manually with any third-party SQLite tool to retrieve your data. If you do this, make sure you keep all the files in the store folder together, as they are all an integral part of your sqlite database and deleting any of them manually is very likely to cause data loss.");
      process.exit();
    } else {
      console.log([
        "=======================================================================================",
        "This version of MWS is no longer supported. It is an alpha version",
        "and you shouldn't be using it in production anyway. Please export any",
        "wikis you want to keep by opening them and downloading them as single-file",
        "wikis by clicking on the cloud status icon and then 'save snapshot for offline use'.",
        "=======================================================================================",
      ].join("\n"))
    }

    const migrations = await readdir(dist_resolve("../prisma/migrations"));
    migrations.sort();

    const new_migrations = migrations.filter(m => !applied_migrations.has(m) && m !== "migration_lock.toml");
    if (!new_migrations.length) return;

    function generateChecksum(fileContent: string) {
      return createHash('sha256').update(fileContent).digest('hex');
    }

    console.log("New migrations found", new_migrations);

    for (const migration of new_migrations) {
      const migration_path = dist_resolve(`../prisma/migrations/${migration}/migration.sql`);
      if (!existsSync(migration_path)) continue;

      const fileContent = await readFile(migration_path, 'utf-8');
      // this is the hard-coded name of the first migration.
      if (migrateExisting && migration === "20250406213424_init") {
        console.log("Existing migration", migration, "is already applied");
      } else {
        console.log("Applying migration", migration);
        await libsql.executeScript(fileContent);
      }

      await libsql.executeRaw({
        sql: 'INSERT INTO _prisma_migrations (' +
          'id, migration_name, checksum, finished_at, logs, rolled_back_at, started_at, applied_steps_count' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [randomUUID(), migration, generateChecksum(fileContent), Date.now(), null, null, Date.now(), 1],
        argTypes: [], // this doesn't appear to be used at the moment
      });

    }
    console.log("Migrations applied", new_migrations);
  }
}