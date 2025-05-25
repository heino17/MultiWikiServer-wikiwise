
Consider the scenario where a teacher has a bag for each of his students which they can write to (whatever the reason is doesn't matter) and he can read all their bags loaded in one recipe (maybe he enforces that they all name their tiddlers with some prefix, somehow, which is fairly easy to do with some minor UI tweaks).

Now each student has write access to one of the bags in the recipe, but cannot read most of them. However, a student may be able to come up with an attack which somehow allows them to modify their own bag in such a way that when the teacher loads his recipe, or clicks a button, or who knows what, it dumps all the tiddlers of all the students into that one student's bag.

It's the same social engineering as getting rick-rolled. Someone sends you a link and says "hey, check out this timelapse of a guy building a wood table" and instead it's video of a guy singing. It's silly, and it's even sillier if they mock you for believing them, because that's just how life works. 

There is no way to fully mitigate this. The available solutions are only partial. 

- Only allow loading modules from some bags.
- Partitioned bags which only allow each user to write tiddlers prefixed with their username
- When viewing all tiddlers in the teacher scenario, make the wiki read-only. 
- Use a sandbox iframe to block network requests and other means of export. 
- Export the wiki as a single file wiki and open in a modern browser to give it an isolated origin. 
- View the student wiki in raw text rather than actually rendering it in the teacher's browser. 

I think what it really comes down to is that if you can't trust your users, don't give them write access. 
