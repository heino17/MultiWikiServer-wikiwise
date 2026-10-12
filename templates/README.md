# templates/

Build artifacts of the **SimpleWiki** project, shipped so `init-store` can
create the `SimpleWiki` template on a fresh data folder (§132 of the CHANGELOG).

- `simplewiki.html` — the built SimpleWiki shell. `init-store` embeds it as the
  `SimpleWiki` template; `provision-simplewiki` updates an existing one.
- **Not a source file.** Do not edit it here. Build SimpleWiki in its own
  project and copy the resulting `simplewiki.html` into this folder before a
  release. See `AGENTS.md`.

SimpleWiki is its own project — <https://github.com/heino17/heino17s_SimpleWiki>
— and carries its license there.
