The .tid file format does not support field names with colons.  Rather than trying to catch all the unsupported variations that may appear, we'll just use JSON to send it across the wire, since that is the official fallback format in TW5. However, parsing a huge string value inside a JSON object is very slow, so we split off the text field and just send it after the other fields. 

```json
{ "title": "New Tiddler" }

test
```

Note that because the text field is optional, if the entire string is a single line, the text field will not be set, but if it ends with two line breaks, the text field will be set to an empty string. 

Putting a tiddler into this format:

```
const fields = tiddler.getFieldStrings();
const text = fields.text;
delete fields.text;
const data = JSON.stringify(fields) 
  + (typeof text === "string" ? ("\n\n" + text) : "");
```

And parsing it out again:

```
const splitter = body.indexOf("\n\n");
if(splitter === -1) {
  return JSON.parse(body);
} else { 
  return {
    ...JSON.parse(body.slice(0, splitter)),
    text: body.slice(splitter + 2)
  }
}
```

There may be edge cases I'm not aware of, but since it's literally just sending strings to NodeJS, there shouldn't be any problems. Text fields are expected to be strings and binary types are base64-encoded. 