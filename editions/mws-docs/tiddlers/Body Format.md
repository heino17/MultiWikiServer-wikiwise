
`ignore`
: `state.data` will be undefined. `state.reader` will be draining or already closed. 

`stream`
: `state.data` will be undefined. You must call `state.reader` to get the request. 

`buffer`
: `state.data` will be a Buffer. 

`string` 
: `state.data` will be a string.

`json`
: `state.data` will be read as a string, same as `string` and then parsed as JSON, with some sanity checks. If the string is zero-length, undefined will be returned without attempting to parse. This is the only case where undefined can be returned. If the JSON fails to parse, a `400 INVALID` response will be sent. `__proto__` and `constructor.prototype` are also checked. 

`www-form-urlencoded` and `www-form-urlencoded-urlsearchparams`
: Parse the body using `URLSearchParams` optionally calling `Object.entries` on it.
: <div style="color: rgb(212, 212, 212); background-color: rgb(30, 30, 30); font-family: &quot;Fira Code&quot;, &quot;Cascadia Code&quot;, Consolas, &quot;Courier New&quot;, monospace, Consolas, &quot;Courier New&quot;, monospace; font-size: 15px; line-height: 20px; white-space: pre;"><div><span style="color: #569cd6;">const</span> <span style="color: #4fc1ff;">data</span> = <span style="color: #4fc1ff;">state</span>.<span style="color: #9cdcfe;">data</span> = <span style="color: #569cd6;">new</span> <span style="color: #4ec9b0;">URLSearchParams</span>((<span style="color: #c586c0;">await</span> <span style="color: #4fc1ff;">state</span>.<span style="color: #dcdcaa;">readBody</span>()).<span style="color: #dcdcaa;">toString</span>(<span style="color: #ce9178;">"utf8"</span>));</div><div><span style="color: #c586c0;">if</span> (<span style="color: #4fc1ff;">state</span>.<span style="color: #9cdcfe;">bodyFormat</span> === <span style="color: #ce9178;">"www-form-urlencoded"</span>) <span style="color: #4fc1ff;">state</span>.<span style="color: #9cdcfe;">data</span> = <span style="color: #4ec9b0;">Object</span>.<span style="color: #dcdcaa;">fromEntries</span>(<span style="color: #4fc1ff;">data</span>);</div></div>