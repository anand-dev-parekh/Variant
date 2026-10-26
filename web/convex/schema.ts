import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/** White's point of view: centipawns, or moves to mate (negative = White gets mated). */
export const vScore = v.union(v.object({ cp: v.number() }), v.object({ mate: v.number() }));

export const vEngineLine = v.object({
  score: vScore,
  pv: v.array(v.string()),
  san: v.array(v.string()),
});

export const vClassification = v.union(
  v.literal('best'),
  v.literal('good'),
  v.literal('inaccuracy'),
  v.literal('mistake'),
  v.literal('blunder'),
);

export const vSite = v.union(v.literal('lichess'), v.literal('chesscom'));

/** What lists and the home page show about an analyzed game, so they don't load its tree. */
export const vGameSummary = v.object({
  /** Main-line moves in SAN, from the start. */
  san: v.array(v.string()),
  /** White-POV evaluation in pawns of every main-line position (start included), clamped to ±10. */
  evals: v.array(v.number()),
  /** The turning points (critical moves and key moments), in game order. */
  moments: v.array(
    v.object({
      ply: v.number(),
      classification: vClassification,
      winPercentLoss: v.number(),
      /** The position after the move. */
      fen: v.string(),
      /** The engine's line instead, from the position before the move, and its score. */
      best: v.optional(v.object({ san: v.array(v.string()), score: vScore })),
    }),
  ),
  /** The position to show for the game: after its biggest turning point, else the final one. */
  fen: v.string(),
});

export default defineSchema({
  /** Users, sessions and OAuth accounts (Convex Auth). */
  ...authTables,

  games: defineTable({
    /** The user who imported it. Optional only for games imported before accounts existed. */
    ownerId: v.optional(v.id('users')),
    /** Anyone with this token can view the game read-only; cleared to revoke the link. */
    shareToken: v.optional(v.string()),
    /** Where an imported game came from, to avoid importing it twice. */
    origin: v.optional(v.object({ site: vSite, id: v.string() })),
    pgn: v.string(),
    white: v.string(),
    black: v.string(),
    result: v.string(),
    event: v.optional(v.string()),
    date: v.optional(v.string()),
    status: v.union(v.literal('analyzing'), v.literal('ready'), v.literal('failed')),
    error: v.optional(v.string()),
    /** Engine settings for this game's analysis pass. */
    depth: v.number(),
    multiPv: v.number(),
    /** Set when analysis finishes. */
    summary: v.optional(vGameSummary),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_shareToken', ['shareToken'])
    .index('by_ownerId_and_origin', ['ownerId', 'origin.site', 'origin.id']),

  /** One position in a game's tree. The edge from the parent (the move) lives on the child. */
  nodes: defineTable({
    gameId: v.id('games'),
    parentId: v.optional(v.id('nodes')),
    fen: v.string(),
    positionKey: v.string(),
    ply: v.number(),
    moveSan: v.optional(v.string()),
    moveUci: v.optional(v.string()),
    /** game = actually played, engine = alternative at a critical moment, user = a what-if. */
    source: v.union(v.literal('game'), v.literal('engine'), v.literal('user')),
    /** Verdict on the move into this node; set for game moves once analysis finishes. */
    classification: v.optional(vClassification),
    winPercentLoss: v.optional(v.number()),
    onlyMove: v.optional(v.boolean()),
    critical: v.optional(v.boolean()),
    /** One of a player's biggest slips that wasn't a mistake or blunder; branched like a critical move. */
    keyMoment: v.optional(v.boolean()),
  })
    .index('by_gameId_and_ply', ['gameId', 'ply'])
    .index('by_gameId_and_source_and_ply', ['gameId', 'source', 'ply'])
    .index('by_parentId', ['parentId']),

  /** Server engine output, shared by every node with the same position. */
  analyses: defineTable({
    positionKey: v.string(),
    fen: v.string(),
    engine: v.string(),
    depth: v.number(),
    multiPv: v.number(),
    /** Set for finished positions, which have no engine lines. */
    terminal: v.optional(v.union(v.literal('checkmate'), v.literal('stalemate'), v.literal('insufficient'))),
    /** Best first, White POV. */
    lines: v.array(vEngineLine),
  }).index('by_positionKey', ['positionKey']),

  /** The chat thread for a node (messages live in the agent component). Created on the first question. */
  threads: defineTable({
    nodeId: v.id('nodes'),
    threadId: v.string(),
    /** For marking chatted moves in the tree. Optional only for threads created before it existed. */
    gameId: v.optional(v.id('games')),
  })
    .index('by_nodeId', ['nodeId'])
    .index('by_gameId', ['gameId'])
    .index('by_threadId', ['threadId']),

  /** A user's chess site usernames, for importing their recent games. */
  profiles: defineTable({
    userId: v.id('users'),
    lichess: v.optional(v.string()),
    chesscom: v.optional(v.string()),
  }).index('by_userId', ['userId']),

  /** A user's own LLM key for the chat, encrypted (`lib/secrets.ts`); one per user. See `apiKeys.ts`. */
  apiKeys: defineTable({
    userId: v.id('users'),
    provider: v.union(v.literal('anthropic'), v.literal('openrouter')),
    /** The key's last four characters, all the page ever sees of it. */
    last4: v.string(),
    ciphertext: v.bytes(),
    iv: v.bytes(),
  }).index('by_userId', ['userId']),
});
