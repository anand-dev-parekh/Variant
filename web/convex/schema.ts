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

export default defineSchema({
  games: defineTable({
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
  }),

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
    .index('by_gameId', ['gameId']),
});
