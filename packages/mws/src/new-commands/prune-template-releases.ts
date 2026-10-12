import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { pruneAllTemplateReleases } from "../new-managers/template-releases";

const info: CommandInfo = {
  name: "prune-template-releases",
  description: "Delete every template shell release except the newest per template and the releases wikis have pinned, then compact the database",
  arguments: [],
  getHelp() {
    return [
      "",
      "A release stores the whole template definition, and a custom shell runs",
      "into the megabytes, so a store that accumulated releases before dedupe",
      "can grow far beyond its content. Every write now prunes the older ones",
      "on its own; this command does the same for everything that is already",
      "there and then compacts the file.",
      "",
      "Kept are the newest release of each template (what \"auto\" wikis serve",
      "and what the update banner compares against) and every release a wiki",
      "has pinned. Nothing a running wiki serves is touched.",
    ].join("\n");
  },
};

export class PruneTemplateReleasesCommand extends BaseCommand<[]> {
  static info = info;

  async execute() {
    const engine = this.config.engine;

    const { deleted, templates } = await engine.$transaction(
      (prisma) => pruneAllTemplateReleases(prisma),
    );

    // VACUUM cannot run inside a transaction, and it is what actually returns
    // the freed pages to the file. SQLite and Postgres understand it; on
    // another engine the prune still holds, only the file stays as large as it
    // was. So a failure here is reported, not thrown.
    let compacted = false;
    try {
      await engine.$executeRawUnsafe("VACUUM");
      compacted = true;
    } catch {
      compacted = false;
    }

    console.log(`Pruned ${deleted} template release(s) across ${templates} template(s).`);
    console.log(
      compacted
        ? "Database compacted (VACUUM)."
        : "Database left uncompacted (VACUUM not available on this engine).",
    );
    return { deleted, templates, compacted };
  }
}
