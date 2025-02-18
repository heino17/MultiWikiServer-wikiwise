import { ok } from "assert";
import { rootRoute } from "../router";
import * as opaque from "@serenity-kit/opaque";
import { z } from "zod";


export default function AuthRoutes(parent: rootRoute) {

  const authRoute = parent.defineRoute({
    useACL: {},
    method: ["GET", "HEAD", "POST", "PUT"],
    bodyFormat: undefined,
    path: /^\/auth/,
    handler: async (state) => {
      return state;
    },
  });

  type authRoute = typeof authRoute;


  const userIdentifiers = new Map();
  const registrationRecords = new Map();
  const userLoginStates = new Map();
  const userSessionKeys = new Map();

  authRoute.defineRoute({
    useACL: {},
    method: ["GET", "HEAD"],
    path: /^\/register/,
    handler: async (state) => {
      return state.sendFile(200, {}, {
        root: "public",
        reqpath: "register.html",
      });
    },
  });


  authRoute.defineRoute( {
    useACL: {},
    method: ["POST"],
    bodyFormat: "www-form-urlencoded-object",
    path: /^\/register\/1/,
    zod: z.object({}),
    handler: async (state) => {
      ok(state.isBodyFormat("www-form-urlencoded-object"));
      const args = Object.fromEntries(state.data);
      const { success } = z.object({
        username: z.string(),
        registrationRequest: z.string(),
      }).safeParse(args);
      z.object({})
      if (!success) { return state.sendEmpty(400, {}); }

      const { username, registrationRequest } = args;

      const userIdentifier = userIdentifiers.get(username);
      ok(typeof userIdentifier === "string");

      const { registrationResponse } = opaque.server.createRegistrationResponse({
        serverSetup,
        userIdentifier,
        registrationRequest,
      });
      return state.sendString(200, {}, registrationResponse, "utf8");
    },
  });

  const test2 = authRoute.defineRoute({
    useACL: {},
    method: ["POST"],
    bodyFormat: "www-form-urlencoded-object",
    zod: z.object({
      username: z.string(),
      registrationRequest: z.string(),
    }),
    path: /^\/register\/2/,
    handler: async (state) => {

      // still have to make this actually take the bodyFormat into account
      ok(state.data instanceof URLSearchParams);
      const username = state.data.get("username");
      ok(typeof username === "string");
      const userIdentifier = userIdentifiers.get(username); // userId/email/username
      ok(typeof userIdentifier === "string");

      const registrationRequest = state.data.get("registrationRequest");
      ok(typeof registrationRequest === "string");

      registrationRecords.set(userIdentifier, state.data);
      return state.sendEmpty(200, {});
    },
  });
  type t2 = z.infer<typeof test2.zod & {}>;
  

  authRoute.defineRoute({
    useACL: {},
    method: ["GET", "HEAD"],
    bodyFormat: undefined,
    path: /^\/login/,
    handler: async (state) => {
      return state.sendFile(200, {}, {
        root: "public",
        reqpath: "login.html",
      });
    },
  });

  authRoute.defineRoute({
    useACL: {},
    method: ["POST"],
    bodyFormat: "www-form-urlencoded",
    path: /^\/login\/1/,
    handler: async (state) => {
      ok(state.data instanceof URLSearchParams);
      const username = state.data.get("username");
      ok(typeof username === "string");
      const userIdentifier = userIdentifiers.get(username); // userId/email/username
      ok(typeof userIdentifier === "string");

      const startLoginRequest = state.data.get("startLoginRequest");
      ok(typeof startLoginRequest === "string");

      const registrationRecord = await registrationRecords.get(userIdentifier);

      const { serverLoginState, loginResponse } = opaque.server.startLogin({
        serverSetup,
        userIdentifier,
        registrationRecord,
        startLoginRequest,
      });

      userLoginStates.set(userIdentifier, serverLoginState);

      return state.sendString(200, {}, loginResponse, "utf8");
    },
  });

  authRoute.defineRoute({
    useACL: {},
    method: ["POST"],
    bodyFormat: "www-form-urlencoded",
    path: /^\/login\/2/,
    handler: async (state) => {
      ok(state.data instanceof URLSearchParams);
      const username = state.data.get("username");
      ok(typeof username === "string");
      const userIdentifier = userIdentifiers.get(username); // userId/email/username
      ok(typeof userIdentifier === "string");
      const finishLoginRequest = state.data.get("finishLoginRequest");
      ok(typeof finishLoginRequest === "string");

      const serverLoginState = userLoginStates.get(userIdentifier);
      ok(typeof serverLoginState === "string");

      // per the spec, the sessionKey may only be returned 
      // if the client's session key has successfully signed something.
      const { sessionKey } = opaque.server.finishLogin({
        finishLoginRequest,
        serverLoginState,
      });

      userSessionKeys.set(userIdentifier, sessionKey);

      return state.sendEmpty(200, {});
    },
  });

  return authRoute;
}
declare const serverSetup: string;
async function* serverOPAQUE1(registrationRequest: string) {

  // server
  const userIdentifier = "20e14cd8-ab09-4f4b-87a8-06d2e2e9ff68"; // userId/email/username

  const { registrationResponse } = opaque.server.createRegistrationResponse({
    serverSetup,
    userIdentifier,
    registrationRequest,
  });

  const registrationRecord: string = yield registrationResponse;

  return registrationRecord;

}

async function* clientOPAQUE1() {
  // client
  const password = "sup-krah.42-UOI"; // user password

  const { clientRegistrationState, registrationRequest } = opaque.client.startRegistration({ password });

  const registrationResponse: string = yield registrationRequest;

  // client
  const { registrationRecord } = opaque.client.finishRegistration({
    clientRegistrationState,
    registrationResponse,
    password,
  });

  return registrationRecord;

}


async function* serverOPAQUE2(registrationRecord: string) {
  await opaque.ready;
  const serverSetup = opaque.server.createSetup();
  // client
  const password = "sup-krah.42-UOI"; // user password

  const { clientLoginState, startLoginRequest } = opaque.client.startLogin({
    password,
  });

  // server
  const userIdentifier = "20e14cd8-ab09-4f4b-87a8-06d2e2e9ff68"; // userId/email/username

  const { serverLoginState, loginResponse } = opaque.server.startLogin({
    serverSetup,
    userIdentifier,
    registrationRecord,
    startLoginRequest,
  });

  // client
  const loginResult = opaque.client.finishLogin({
    clientLoginState,
    loginResponse,
    password,
  });
  if (!loginResult) {
    throw new Error("Login failed");
  }
  const { finishLoginRequest, sessionKey } = loginResult;

  // server

  const { sessionKey: ssessionkey } = opaque.server.finishLogin({
    finishLoginRequest,
    serverLoginState,
  });

}

// export type authRoute = ReturnType<typeof AuthRoutes>;