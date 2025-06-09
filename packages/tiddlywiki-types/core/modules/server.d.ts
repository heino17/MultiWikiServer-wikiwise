
// interface Route {
//   useACL: any;
//   method: string;
//   entityName: any;
//   csrfDisable: any;
//   bodyFormat: string;
//   path: { source: string; };

// }

// interface State {
//   wiki: any;
//   boot: any;
//   server: any;
//   urlInfo: any;
//   queryParameters: any;
//   pathPrefix: string;
//   sendResponse: any;
//   redirect: any;
//   streamMultipartData: any;
//   authenticatedUser: any;
//   authenticatedUsername: any;
//   authorizationType: string;
//   allowAnon: boolean;
//   anonAccessConfigured: boolean;
//   allowAnonReads: boolean;
//   allowAnonWrites: boolean;
//   showAnonConfig: boolean;
//   firstGuestUser: boolean;
//   data?: any;
// }

// interface Server {
//   enableBrowserCache: boolean;
//   enableGzip: boolean;
//   get: (key: string) => any;
//   methodMappings: { [key: string]: string };
//   isAuthorized: (authorizationType: string, username: string) => boolean;
//   getAnonymousAccessConfig: () => { allowReads: boolean; allowWrites: boolean; isEnabled: boolean; showAnonConfig: boolean };
//   sqlTiddlerDatabase: any;
//   servername: string;
//   findMatchingRoute: (req, res, state: State) => Route;
//   authenticateUser: (req, res) => any;
//   methodACLPermMappings: { [key: string]: string };
//   csrfDisable: boolean;
//   wiki: any;
//   boot: any;
// }
