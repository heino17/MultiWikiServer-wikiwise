/*\
title: $:/plugins/mws/client/upload-file.js
type: application/javascript
module-type: startup

Upload files from the wiki toolbox to the MWS user-files store.
\*/

"use strict";

exports.name = "mws-upload-file";
exports.after = ["rootwidget"];
exports.platforms = ["browser"];
exports.synchronous = true;

var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host",
	CONFIG_RECIPE_TIDDLER = "$:/config/multiwikiclient/recipe",
	CONFIG_HIDE_UPLOAD_TIDDLER = "$:/config/multiwikiclient/hide-upload-file",
	DEFAULT_HOST_TIDDLER = "$protocol$//$host$/",
	UPLOAD_PATH = "api/user-files/upload",
	WIKIFILE_PATH = "api/user-files/wiki-file",
	WIKIFILES_PATH = "api/user-files/wiki-files",
	INPUT_ID = "mws-upload-file-input",
	UPLOAD_RESULT_TIDDLER = "$:/state/mws/UploadResult",
	WIKIFILES_TIDDLER = "$:/state/mws/WikiFiles";

exports.startup = function() {
	if(!$tw.browser || !($tw.rootWidget && $tw.wiki)) {
		return;
	}
	// The installation-wide "Upload files from wikis" switch can hide the button.
	if($tw.wiki.getTiddlerText(CONFIG_HIDE_UPLOAD_TIDDLER) === "yes") {
		return;
	}
	$tw.rootWidget.addEventListener("tm-upload-file",function() {
		openFilePicker();
	});
	$tw.rootWidget.addEventListener("tm-mws-wiki-files",function() {
		showWikiFiles();
	});
};

function openFilePicker() {
	if($tw.wiki.getTiddlerText("$:/status/IsLoggedIn") !== "yes") {
		$tw.notifier.display("$:/language/MWS/UploadFile/ResultNotLoggedIn");
		return;
	}
	var input = document.getElementById(INPUT_ID);
	if(!input) {
		input = document.createElement("input");
		input.id = INPUT_ID;
		input.type = "file";
		input.multiple = "multiple";
		input.style.display = "none";
		document.body.appendChild(input);
		input.addEventListener("change",function() {
			var files = Array.prototype.slice.call(input.files || []);
			input.value = "";
			if(files.length) {
				uploadFiles(getHost(),getRecipe(),files);
			}
		});
	}
	input.click();
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

function getRecipe() {
	return $tw.wiki.getTiddlerText(CONFIG_RECIPE_TIDDLER,"");
}

function uploadFiles(host,recipe,files) {
	var index = 0;
	uploadNext();
	function uploadNext() {
		if(index >= files.length) {
			return;
		}
		var file = files[index++];
		uploadFile(host,recipe,file,function(err,res) {
			if(err) {
				notifyUploadError(file,err);
			} else {
				notifyUploadSuccess(res,recipe);
			}
			uploadNext();
		});
	}
}

function uploadFile(host,recipe,file,done) {
	var formData = new FormData(),
		xhr = new XMLHttpRequest(),
		filename = file.name,
		url = host + UPLOAD_PATH;
	if(recipe) {
		url += "?recipe=" + encodeURIComponent(recipe);
	}
	formData.append("file",file);
	xhr.open("PUT",url,true);
	xhr.setRequestHeader("x-requested-with","fetch");
	xhr.setRequestHeader("accept","application/json");
	xhr.onreadystatechange = function() {
		if(xhr.readyState !== 4) {
			return;
		}
		var result = null;
		try {
			result = JSON.parse(xhr.responseText);
		} catch(e) {}
		if(xhr.status >= 200 && xhr.status < 300) {
			done(null,{
				id: result && result.file && result.file.id ? result.file.id : null,
				type: result && result.file && result.file.type ? result.file.type : "",
				filename: result && result.file && result.file.filename ? result.file.filename : filename,
				owner: result && result.owner ? result.owner.username : null
			});
		} else {
			var err = new Error("Upload failed"),
				maxBytes = xhr.getResponseHeader("x-max-bytes"),
				reason = xhr.getResponseHeader("x-reason");
			err.status = xhr.status;
			if(maxBytes) {
				err.maxBytes = maxBytes;
			}
			if(reason) {
				err.reason = reason;
			}
			done(err);
		}
	};
	xhr.onerror = function() {
		done(new Error("Network error"));
	};
	xhr.send(formData);
}

function notifyUploadSuccess(res,recipe) {
	if(res.id && recipe) {
		showUploadSnippet(res,recipe);
		return;
	}
	var username = res.owner,
		currentUser = $tw.wiki.getTiddlerText("$:/status/UserName","");
	if(username && username !== currentUser) {
		$tw.notifier.display("$:/language/MWS/UploadFile/ResultSuccessToWiki",{
			variables: { filename: res.filename, owner: username }
		});
	} else {
		$tw.notifier.display("$:/language/MWS/UploadFile/ResultSuccess",{
			variables: { filename: res.filename }
		});
	}
}

function isImageType(type) {
	return typeof type === "string" && type.indexOf("image/") === 0;
}

/** Domain-independent URL of a wiki file. The wiki page itself lives under
 *  /wiki/<slug>, so a relative "api/..." would resolve to /wiki/api/... inside
 *  a tiddler — never a working request. The leading slash keeps the URL on the
 *  current origin: no host/port is baked in, so the snippet survives a change
 *  of server address. */
function wikiFileUrl(recipe,id) {
	return "/" + WIKIFILE_PATH + "?recipe=" + encodeURIComponent(recipe) + "&id=" + encodeURIComponent(id);
}

/** The ready-to-paste reference for a wiki file: [img[…]] for images
 *  (rendered inline), embedded links for everything else. TiddlyWiki has no
 *  core [ext[…]] macro, so non-images get a plain [[label|url]] link. */
function wikiFileSnippet(file,recipe) {
	var url = wikiFileUrl(recipe,file.id);
	if(isImageType(file.type)) {
		return "[img[" + url + "]]";
	}
	var label = String(file.filename || "Download").replace(/[\]|]/g," ");
	return "[[" + label + "|" + url + "]]";
}

