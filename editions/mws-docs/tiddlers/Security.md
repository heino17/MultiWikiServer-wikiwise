## Use Cases

The primary use cases for MWS are 

- Internal corporate information tools
- Public TiddlyWiki hosting
- Classroom scenarios
- Unrestricted trusted collaboration

## Still in Development

While these are the goals of MWS, it is still in early development, so none of these security restraints have actually been put in place yet. This is a work in progress, and the direction we're headed. 

## Don't add untrusted bags to your recipe. 

Generally speaking, wiki text is quite powerful, almost as powerful as JavaScript. Button clicks can run widget actions, which can read and change any tiddler in the current recipe. Any user could easily cause TiddlyWiki to write tiddlers to other bags via actions. 

A user can also modify a bag they have write access to so that when a different user loads that bag in their own recipe it gives the first user access to tiddlers that the second user would consider private. This flaw is almost inherent to the idea of bags and recipes and cannot be avoided. 

## Potential weaknesses

- **Not using HTTPS** is always the number one weakness. If you're on an open WIFI network, your session info can be read by anyone within 100 meters.
- **Oracles** that leak information through observable side-effects, such as network traffic, without directly revealing the contents. 
- **Multi-user**: Users with write access can modify bags to gain access to other tiddlers in a different recipe that are supposed to be private. 

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

- Secure, HttpOnly, SameSite=strict, attributes
- Setting separate session cookies for the admin and wiki paths doesn't work because it's based on the request path, not the page path.
- Having a separate login subdomain and using oauth is a more complicated option.

### `no-cors`

- JavaScript `no-cors` mode allows `GET`, `HEAD`, and `POST` and sends relevant cookies. 
- **`no-cors` prevents most headers, including custom headers, from being set.**
- Our standard `x-requested-with` header cannot be set.

### CORS headers

- Set CORS header to only allow expected origins. This doesn't prevent external CLI tools from accessing the site, only browser-based tools. This could also be set for certain endpoints or recipes to only allow specific bags to receive external requests. 

### `Referer` header

- Only allow a wiki to access its own recipe endpoints for extra tight security. It is difficult to predict when a specific request might be malicious if tools are allowed to make requests from one recipe to another on a user's behalf. Specific referer headers could be white-listed as approved tool wikis. 
- Don't allow wiki pages to access admin APIs.

### `Content-Security-Policy` header

- Able to block the page from making network requests, putting it in mostly read-only mode. This doesn't stop JavaScript from setting `location.href` nor prevent the user from clicking on `a href` links. This is more of a quick and dirty read-only, since it prevents ALL requests, including requests that might not actually change anything on the server. 

### Other site configuration

- Don't allow admins to edit a wiki unless they are added to the ACL. The CSP header could be used to disable all network requests if the admin role does not have read permission, thus giving them true read-only access to the wiki. 
- If compression is used, do not compress two bags in the same compression stream. This is a fairly extreme precaution with a limited likelihood. 

## Other ideas

When you visit a page, you visit with page permissions only, and the page has to ask permission to use your full account permissions. The request could also be granular, where the page has to request the specific bag or wiki it wants access to. 


