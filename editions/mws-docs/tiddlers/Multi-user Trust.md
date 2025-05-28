
If a user can write to a bag in a recipe, they can insert wiki-text which exports all the tiddlers in all recipes which contain that bag. 

There are no real mitigations to this which can mitigate this completely, but there are some partial solutions which may help. 

- Only allow loading modules from some bags.
- Partitioned bags which only allow each user to write tiddlers prefixed with their username.
- Use Content-Security-Policy headers to make the webpage read-only and block network requests. 

I think what it really comes down to is that if you can't trust your users, don't give them write access. 

Don't add untrusted bags to your recipes. 
