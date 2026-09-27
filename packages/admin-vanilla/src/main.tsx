/// <reference path="types.d.ts" />
// global css (not scoped)
import "./main.css";
import { App } from "./app";
import { LoginForm } from "./app-login";
import { LandingPage } from "./app-landing";
import { AuthUser } from "@tiddlywiki/mws/src/new-managers/sessions";
import { SendError } from "@tiddlywiki/server";
import { ProfileForm } from "./app-profile";
import { SettingsForm } from "./app-settings";
import { LegalNoticePage } from "./legal-notice";
import { initializeTheme } from "./theme";
import { CookieConsent } from "./cookie-consent";

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
    mwsVersion?: string;
    sendError?: ReturnType<SendError<any>["toJSON"]>;
    prefs?: {
      defaultLocale: string | null;
      defaultTheme: "dark" | "light" | null;
      showPinboard: boolean;
      showUserFiles: boolean;
      showWikiUpload: boolean;
      showLocaleSelect: boolean;
      showThumbnails: boolean;
      showLoginPuzzle: boolean;
      thumbnailTtlHours: number | null;
      showLanding: boolean;
      landingMessage: string | null;
      landingNews: string | null;
      landingNewsStyle: string;
      showCookieConsent: boolean;
      legalNotice: string | null;
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
  // Cookie-consent notice (bottom edge). Applies to every route: it only
  // informs about the strictly necessary login session cookie and records
  // its acceptance in localStorage, so it appears once per browser. The
  // admin can disable the banner entirely (admin.showCookieConsent).
  if (embeddedServerResponse.prefs?.showCookieConsent ?? true) {
    document.body.appendChild(new CookieConsent());
  }

  if (location.pathname === pathPrefix + "/login" && embeddedServerResponse.userState.isLoggedIn) {
    location.replace(pathPrefix + "/");
  }
  else if (location.pathname === pathPrefix + "/login") {
    document.body.appendChild(new LoginForm());
  }
  else if (location.pathname === pathPrefix + "/"
    && !embeddedServerResponse.userState.isLoggedIn
    && embeddedServerResponse.prefs?.showLanding !== false) {
    // Anonymous visitors get the public landing page instead of being sent
    // to the login form right away (unless the admin disabled it).
    document.body.appendChild(new LandingPage());
  }
  else if (location.pathname === pathPrefix + "/landing") {
    // The public landing page as a dedicated route. Works for anonymous
    // visitors and logged-in users alike: the header link "Public start page"
    // opens it in a new tab, showing exactly what anonymous visitors see.
    document.body.appendChild(new LandingPage());
  }
  else if (location.pathname === pathPrefix + "/legal-notice") {
    // The public legal-notice ("Impressum") page. Works for anonymous and
    // logged-in users alike; its content is edited on the Settings page.
    document.body.appendChild(new LegalNoticePage());
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

