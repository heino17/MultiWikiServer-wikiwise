/// <reference path="types.d.ts" />
// global css (not scoped)
import "./main.css";
import { App } from "./app";
import { LoginForm } from "./app-login";
import { AuthUser } from "@tiddlywiki/mws/src/new-managers/sessions";
import { SendError } from "@tiddlywiki/server";
import { ProfileForm } from "./app-profile";
import { SettingsForm } from "./app-settings";
import { initializeTheme } from "./theme";

// disables the "flash of white" styles
document.documentElement.classList.add("loaded");
initializeTheme();

window.addEventListener("drop", (e) => {
  e.preventDefault();
  console.log("Prevented the default browser behavior of doing stuff with dropped stuff. If you have a use case for this, please open an issue.");
});


declare global {
  const pathPrefix: string;
  const embeddedServerResponse: {
    userState: AuthUser;
    tw5Versions: string[];
    sendError?: ReturnType<SendError<any>["toJSON"]>;
    prefs?: {
      defaultLocale: string | null;
      defaultTheme: "dark" | "light" | null;
      showPinboard: boolean;
      showUserFiles: boolean;
      showWikiUpload: boolean;
      showLocaleSelect: boolean;
      showThumbnails: boolean;
      thumbnailTtlHours: number | null;
    };
  }
}

// Source - https://stackoverflow.com/a/52695341
// Posted by Gary Vernon Grubb, modified by community. 
// See post 'Timeline' for change history
// Retrieved 2026-01-30, License - CC BY-SA 4.0

const isInStandaloneMode = () => false
  || (window.matchMedia('(display-mode: standalone)').matches)
  || (window.matchMedia('(display-mode: fullscreen)').matches)
  || (window.matchMedia('(display-mode: minimal-ui)').matches)
  || ("standalone" in window.navigator && window.navigator.standalone)
  || document.referrer.includes('android-app://');

if (isInStandaloneMode()) {
  console.log("webapp is installed")
}


function setup() {
  if (location.pathname === pathPrefix + "/login" && embeddedServerResponse.userState.isLoggedIn) {
    location.replace(pathPrefix + "/");
  }
  else if (location.pathname === pathPrefix + "/login") {
    document.body.appendChild(new LoginForm());
  }
  else if (!embeddedServerResponse.userState.isLoggedIn) {
    location.pathname = pathPrefix + "/login";
  }
  else if (location.pathname === pathPrefix + "/profile") {
    document.body.appendChild(new ProfileForm());
  }
  else if (location.pathname === pathPrefix + "/settings") {
    document.body.appendChild(new SettingsForm());
  }
  else {
    document.body.appendChild(new App());
  }

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setup);
} else {
  setup();
}

