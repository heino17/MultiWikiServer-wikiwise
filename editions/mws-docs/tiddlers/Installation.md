These instructions require minimal knowledge of the terminal and require NodeJS to be installed.

> **Note for the wikiwise fork:** the package `@tiddlywiki/mws` on npm is the *upstream* project. `npm init @tiddlywiki/mws@latest` therefore installs upstream MultiWikiServer without any fork feature. This fork is distributed as a GitHub release, not on npm.

- Recommended: install the finished package from a release. Download the `.tgz` from the [[releases page|https://github.com/heino17/MultiWikiServer-wikiwise/releases]], then:
<<.copy-code-to-clipboard """mkdir "new_folder_name" && cd "new_folder_name" """>>
<<.copy-code-to-clipboard """npm install https://github.com/heino17/MultiWikiServer-wikiwise/releases/download/v0.5.0/mws-wikiwise-0.5.0.tgz """>>
<<.copy-code-to-clipboard """npx mws init-data-folder """>>
<<.copy-code-to-clipboard """npx mws update-tiddlywiki """>>
<<.copy-code-to-clipboard """npx mws init-store """>>
<<.copy-code-to-clipboard """npx mws listen --listener """>>
- Visit [[http://localhost:8080/]] in a browser on the same computer. When you have finished using MWS, stop the server with <kbd>ctrl-C</kbd>. The download is an ordinary npm package, so `npm` installs all dependencies. Compare its `sha256sum` with the checksum in the release notes before you use it. `npx mws init-data-folder` is mandatory: MWS refuses to start unless the `package.json` in the data folder is named `@tiddlywiki/mws-instance`, is marked `private` and carries a `0.2.x` version – that file is what keeps your tiddlers out of a public registry. The command writes exactly those three fields, keeps the dependencies npm created, and refuses to overwrite a name that somebody chose on purpose.

- Alternative: get the fork and install it. The install also builds the server bundle, so there is no separate build step. 
<<.copy-code-to-clipboard """git clone https://github.com/heino17/MultiWikiServer-wikiwise.git """>>
<<.copy-code-to-clipboard """cd MultiWikiServer-wikiwise """>>
<<.copy-code-to-clipboard """npm install """>>
<<.copy-code-to-clipboard """npm start """>>
- Start the development wiki and visit [[http://localhost:5000/dev/]] in a browser on the same computer. When you have finished using MWS, stop the server with <kbd>ctrl-C</kbd>. 
- For your own data folder, independent of the development wiki, build a package once and install it into a new folder. Notice that the second word is `pack` instead of `install`. 
<<.copy-code-to-clipboard """npm pack """>>
<<.copy-code-to-clipboard """mkdir "new_folder_name" && cp create-package/files/* "new_folder_name"/ """>>
<<.copy-code-to-clipboard """cd "new_folder_name" """>>
<<.copy-code-to-clipboard """npm install ../mws-wikiwise-0.5.0.tgz """>>
- Initialize the TiddlyWiki files and the database 
<<.copy-code-to-clipboard """npx mws update-tiddlywiki """>>
<<.copy-code-to-clipboard """npx mws init-store """>>
- Start MWS: 
<<.copy-code-to-clipboard """npx mws listen --listener """>>
- Visit [[http://localhost:8080/]] in a browser on the same computer. 
- When you have finished using MWS, stop the server with <kbd>ctrl-C</kbd>

See [[Troubleshooting]] if you encounter any errors.

### Updating MWS

To update your copy of MWS in the future with newer changes will require re-downloading the code, taking care not to lose any changes you might have made.

- Make a backup: Copy or zip your project folder to a safe backup folder.  <<.copy-code-to-clipboard """tar -cf archive.tar "new_folder_name" """>>
- Get the latest version. In the clone, `git pull` and `npm install` rebuild the server bundle; afterwards install the new package into your data folder as described above. <<.copy-code-to-clipboard """git pull && npm install && npm pack """>>
- Run MWS. On startup, MWS checks the database schema and updates it automatically if there are changes. Normally this works just fine, but it can fail, which is why it's important to save a backup first. 

### Git repo

It is recommended to save a history of your project configuration using git, 

- On Windows you can use [[GitHub Desktop|https://github.com/apps/desktop]]. 
- On Linux, git is usually preinstalled or available via the default package manager for your distro. 

