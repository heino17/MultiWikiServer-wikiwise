
# MultiWikiServer


[<img src="https://github.com/user-attachments/assets/6467378f-26fd-40ff-b60e-b8d62555c08a" style="width:1em;"/> Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=BVDDREGEU2ZEA)



In its early stages, MWS is largely being developed by me, [Arlen22](https://github.com/Arlen22), based on input from the TiddlyWiki community at large, as well as my own experience with TiddlyWiki. I am a freelance software developer, so I can allocate time as needed, but that cuts into other work I could be doing. If you'd like to support my work on MWS, feel free to donate. It very directly allows me to put more time into this project. I've worked on several similar projects in the past, so this project is one I am quite passionate about, and I consider it a privelage to be able to do this. 



## Warning
<div style="width:48px"></div>
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 48 48"><g clip-path="url(#a)"><path fill="#002991" d="M38.914 13.35c0 5.574-5.144 12.15-12.927 12.15H18.49l-.368 2.322L16.373 39H7.056l5.605-36h15.095c5.083 0 9.082 2.833 10.555 6.77a9.687 9.687 0 0 1 .603 3.58z"/><path fill="#60CDFF" d="M44.284 23.7A12.894 12.894 0 0 1 31.53 34.5h-5.206L24.157 48H14.89l1.483-9 1.75-11.178.367-2.322h7.497c7.773 0 12.927-6.576 12.927-12.15 3.825 1.974 6.055 5.963 5.37 10.35z"/><path fill="#008CFF" d="M38.914 13.35C37.31 12.511 35.365 12 33.248 12h-12.64L18.49 25.5h7.497c7.773 0 12.927-6.576 12.927-12.15z"/></g><defs><clipPath id="a"><path fill="#fff" d="M7.056 3h37.35v45H7.056z"/></clipPath></defs></svg>


**This is not ready for primetime. Do not use it to protect feelings or intellectual property. Seriously. The security mechanisms required are not built yet.**

*So please try it out, kick the tires, import your multi-gigabyte wikis and play around with it, but don't actually store anything you want to keep. We'll hopefully get there soon, but even the database schema itself is still in flux as we figure out what the best layout is for all the stuff we have planned.*

## Security is still a dumpster fire. 

![image](https://github.com/user-attachments/assets/49505d25-7a48-42f1-b4f7-73e8630c1ba1)

## Upgrades can break your wiki, always make backups

Storing data is safe enough, sort of, but upgrading to new versions is where the problem comes in. That's why your package.json file has the exact version number saved. You can upgrade your TiddlyWiki version separate from the MWS version. Once you upgrade to a new MWS version, you might not be able to revert to the previous version. **Always make backups.** Also, you should not give untrusted users write access on any bags or recipes because they can write code that can run as any user.

## Also, this is a database, please make backups

Seriously, you never know. Databases try very hard to be perfect, and a small number of database engines run the entire internet, so there are a lot of eyes on them, and data bugs are rare. But that doesn't mean things can't go wrong. Backups are critical. 

-----

Multiple users, multiple wikis for TiddlyWiki.

- Bag & Recipe system for storing tiddlers.
- User and Role management with ACL.
- Multiple database engines supported, using Prisma.
- Third-party OAuth and password-based login.

## Flexible and Extendible 

- Plugins can add routes and hooks.
- Abstractions everywhere, allowing flexibility.
- The source code is fully typed and easy to navigate.
- Admin endpoints can also be called from the CLI.

Most of these features are still in development. 

**Do not use it to protect feelings or intellectual property.**

## How to run

The init command creates a new folder and installs what you need to get started. 

- `npm init @tiddlywiki/mws@latest mws`
- `cd mws`
- `npm start`

You can customize the defaults by modifying `mws.run.mjs`.

- the server runs on port `8080`. It does not use HTTPS by default, but you can enable it by specifying a key and cert. 
- A `localpass.key` file is created to hold the password keyfile. If this file changes, all passwords will need to be reset. 
- The data folder (`wikiPath`) is `wiki` by default.

The initial user created on first run has the username `admin` and password `1234`.

If you run into trouble, or need help figuring something out, feel free to [start a discussion](https://github.com/TiddlyWiki/MultiWikiServer/discussions). If you know what's wrong, you can also open an issue.

### Updates

If upgrading from 0.0, the best way to save your information is to open each wiki and click the cloud status icon, then click "save snapshot for offline use". You can then create a new instance and import your wikis via the browser. 

If updating within 0.1,

- Copy or zip your `store` folder to **a safe backup folder**.
- `npm install @tiddlywiki/mws@latest`
- Run `npm start`. This will update the database schema automatically if there are new changes.

If there are any database changes, MWS should pick them up and apply them. The changes are generated by prisma's builtin migration and are supposed to preserve data, but backups are still highly recommended.

The 0.1 database is incompatible with the 0.0 database. Version 0.1 will detect this and exit immediately to prevent data loss.

### Development

In 0.1, the data folder is `/dev/wiki`. 

If you want to work on the project, 

- `git clone https://github.com/TiddlyWiki/MultiWikiServer`
- `cd MultiWikiServer`
- `npm install` or `npm run install-android`
- `npm run certs` - if you want https (unix only)
- `npm start init-store` - Create the `admin` user and import default wikis.
- `npm start` - this will run the build every time, but it's very fast. 

The development wiki will be active at http://localhost:8080/dev

You can change the listeners as explained in the mws.dev.mjs file.


