The bags and recipes model is a reference architecture for how tiddlers can be shared between multiple wikis. It was first introduced by TiddlyWeb in 2008.

The principles of bags and recipes can be simply stated:

1. Tiddlers are stored in named "bags"
2. Bags have access controls that determines which users can read or write to them
3. Recipes are named lists of bags, ordered from lowest priority to highest
4. The tiddlers within a recipe are accumulated in turn from each bag in the recipe in order of increasing priority. Thus, if there are multiple tiddlers with the same title in different bags then the one from the highest priority bag will be used as the recipe tiddler
5. Wikis are composed by splicing the tiddlers from the corresponding recipe into the standard TW5 HTML template

[[Bags and Recipes Simple Example]]

[[Bags and Recipes Complex Example]]

