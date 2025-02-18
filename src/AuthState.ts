
import { Streamer } from "./server";
import { AllowedMethod, AllowedMethods, RouteMatch, Router, } from "./router";
import { StateObject } from "./StateObject";

// This is a mapping of the methods to the auth levels needed to access them.
// since the root route defines the methods allowed, we just import the type from there.

const authLevelNeededForMethod: Record<AllowedMethod, "readers" | "writers" | undefined> = {
  "GET": "readers",
  "OPTIONS": "readers",
  "HEAD": "readers",
  "PUT": "writers",
  "POST": "writers",
  "DELETE": "writers"
} as const;

export interface AuthStateRouteACL {
  csrfDisable?: boolean;
  entityName?: "recipe" | "bag",
}

export class AuthState {
  private streamer!: Streamer;
  private authLevelNeeded: "readers" | "writers" = "writers";
  private cookies: Record<string, string | undefined> = {};
  private user: any;

  constructor(private router: Router) {

  }
  /** This is called as soon as the router recieves the request */
  async checkStreamer(streamer: Streamer) {
    this.streamer = streamer;
    this.parseCookieString(this.streamer.headers.cookie ?? "");
    this.authLevelNeeded = authLevelNeededForMethod[this.streamer.method] ?? "writers";
    this.user = await this.getUserBySessionId(this.cookies.session ?? "");
  }
  /** This is called after the routes are matched in the request, but before the request body is recieved. */
  async checkMatchedRoutes(routePath: RouteMatch[]) {
    routePath.forEach(match => {
      if (!this.router.csrfDisable && !match.route.useACL.csrfDisable && this.authLevelNeeded === "writers" && this.streamer.headers["x-requested-with"] !== "TiddlyWiki")
        throw this.streamer.sendString(403, {}, "'X-Requested-With' header required to login to '" + this.router.servername + "'", "utf8");
    })
  }
  /** This is called right before handing the request off to the route's handler. */
  async checkStateObject(state: StateObject) {

  }

  parseCookieString(cookieString: string) {
    if (typeof cookieString !== 'string') throw new Error('cookieString must be a string');
    cookieString.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        this.cookies[key] = decodeURIComponent(value);
      }
    });
  }

  async getUserBySessionId(session_id: string) {
    // this would be a database call
    return {
      user_id: 1,
      username: "admin",
    }
  }
  toDebug() {
    return this.user.username;
  }
}

