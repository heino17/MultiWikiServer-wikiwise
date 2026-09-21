/*\
title: $:/plugins/mws/client/language.js
type: application/javascript
module-type: startup

Make the MWS UI strings follow the wiki language.

The English strings ship as shadow tiddlers titled `$:/language/MWS/...`
(see `en-US.multids`). Translations live one file per language in
`tiddlers/i18n/<code>.multids`, producing shadow tiddlers under
`$:/plugins/mws/client/i18n/<code>/`. This module discovers those files, picks
the set matching the wiki's `$:/language` (exact code first, then primary
subtag, e.g. `de-DE` -> `de`, `zh_CN`/`zh-Hans` -> `zh`), and writes real
tiddlers for the `$:/language/MWS/...` titles. Switching back to a language we
do not ship falls back to the English shadow texts (snapshotted at startup).

Strings may contain the placeholder `<<owner>>`, which is replaced with the
wiki owner's name from `$:/config/multiwikiclient/owner` when the real tiddler
is written. Substituting here rather than with a macro is required because the
same strings are used in tooltip/aria attributes, where TiddlyWiki does not
render transclusions as wikitext.

The `$:/language/MWS/` titles are excluded from `$:/config/SyncFilter`, so the
written overrides are never persisted to the server. Real `$:/language/MWS/...`
tiddlers already present at startup are treated as per-wiki overrides and left
untouched.
\*/
"use strict";

exports.name = "mws-language";
exports.after = ["rootwidget"];
exports.platforms = ["browser"];
exports.synchronous = true;

var LANGUAGE_TIDDLER = "$:/language",
	I18N_PREFIX = "$:/plugins/mws/client/i18n/",
	MWS_PREFIX = "$:/language/MWS/",
	OWNER_TIDDLER = "$:/config/multiwikiclient/owner",
	OWNER_PLACEHOLDER = /<<owner>>/g;

var translations = null,
	possibleValues = null,
	englishValues = null,
	userOverridden = null,
	managed = Object.create(null);

/*
Scan the bundled translation tiddlers into { "<code>": { "<key>": "<text>" } },
snapshot the English shadow texts and mark keys with pre-existing real tiddlers
as per-wiki overrides.
*/
function discoverTranslations() {
	if(translations) {
		return;
	}
	translations = {};
	possibleValues = {};
	englishValues = {};
	userOverridden = {};
	$tw.wiki.filterTiddlers("[all[shadows+tiddlers]prefix[" + I18N_PREFIX + "]]").forEach(function(title) {
		var rest = title.slice(I18N_PREFIX.length),
			slash = rest.indexOf("/");
		if(slash < 1) {
			return;
		}
		var code = rest.slice(0,slash).toLowerCase(),
			key = rest.slice(slash + 1),
			value = $tw.wiki.getTiddlerText(title,"");
		if(!key) {
			return;
		}
		(translations[code] = translations[code] || {})[key] = value;
		(possibleValues[key] = possibleValues[key] || []).push(value);
	});
	Object.keys(possibleValues).forEach(function(key) {
		var title = MWS_PREFIX + key;
		if($tw.wiki.tiddlerExists(title)) {
			userOverridden[key] = true;
		} else {
			englishValues[key] = $tw.wiki.getTiddlerText(title,"");
		}
	});
}

/*
The language code from `$:/language`, e.g. `$:/languages/de-DE` -> `de-de`.
*/
function getLanguageCode() {
	var language = $tw.wiki.getTiddlerText(LANGUAGE_TIDDLER,"") || "";
	return language.split("/").pop().toLowerCase().replace(/_/g,"-");
}

/*
The translation set for the current language, or null for English/unknown.
*/
function getTranslation() {
	var code = getLanguageCode();
	return translations[code] || translations[code.split("-")[0]] || null;
}

/*
Replace the `<<owner>>` placeholder with the wiki owner's name. When no owner
is known the placeholder is removed (and doubled spaces collapsed).
*/
function renderText(value,owner) {
	if(value.indexOf("<<owner>>") === -1) {
		return value;
	}
	return owner
		? value.replace(OWNER_PLACEHOLDER,function() { return owner; })
		: value.replace(OWNER_PLACEHOLDER,"").replace(/[ \t]{2,}/g," ");
}

function applyLanguage() {
	discoverTranslations();
	var active = getTranslation(),
		owner = $tw.wiki.getTiddlerText(OWNER_TIDDLER,"") || "";
	Object.keys(possibleValues).forEach(function(key) {
		if(userOverridden[key]) {
			return;
		}
		var title = MWS_PREFIX + key,
			raw = active && active[key] !== undefined ? active[key] : englishValues[key],
			value = renderText(raw,owner),
			hasPlaceholder = raw.indexOf("<<owner>>") !== -1;
		if(managed[title]) {
			if($tw.wiki.getTiddlerText(title) !== value) {
				$tw.wiki.addTiddler({ title: title, text: value, type: "text/vnd.tiddlywiki" });
			}
		} else if(active || hasPlaceholder) {
			$tw.wiki.addTiddler({ title: title, text: value, type: "text/vnd.tiddlywiki" });
			managed[title] = true;
		}
	});
}

exports.startup = function() {
	if(!$tw.wiki) {
		return;
	}
	applyLanguage();
	$tw.wiki.addEventListener("change",function(changes) {
		if($tw.utils.hop(changes,LANGUAGE_TIDDLER) || $tw.utils.hop(changes,OWNER_TIDDLER)) {
			applyLanguage();
		}
	});
};