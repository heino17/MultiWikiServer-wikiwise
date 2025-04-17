#!/usr/bin/env node
//@ts-check
const fs = require("fs");
const { execSync } = require("child_process");
const path = require("path");
if(!process.argv[2]) {
  console.error("Please provide a folder name.");
  console.error("Usage: npm init @tiddlywiki/mws[@latest] <folder-name>");
  process.exit(1);
}
const folder = path.resolve(process.cwd(), process.argv[2]);

if(fs.existsSync(folder)) {
  console.error(`Folder ${folder} already exists. Please choose a different name.`);
  process.exit(1);
}

console.log(`${folder}`);
fs.mkdirSync(folder, { recursive: true });



printFile("package.json", `
{
  "name": "mws-wiki-instance",
  "version": "1.0.0",
  "private": true,
  "bin": {
    "mws": "./mws.run.mjs"
  },
  "scripts": {
    "start": "node --enable-source-maps mws.run.mjs"
  }
}
`.trimStart());
printFile("mws.run.mjs", `
#!/usr/bin/env node
//@ts-check
import startServer from "@tiddlywiki/mws";
startServer({
  passwordMasterKeyFile: "./localpass.key",
  wikiPath: "./wiki",
  listeners: [{
    // key: "./localhost.key",
    // cert: "./localhost.crt",
    // host: "::",
    port: 8080,
  }],
}).catch(console.log);
`.trimStart());

printFile("localhost_certs.sh", `

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
console.log("└─ Running npm install...")
execSync("npm install --save-exact tiddlywiki@latest @tiddlywiki/mws@latest", { cwd: folder, stdio: "inherit" });

function printFile(file, text) {
  const abspath = path.resolve(folder, file);
  if(fs.existsSync(abspath)) {
    console.log(`File ${file} already exists. Skipping...`);
    return;
  }

  console.log(`├─ ${file}`);
  fs.writeFileSync(abspath, text);
}
