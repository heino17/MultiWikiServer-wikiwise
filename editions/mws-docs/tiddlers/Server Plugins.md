Server Plugins are a concept which has yet to be built but essentially involves subscribing to events and then taking (or not taking) a series of defined actions in response to the event. 

For instance, on server startup, all plugins are asked to register any client plugins they may have. They would probably do this by adding that data to the tiddler cache, or returning the corresponding key-value pairs.

Server plugins should not expect the TiddlyWiki node instance to be available or pluggable. The TiddlyWiki instance is used to render plugins which are the equivalent of those available for single-file wikis. It is also used by the `load-wiki-folder` command, which uses the equivalent of `boot.js` code only. 

The [[MWS routing system|Routing]] is directly borrowed from TiddlyWiki. Plugins may declare arbitrary routes (preferably namespaced) and the definitions try to be reasonably typed and have helpful utilities for handling incoming data. 