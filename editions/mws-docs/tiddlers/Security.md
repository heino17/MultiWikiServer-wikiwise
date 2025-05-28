## Use Cases

The primary use cases for MWS are 

- Internal corporate information tools
- Public TiddlyWiki hosting
- Classroom scenarios
- Unrestricted trusted collaboration

## Potential weaknesses

- **Not using HTTPS**
- **Oracles** that leak information through observable side-effects, such as network traffic, without directly revealing the contents. 
- **Multi-user**: Users with write access can modify bags to gain access to tiddlers other tiddlers in a recipe that are supposed to be private. 

## Don't add untrusted bags to your recipe. 

Generally speaking, wiki text is quite powerful, almost as powerful as JavaScript. Button clicks can run widget actions, which can read and change any tiddler in the current recipe. Any user could easily cause TiddlyWiki to write tiddlers to other bags via actions. 

A possible protection from this is using the referrer header to restrict edits to from a wiki to only follow the rules for the recipe that is open. In other words, if you have a recipe open, code in that page cannot use your credentials to somehow write to unrelated bags. 

## Protection strategies

Some of these would be optional depending on the level of mitigation required. 

### `Referer` header

- Only allow a wiki to access its own recipe endpoints. 
- Don't allow wiki pages to access admin APIs. 
- 

### `Content-Security-Policy` header

- Able to block the page from making network requests, putting it in mostly read-only mode. This doesn't stop JavaScript from setting `location.href` nor prevent the user from clicking on `a href` links. This is more of a quick and dirty read-only, since it prevents ALL requests, including requests that might not actually change anything on the server. 




