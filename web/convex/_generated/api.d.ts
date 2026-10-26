/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as auth from "../auth.js";
import type * as branches from "../branches.js";
import type * as chat from "../chat.js";
import type * as engine from "../engine.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_cachedEngine from "../lib/cachedEngine.js";
import type * as lib_chatTools from "../lib/chatTools.js";
import type * as lib_chessSites from "../lib/chessSites.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_remoteEngine from "../lib/remoteEngine.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as pipeline from "../pipeline.js";
import type * as profiles from "../profiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  auth: typeof auth;
  branches: typeof branches;
  chat: typeof chat;
  engine: typeof engine;
  games: typeof games;
  http: typeof http;
  imports: typeof imports;
  "lib/access": typeof lib_access;
  "lib/cachedEngine": typeof lib_cachedEngine;
  "lib/chatTools": typeof lib_chatTools;
  "lib/chessSites": typeof lib_chessSites;
  "lib/llm": typeof lib_llm;
  "lib/remoteEngine": typeof lib_remoteEngine;
  "lib/secrets": typeof lib_secrets;
  pipeline: typeof pipeline;
  profiles: typeof profiles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
