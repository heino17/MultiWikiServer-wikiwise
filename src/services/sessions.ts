
import { Streamer } from "../streamer";
import { randomBytes } from "node:crypto";
import { registerZodRoutes, Router, RouterKeyMap, RouterRouteMap, zodRoute, ZodState } from "../routes/router";
import { StateObject } from "../StateObject";
import { z } from "zod";
import { JsonValue, Z2 } from "../utils";

export interface AuthUser {
  /** User ID. 0 if the user is not logged in. */
  user_id: PrismaField<"Users", "user_id">;
  /** User role_ids. This may have length even if the user isn't logged in, to allow ACL for anon. */
  role_ids: PrismaField<"Roles", "role_id">[];
  /** Username passed to the client */
  username: PrismaField<"Users", "username">;
  /** A session_id isn't guarenteed. There may be a session even if the user isn't logged in, and may not be even if they are, depending on the the situation. */
  sessionId: PrismaField<"Sessions", "session_id"> | undefined;
  /** Is this user considered a site-admin. This is determined by the auth service, not MWS. */
  isAdmin: boolean;
  /** Is the user logged in? This also means that user_id should be 0. role_ids may still be specified. */
  isLoggedIn: boolean;
}

export const SessionKeyMap: RouterKeyMap<SessionManager, true> = {
  login1: true,
  login2: true,
  logout: true,
}


/**
 * 
 * @param path path starting with a forward slash
 * @param zodRequest the zod for state.data
 * @param inner the handler to call
 * @returns the ZodRoute
 */
export function zodSession<T extends z.ZodTypeAny, R extends JsonValue>(
  path: string,
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", Record<string, z.ZodTypeAny>, T>, prisma: PrismaTxnClient) => Promise<R>
) {
  return zodRoute(["POST"], path, z => ({}), "json", zodRequest, async state => {
    return state.$transaction(async (prisma) => await inner(state, prisma));
  });
}


export type SessionManagerMap = RouterRouteMap<SessionManager>;

export class SessionManager {

  static async defineRoutes(root: rootRoute) {
    registerZodRoutes(root, new SessionManager(), Object.keys(SessionKeyMap))
  }

  static async parseIncomingRequest(streamer: Streamer, router: Router): Promise<AuthUser> {

    const sessionId = streamer.cookies.session as PrismaField<"Sessions", "session_id"> | undefined;
    const session = sessionId && await router.engine.sessions.findUnique({
      where: { session_id: sessionId },
      select: { user: { select: { user_id: true, username: true, roles: { select: { role_id: true } } } } }
    });

    if (sessionId && session) return {
      user_id: session.user.user_id,
      username: session.user.username,
      isAdmin: session.user.roles.some(e => e.role_id === 1),
      role_ids: session.user.roles.map(e => e.role_id),
      sessionId,
      isLoggedIn: true,
    };
    else return {
      user_id: 0 as PrismaField<"Users", "user_id">,
      username: "(anon)" as PrismaField<"Users", "username">,
      isAdmin: false,
      role_ids: [] as PrismaField<"Roles", "role_id">[],
      sessionId: undefined as PrismaField<"Sessions", "session_id"> | undefined,
      isLoggedIn: false,
    };
  }

  login1 = zodSession("/login/1", z => z.object({
    username: z.prismaField("Users", "username", "string"),
    startLoginRequest: z.string(),
  }), async (state, prisma) => {
    const { username, startLoginRequest } = state.data;

    const user = await prisma.users.findUnique({
      where: { username },
      select: { user_id: true, password: true, }
    });

    if (!user) throw "User not found.";

    const { user_id, password } = user;

    const stater = state.PasswordService.LoginGenerator({
      user_id,
      startLoginRequest,
      registrationRecord: password,
    });

    const loginResponse = await stater.next(0);

    if (loginResponse.done) throw "Login failed.";

    const loginSession = await state.PasswordService.startLoginSession(stater);

    state.setCookie("loginsession", loginSession, { httpOnly: true, path: "/", secure: state.isSecure, sameSite: "Strict" });

    return { loginResponse: loginResponse.value };

  })

  login2 = zodSession("/login/2", z => z.object({
    finishLoginRequest: z.string()
  }), async (state, prisma) => {
    const { finishLoginRequest } = state.data;

    if (!state.cookies.loginsession) throw "Login session not found.";

    const stater = state.PasswordService.serverState.get(state.cookies.loginsession);

    if (!stater) throw "Login session not found.";

    const { done, value } = await stater.next(1, finishLoginRequest);

    if (!value?.session?.sessionKey) throw "Login failed.";

    const session_id = await this.createSession(prisma, value.user_id, value.session.sessionKey);

    state.setCookie("session", session_id, { httpOnly: true, path: "/", secure: state.isSecure, sameSite: "Strict" });

    return null;

  })

  logout = zodSession("/logout", z => z.undefined(), async (state, prisma) => {

    if (state.user.isLoggedIn) {
      await prisma.sessions.delete({ where: { session_id: state.user.sessionId } });
    }
    var cookies = state.headers.cookie ? state.headers.cookie.split(";") : [];
    for (var i = 0; i < cookies.length; i++) {
      var cookie = cookies[i]?.trim().split("=")[0];
      if (!cookie) continue;
      // state.setHeader("Set-Cookie", cookie + "=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict");
      state.setCookie(cookie, "", { httpOnly: true, path: "/", expires: new Date(0), secure: state.isSecure, sameSite: "Strict" });
    }

    return null;
  });

  async createSession(prisma: PrismaTxnClient, user_id: PrismaField<"Users", "user_id">, session_key: string) {
    const session_id = randomBytes(16).toString("base64url");
    return await prisma.sessions.create({
      data: {
        user_id,
        session_key,
        session_id,
        last_accessed: new Date(),
      }
    }).then(({ session_id }) => session_id);
  }
}