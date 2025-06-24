Currently we're adding recipe tiddlers into the wiki page dynamically, which is expected, but there are like six tiddlers that are being rendered statically, which doesn't really make sense. It also doesn't make sense that we're dumping some plugins into the database but rendering core from tiddlywiki, since this results in a version mismatch. 

At the same time, we really don't want to be rendering plugins every time. They do need to be cached somewhere so they can be loaded quickly. I wonder if it would work to cache them in the wiki folder, per tiddlywiki version, so if you upgrade it would just create a new folder. The boot tiddlers would be cached in the folder as well. If we do it right, we wouldn't even have to parse the file, just read it onto the wire. We'd probably need an index file to keep everything straight. We could add plugins/themes/languages support to the wiki folder as well, which would also get cached in the same way. We could make a way for caching to be disabled, perhaps by adding a field to `plugin.info`. 

It would be useful if the plugin syntax could specify NPM modules. We already have the `+` and `++` syntax. I'm not sure exactly how it'd work, but the NPM package would need to determine it's own path, which is fairly simple, and then export that so it can be imported via the standard import mechanism. Obviously the package would need to be installed, and it should probably be imported into the run file and then added as an absolute path to the list of imports. Actually, I guess that's already possible, so I just need to add the list of imports part of it. 

----

### Add a tiddler cache folder and render the tiddlers on startup

- Store them either in-memory or in the file-system, depending on user preference.
- The core tiddler and boot tiddlers could be stored in memory regardless because they are always served. 
- Would it save some memory to store them as a buffer?
- The stored content would be read directly onto the wire, optionally checking the hash. 

### Add a plugin selector to the recipes form

- The loading order needs to be changeable. 
- It would just be an array of titles, and possibly other describing fields. 

### Add a plugin field to the recipes table

- Not sure if I need to create a plugins table but I probably just need a string array of plugin names. Titles tend to be authoritative in TiddlyWiki so the plugin title should be enough. Plugin titles which cannot be found would be somehow marked as not found, probably with a custom disabled plugin tiddler in the client and logging a warning in the server. 

### What about SQL Filters?

- I don't know, but we would be caching plugins either way. Everything about it is handled differently, so no matter what, there is almost guaranteed to be a clear separation between the two kinds of bags anyway. We'll worry about that when we get there.

## Retrospective - 2025-06-24

I ended up caching it according to the file path. The tiddlywiki file path works fine for those plugins. Third-party plugins will need to declare their own folder name somehow. The files are compressed and stored on disk. The cache is built on startup. The cache stores a `json`, `js`, and `js.gz` version of each plugin. 