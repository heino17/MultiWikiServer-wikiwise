#!/usr/bin/env node
const fs = require("fs");
const { execSync } = require("child_process");
if(fs.existsSync("package.json")) fs.writeFileSync("package.json", `
{
  "name": "mws-wiki-instance",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node --enable-source-maps mws.run.mjs"
  }
}
`.trimStart());
if(!fs.existsSync("mws.run.mjs")) fs.writeFileSync("mws.run.mjs", `
//@ts-check
import startServer from "@tiddlywiki/mws";
import { resolve } from "node:path";
const cli = process.argv.slice(2);
startServer({
  passwordMasterKeyFile: "./localpass.key",
  listeners: [{
    // key: "./localhost.key",
    // cert: "./localhost.crt",
    // host: "::",
    port: 5000,
  }],
  config: {
    wikiPath: "./wiki",
    allowAnonReads: false,
    allowAnonWrites: false,
    allowUnreadableBags: false,
  },
  args: cli.length ? cli : [
    "--mws-init-store",
    "--mws-listen"
  ],
}).catch(console.log);
`);

if(!fs.existsSync("localhost_certs.sh")) fs.writeFileSync("localhost_certs.sh", `

cat > localhost.cnf <<EOF
[ req ]
default_bits        = 2048
default_keyfile     = localhost.key
distinguished_name  = req_distinguished_name
req_extensions      = req_ext
[ req_distinguished_name ]
commonName          = Common Name (e.g. server FQDN or YOUR name)
commonName_max      = 64
commonName_default  = Localhost Root CA
[ req_ext ]
subjectAltName      = @alt_names
[alt_names]
DNS.1               = desktop
DNS.2               = *.desktop
EOF

openssl req -new -nodes -out localhost.csr -config localhost.cnf
openssl x509 -req -in localhost.csr -days 365 -out localhost.crt -signkey localhost.key -extensions req_ext -extfile localhost.cnf

`);
console.log("Running npm install...")
execSync("npm install tiddlywiki@latest @tiddlywiki/mws@latest");