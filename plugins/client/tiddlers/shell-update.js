/*\
title: $:/plugins/mws/client/shell-update.js
type: application/javascript
module-type: startup

Show a banner when a newer template version is available for this wiki
("notify" shell policy) and accept it on request. The banner reveals on the
state tiddler $:/state/multiwikiclient/shell-update ("yes"/"no"), which is
excluded from synchronisation, so nothing here ever writes to the store.
\*/

"use strict";

exports.name = "mws-shell-update";
exports.after = ["rootwidget"];
exports.platforms = ["browser"];
exports.synchronous = true;

var CONFIG_POLICY_TIDDLER = "$:/config/multiwikiclient/shell-policy",
	CONFIG_SERVED_TIDDLER = "$:/config/multiwikiclient/shell-release",
	CONFIG_LATEST_TIDDLER = "$:/config/multiwikiclient/shell-latest-release",
	CONFIG_OWNER_TIDDLER = "$:/config/multiwikiclient/owner",
	CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host",
	CONFIG_RECIPE_TIDDLER = "$:/config/multiwikiclient/recipe",
	DEFAULT_HOST_TIDDLER = "$protocol$//$host$/",
	STATUS_IS_LOGGED_IN_TIDDLER = "$:/status/IsLoggedIn",
	STATUS_USER_TIDDLER = "$:/status/UserName",
	STATUS_IS_ADMIN_TIDDLER = "$:/status/IsAdmin",
	STATE_UPDATE_TIDDLER = "$:/state/multiwikiclient/shell-update";

exports.startup = function() {
	if(!$tw.browser || !($tw.rootWidget && $tw.wiki)) {
		return;
	}
	computeBannerState();
	$tw.wiki.addEventListener("change",function(changes) {
		var relevant = [
			CONFIG_POLICY_TIDDLER,
			CONFIG_SERVED_TIDDLER,
			CONFIG_LATEST_TIDDLER,
			CONFIG_OWNER_TIDDLER,
			STATUS_IS_LOGGED_IN_TIDDLER,
			STATUS_USER_TIDDLER,
			STATUS_IS_ADMIN_TIDDLER
		];
		if(relevant.some(function(title) {
			return $tw.utils.hop(changes,title);
		})) {
			computeBannerState();
		}
	});
	$tw.rootWidget.addEventListener("tm-shell-update",function() {
		acceptShellUpdate();
	});
};

function parseRelease(value) {
	var n = parseInt(value,10);
	return isNaN(n) ? null : n;
}

function computeBannerState() {
	var policy = $tw.wiki.getTiddlerText(CONFIG_POLICY_TIDDLER,""),
		served = parseRelease($tw.wiki.getTiddlerText(CONFIG_SERVED_TIDDLER,"")),
		latest = parseRelease($tw.wiki.getTiddlerText(CONFIG_LATEST_TIDDLER,"")),
		owner = $tw.wiki.getTiddlerText(CONFIG_OWNER_TIDDLER,""),
		currentUser = $tw.wiki.getTiddlerText(STATUS_USER_TIDDLER,""),
		isLoggedIn = $tw.wiki.getTiddlerText(STATUS_IS_LOGGED_IN_TIDDLER,"") === "yes",
		isAdmin = $tw.wiki.getTiddlerText(STATUS_IS_ADMIN_TIDDLER,"") === "yes",
		// "notify" is the only policy that asks before updating: "auto" serves
		// the newest release anyway, "pin" stays on the pinned version by
		// deliberate choice.
		show = isLoggedIn &&
			(isAdmin || (owner !== "" && owner === currentUser)) &&
			policy === "notify" &&
			served !== null && latest !== null && latest > served;
	$tw.wiki.addTiddler({ title: STATE_UPDATE_TIDDLER, text: show ? "yes" : "no" });
}

function getHost() {
	var text = $tw.wiki.getTiddlerText(CONFIG_HOST_TIDDLER,DEFAULT_HOST_TIDDLER),
		values = {
			protocol: document.location.protocol,
			host: document.location.host,
			pathname: document.location.pathname
		};
	Object.keys(values).forEach(function(name) {
		text = $tw.utils.replaceString(text,new RegExp("\\$" + name + "\\$","mg"),values[name]);
	});
	return text;
}

function acceptShellUpdate() {
	if($tw.wiki.getTiddlerText(STATUS_IS_LOGGED_IN_TIDDLER,"") !== "yes") {
		$tw.notifier.display("$:/language/MWS/ShellUpdate/ResultForbidden");
		return;
	}
	var recipe = $tw.wiki.getTiddlerText(CONFIG_RECIPE_TIDDLER,"");
	if(!recipe) {
		return;
	}
	var xhr = new XMLHttpRequest(),
		url = getHost() + "recipe/" + encodeURIComponent(recipe) + "/shell/update";
	xhr.open("PUT",url,true);
	xhr.setRequestHeader("x-requested-with","fetch");
	xhr.setRequestHeader("accept","application/json");
	xhr.onreadystatechange = function() {
		if(xhr.readyState !== 4) {
			return;
		}
		if(xhr.status >= 200 && xhr.status < 300) {
			var result = null,
				version = $tw.wiki.getTiddlerText(CONFIG_LATEST_TIDDLER,"");
			try {
				result = JSON.parse(xhr.responseText);
			} catch(e) {}
			if(result && result.latestRelease != null) {
				version = String(result.latestRelease);
			}
			$tw.wiki.addTiddler({ title: STATE_UPDATE_TIDDLER, text: "no" });
			$tw.notifier.display("$:/language/MWS/ShellUpdate/ResultUpdated",{
				variables: { version: version }
			});
			// The new shell is inside the store the server now serves; reload
			// unless it would discard unsaved local changes.
			if(!$tw.syncer || !$tw.syncer.isDirty()) {
				window.setTimeout(function() {
					window.location.reload();
				},1500);
			}
		} else if(xhr.status === 403) {
			$tw.notifier.display("$:/language/MWS/ShellUpdate/ResultForbidden");
		} else {
			$tw.notifier.display("$:/language/MWS/ShellUpdate/ResultError");
		}
	};
	xhr.onerror = function() {
		$tw.notifier.display("$:/language/MWS/ShellUpdate/ResultError");
	};
	xhr.send();
}