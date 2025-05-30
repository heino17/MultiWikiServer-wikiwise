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

I just needed some place to list all the different things we could do to secure a site. Some of these would be optional depending on the level of mitigation required. 

1. Obvious, "tie your shoes" security precautions.
2. Reasonable prevention of normal attack vectors.
3. Optional hardening to prevent targeted attacks.
4. Pedantic defenses against advanced attackers with full read-only access to the system or a backup.

### HTTPS

- Enable HTTPS site-wide using let's encrypt or another free certificate service.

### Cookies

[MDN - SetCookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

- Secure and http-only attributes
- Setting separate session cookies for the admin and wiki paths. 
- Setting same-site=strict for the admin UI since the initial page is a static asset. 
- Using separate subdomains for admin and wiki paths is also an option. 
- Having a separate login subdomain and using oauth is a more complicated option.

### CORS headers

- Set CORS header to only allow expected origins. This doesn't prevent external CLI tools from accessing the site, only browser-based tools. This could also be set for certain endpoints or recipes to only allow specific bags to receive external requests. 

### `Referer` header

- Only allow a wiki to access its own recipe endpoints. 
- Don't allow wiki pages to access admin APIs.

### `Content-Security-Policy` header

- Able to block the page from making network requests, putting it in mostly read-only mode. This doesn't stop JavaScript from setting `location.href` nor prevent the user from clicking on `a href` links. This is more of a quick and dirty read-only, since it prevents ALL requests, including requests that might not actually change anything on the server. 

### Other site configuration

- Don't allow admins to edit a wiki unless they are added to the ACL. This prevents JavaScript from taking advantage of a site admin's credentials when randomly browsing, and also prevents the admins themselves from making unintentional changes to a wiki. The CSP header could be used to disable all network requests if the admin role does not have read permission. 
- If compression is used, do not compress two bags in the same compression stream. 