function showUploadSnippet(res,recipe) {
	var snippet = wikiFileSnippet(res,recipe),
		heading = $tw.wiki.getTiddlerText(
			isImageType(res.type)
				? "$:/language/MWS/UploadFile/SnippetImage"
				: "$:/language/MWS/UploadFile/SnippetFile",
			snippet);
	$tw.wiki.addTiddler({
		title: UPLOAD_RESULT_TIDDLER,
		type: "text/vnd.tiddlywiki",
		text: "! " + $tw.wiki.getTiddlerText("$:/language/MWS/WikiFiles/ButtonCaption","Files in this wiki") + "\n\n" +
			heading + "\n\n````\n" + snippet + "\n````\n"
	});
	$tw.rootWidget.dispatchEvent({ type: "tm-modal", param: UPLOAD_RESULT_TIDDLER });
}

function showWikiFiles() {
	if($tw.wiki.getTiddlerText("$:/status/IsLoggedIn") !== "yes") {
		$tw.notifier.display("$:/language/MWS/WikiFiles/NotLoggedIn");
		return;
	}
	var recipe = getRecipe();
	if(!recipe) {
		return;
	}
	var xhr = new XMLHttpRequest(),
		url = getHost() + WIKIFILES_PATH + "?recipe=" + encodeURIComponent(recipe);
	xhr.open("GET",url,true);
	xhr.setRequestHeader("x-requested-with","fetch");
	xhr.setRequestHeader("accept","application/json");
	xhr.onreadystatechange = function() {
		if(xhr.readyState !== 4) {
			return;
		}
		var result = null;
		try {
			result = JSON.parse(xhr.responseText);
		} catch(e) {}
		if(xhr.status >= 200 && xhr.status < 300 && result && Array.isArray(result.files)) {
			renderWikiFiles(result.files,recipe);
		} else {
			$tw.notifier.display("$:/language/MWS/WikiFiles/Error");
		}
	};
	xhr.onerror = function() {
		$tw.notifier.display("$:/language/MWS/WikiFiles/Error");
	};
	xhr.send();
}

function renderWikiFiles(files,recipe) {
	var entries = files.map(function(file) {
		var snippet = wikiFileSnippet(file,recipe),
			media = snippet;
		// TiddlyWiki wiki syntax: `*` list item, `''` bold (not `**`).
		return "* " + media + "\n" +
			"''" + file.filename + "''\nsnippet: ``" + snippet + "``\n";
	}).join("\n");
	var body = "! " + $tw.wiki.getTiddlerText("$:/language/MWS/WikiFiles/ButtonCaption","Files in this wiki") + "\n\n" +
		(entries || $tw.wiki.getTiddlerText("$:/language/MWS/WikiFiles/Missing","No files yet."));
	$tw.wiki.addTiddler({
		title: WIKIFILES_TIDDLER,
		type: "text/vnd.tiddlywiki",
		text: body
	});
	$tw.rootWidget.dispatchEvent({ type: "tm-modal", param: WIKIFILES_TIDDLER });
}

function notifyUploadError(file,err) {
	if(err.status === 413) {
		$tw.notifier.display("$:/language/MWS/UploadFile/ResultTooLarge",{
			variables: { filename: file.name, max: err.maxBytes ? String(Math.round(parseInt(err.maxBytes,10) / (1024 * 1024))) : "100" }
		});
	} else if(err.status === 403) {
		if(err.reason === "no write access to this wiki") {
			$tw.notifier.display("$:/language/MWS/UploadFile/ResultNoWikiWriteAccess",{
				variables: { filename: file.name }
			});
		} else {
			$tw.notifier.display("$:/language/MWS/UploadFile/ResultNotLoggedIn");
		}
	} else {
		$tw.notifier.display("$:/language/MWS/UploadFile/ResultError",{
			variables: { filename: file.name }
		});
	}
}