

## Basic Route Definer

The original route definer which I used to type TiddlyWiki server routes, but the types ended up being extremely complicated for what I actually ended up needing.  It is still used internally to actually define the routes, but the JavaScript side of it is very simple. 


`method`
: A subset of the [[Allowed Methods]]. 

`path`
: A regex starting with `^/` which matches the request. The first route handler which matches is used. Routes may be nested, and the full match is removed from the URL before matching children. If a parent route matches, it will be called, even if it has no child matches. 

`denyFinal`
: If this route matches, but none of its children do, the server will return `404 NOT FOUND`. Otherwise, its state handler will be called and expected to handle the request, even if none of its children match. 

`pathParams`
: An array of key names for regex match groups for the pathParams object.

`bodyFormat`
: The [[Body Format]] which the request wishes to receive. If the method is only GET and HEAD, this is ignored, as no request body is expected. Internally, the request is probably drained early, just in case a body was sent. 

`handler` - a separate callback argument
: If the route matches, the handler is called. The handler is called at each level in order, so parents may add additional (out of type) properties to the state object or handle some requests and allow others to go through to the matched child.

### Match result

The StateObject has a routePath parameter containing the "path" through the "tree" of route definitions. In other words, it has the first matched route, and then the first matched child of that route, and then the first matched child of that route, and so on. 

It is an array of objects with the following properties. 

`route`
: an object containing the options for the route listed above

`params`
: an array of the match groups (`match.slice(1)`)

`remainingPath`
: The remaining URL to match (if this is zero-length, it will be a `/`)

## Zod Route Definers

The rest of the route definers are used by creating a class with the route definitions as properties, and then calling that class on server startup to register the routes. 

<div style="color: rgb(212, 212, 212); background-color: rgb(30, 30, 30); font-family: &quot;Fira Code&quot;, &quot;Cascadia Code&quot;, Consolas, &quot;Courier New&quot;, monospace, Consolas, &quot;Courier New&quot;, monospace; font-size: 15px; line-height: 20px; white-space: pre;"><div><span style="color: #569cd6;">class</span> <span style="color: #4ec9b0;">RoutesClass</span> { <span style="color: #9cdcfe;">test</span> = <span style="color: #dcdcaa;">zodManage</span>(<span style="color: #9cdcfe;">z</span> <span style="color: #569cd6;">=&gt;</span> <span style="color: #9cdcfe;">z</span>.<span style="color: #dcdcaa;">any</span>(), <span style="color: #569cd6;">async</span> <span style="color: #9cdcfe;">e</span> <span style="color: #569cd6;">=&gt;</span> <span style="color: #569cd6;">null</span>) }</div><div><span style="color: #569cd6;">const</span> <span style="color: #4fc1ff;">RoutesKeyMap</span>: <span style="color: #4ec9b0;">RouterKeyMap</span>&lt;<span style="color: #4ec9b0;">RoutesClass</span>, <span style="color: #4ec9b0;">true</span>&gt; = { <span style="color: #9cdcfe;">test</span><span style="color: #9cdcfe;">:</span> <span style="color: #569cd6;">true</span> }</div><div><span style="color: #dcdcaa;">registerZodRoutes</span>(<span style="color: #4fc1ff;">root</span>, <span style="color: #569cd6;">new</span> <span style="color: #4ec9b0;">RoutesClass</span>(), <span style="color: #4ec9b0;">Object</span>.<span style="color: #dcdcaa;">keys</span>(<span style="color: #4fc1ff;">RoutesKeyMap</span>));</div></div>

`RoutesKeyMap` would have the keys of all the routes in the class, and the type makes sure no routes have been missed, while also allowing the class to have extra properties that are not routes. 


## `zodRoute`

`method`
: A subset of the [[Allowed Methods]]. 

`path`
: A slash-separated string of folders including variables prefixed with a `:`
: `"path/to/route/:var/route/:var2"`

`zodPathParams` - zod check on `state.pathParams`
: A [[Zod Callback]] which returns an object with keys the same as the `path` variables, and values being the zod check for that specific variable. If this fails, the server will return a `404 NOT FOUND` response. 

`bodyFormat`
: The body format which the request wishes to receive. If the method is only GET and HEAD, this is ignored, as no request body is expected. 

`zodRequest` - zod check on `state.data`
: A [[Zod Callback]] which returns the expected shape of the request body after it is done being parsed. If this fails, the server will return a `400 INVALID` response. 

`inner`
: The handler, which receives a [[StateObject]] instance with the generics set according to the above parameters. See also [[ZodAssert]]



## `zodManage`

`zodManage` is a shortcut for a specific use case of `zodRoute` which is used for the admin UI. 

<div style="color: rgb(212, 212, 212); background-color: rgb(30, 30, 30); font-family: &quot;Fira Code&quot;, &quot;Cascadia Code&quot;, Consolas, &quot;Courier New&quot;, monospace, Consolas, &quot;Courier New&quot;, monospace; font-size: 15px; line-height: 20px; white-space: pre;"><div>&nbsp; <span style="color: #dcdcaa;">zodRoute</span>(</div><div>&nbsp; &nbsp; [<span style="color: #ce9178;">"POST"</span>],</div><div>&nbsp; &nbsp; <span style="color: #ce9178;">"/manager/$key"</span>,</div><div>&nbsp; &nbsp; <span style="color: #9cdcfe;">z</span> <span style="color: #569cd6;">=&gt;</span> ({}),</div><div>&nbsp; &nbsp; <span style="color: #ce9178;">"json"</span>,</div><div>&nbsp; &nbsp; <span style="color: #dcdcaa;">zodRequest</span>,</div><div>&nbsp; &nbsp; <span style="color: #569cd6;">async</span> <span style="color: #9cdcfe;">state</span> <span style="color: #569cd6;">=&gt;</span> {</div><div>&nbsp; &nbsp; &nbsp; <span style="color: #c586c0;">return</span> <span style="color: #9cdcfe;">state</span>.<span style="color: #dcdcaa;">$transaction</span>(<span style="color: #569cd6;">async</span> (<span style="color: #9cdcfe;">prisma</span>) <span style="color: #569cd6;">=&gt;</span> <span style="color: #c586c0;">await</span> <span style="color: #dcdcaa;">inner</span>(<span style="color: #9cdcfe;">state</span>, <span style="color: #9cdcfe;">prisma</span>));</div><div>&nbsp; &nbsp; }</div><div>&nbsp; );</div></div>

`$key` is a shortcut that refers to the key of the class the route is registered on. It is not a path param, so `zodPathParams` is empty. 

