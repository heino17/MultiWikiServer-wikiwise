[[Client Plugins]] are normal [[TiddlyWiki]] plugins. They are cached on the server and served directly to the client as needed. [[Server Plugins]], perhaps acting as third-party plugin libraries, may register additional [[Client Plugins]] and either add them to the cache immediately (if it's some small built-in plugin) or only when a recipe requires them (like a plugin library would). 

On startup, all server plugins are called to generate their client plugins. The client plugins are saved in `cache/${path}/plugin.json`, using a relative path of the plugin's choosing. The same thing happens when a recipe's list of plugins changes. Plugins do not have to be generated fresh each time if the server plugin has a way of verifying that all of its client plugins are up to date on the file system, perhaps by reading and hashing them. 

The wiki index file itself is also rendered with an empty store and saved at `cache/tiddlywiki5.html`.

When a wiki page is opened, the index file is loaded and parsed. Plugins are either read directly into the store area, or script tags are inserted which point to the location of the cache folder. 

MWS saves a hash of the plugin in memory so it can be served as an external JavaScript file with the script integrity attribute. The advantage of external JavaScript files is that the browser can cache them on subsequent page loads, reducing bytes transferred. Plugins can also be served directly in the index file, just like a normal single-file TiddlyWiki would. Regardless of which option is used, MWS optimizes memory usage by piping the file directly into the response (and onto the network) rather than reading everything into memory first. 








