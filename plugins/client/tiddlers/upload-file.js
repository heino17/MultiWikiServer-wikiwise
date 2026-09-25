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
	INPUT_ID = "mws-upload-file-input";

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
				notifyUploadSuccess(res);
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

function notifyUploadSuccess(res) {
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