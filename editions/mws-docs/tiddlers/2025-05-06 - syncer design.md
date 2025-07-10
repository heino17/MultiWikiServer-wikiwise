There have been several different posts complaining about the long wait times when importing huge volumes of tiddlers. I took a look at the syncer and syncadaptor this evening, and realized that most of this is caused by the designed of the syncer itself, not the syncadaptor. The syncer only saves tiddlers one at a time. There's no batching. I'm not even sure if there is an option for batching. 

It's probably going to be a good idea to redesign the syncer from the ground up. The syncer hooks directly into the change events on the wiki. From there it calculates which tiddlers need to be synced. I think it would be good to get as close to the wiki as possible, so hooking directly into the change events is probably a good idea. 

For the purposes of MWS, the syncer is actually pretty basic, and most of the features are probably not used, however, the syncer presents a standard API surface between the UI internals and the sync adapter. If I can modify it to handle more bulk updates, that would help.

I think the syncer also needs to be updated to be more aware of the recipe. Being able to understand the recipe is kind of important in understanding how to deal with deletions efficiently. It needs to be aware of read-only tiddlers. 

Speaking of recipes, I keep bouncing this idea around in my mind of recipes which are multi-layered. Each level of the recipe could be opened by admins in order to easily make changes to the bag without creating a separate recipe. You can't just edit an individual bag because you need the bags below it in order to make sense out of it. 

There also isn't a good way to move tiddlers between levels. Admins will need to be given some extra tools to do this with. 

I'm not good at wikitext, but I can provide the endpoints for all of these operations as well as the client-side adapters and actions to use them. 

-- Arlen22

## Update 2025-07-09

I've come up with a solution for this and opened a PR on GitHub [#9117](https://github.com/TiddlyWiki/TiddlyWiki5/pull/9117). I've also included the changes in the client plugin so MWS wikis can make use of them already. This is temporary and only allowed because the current version of MWS is still considered experimental. 