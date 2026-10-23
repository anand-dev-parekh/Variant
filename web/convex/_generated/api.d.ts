/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat from "../chat.js";
import type * as engine from "../engine.js";
import type * as games from "../games.js";
import type * as lib_cachedEngine from "../lib/cachedEngine.js";
import type * as lib_chatTools from "../lib/chatTools.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_remoteEngine from "../lib/remoteEngine.js";
import type * as pipeline from "../pipeline.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  engine: typeof engine;
  games: typeof games;
  "lib/cachedEngine": typeof lib_cachedEngine;
  "lib/chatTools": typeof lib_chatTools;
  "lib/llm": typeof lib_llm;
  "lib/remoteEngine": typeof lib_remoteEngine;
  pipeline: typeof pipeline;
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
