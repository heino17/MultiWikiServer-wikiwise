A tiddler fields object is the serializable tiddler exchange format. If in doubt, stringify. Tiddler field values are supposed to be strings but they aren't always. Tiddler field keys could contain the colon, which would break `.tid` files. 

The definitive serializable form of a tiddler in TW5 is obtained by retrieving the tiddler from the wiki, and then calling `tiddler.getFieldString` on each field value. This is the form in which TiddlyWiki saves and loads single file wikis.

`.tid` files are not equivalent because they do not escape the colon character in field names. The official "workaround" is simply to save the tiddler as a JSON file. 