The startup cache records all the information about the TiddlyWiki plugin cache. 

`pluginFiles`
: list of **key:** plugin title, **value:** cache-relative path to the plugin folder

`pluginHashes`
: list of **key:** plugin title, **value:** sha384 hash (prefixed with `sha384-`)

`filePlugins`
: `pluginFiles` with the key and value reversed. It should only be used for importing existing data folders which have path references to TiddlyWiki plugins (such as found in `tiddlywiki.info` files).

`requiredPlugins`
: the list of plugins that the site considers essential. Every wiki is always loaded with these plugins. Server Plugins can add or remove plugins from this list. It does not include the TiddlyWiki core, as that one is even more essential and can only be disabled with a setting on the recipe.

`cachePath`
: absolute path to the cache directory

## SHA-384 Hash options

`prefix`
: a Buffer to add to the hash before the plugin itself

`suffix`
: a Buffer to add to the hash after the plugin itself.

The hash is used for the integrity attribute when serving plugins externally. The exact file byte contents, along with `prefix` and `suffix`,  must be hashed in the correct encoding. Presumably this is always UTF-8. When a plugin is served as an external JS file, it is wrapped with `prefix` and `suffix`.

The plugin itself is a [[tiddler fields object|TiddlerFields]] encoded with `JSON.stringify(tiddler.getFieldStrings())`.