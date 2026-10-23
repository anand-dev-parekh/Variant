import { Agent, createThread, listUIMessages, saveMessage, stepCountIs, syncStreams, vStreamArgs } from '@convex-dev/agent';
import { boardFacts, renderFactSheet, sideToMove, type Classification, type FactSheet, type Score } from '@variant/chess-core';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { scoreOfAnalysis } from './lib/cachedEngine';
import { chatTools } from './lib/chatTools';
import { chatModelConfig } from './lib/llm';

/** Longest question accepted, in characters. */
const MAX_QUESTION = 1000;

/** Moves of the game shown after the position, with their evaluations. */
const CONTINUATION_PLIES = 6;

/** Longest a reply may take, tool calls included, before it is marked failed. */
const REPLY_TIMEOUT_MS = 120_000;

/**
 * The grounding rules (design doc). The fact sheet and tool results are the only sources of
 * chess facts; the model explains them.
 */
const INSTRUCTIONS = `You are a chess coach explaining one position from a player's game.

Ground rules:
- Stockfish and the tools decide what is true. The fact sheet below and tool results are your only sources of chess facts.
- Name a tactic, threat, material change or evaluation only if the fact sheet or a tool result shows it.
- Before discussing any move or line that isn't in the fact sheet, check it with play_moves, then evaluate the resulting position.
- The board section of the fact sheet (pieces, material, pawn structure) is exact; use it to describe the position. Don't work out moves, captures or threats from the board yourself: check them with the tools.
- "What was played next" shows the evaluation (and any mistake) after each game move; use it to show where the game turned.
- If the tools can't answer something, say so plainly rather than guess.

Call the tools you need first, without writing anything in between. Then write only the final answer for the player: no notes to yourself, no drafts.

Style: plain language for a club player, short paragraphs, standard algebraic notation with move numbers.
Scores are from White's point of view (+ is good for White); when it helps, say who is better instead.
Keep answers under about 150 words unless asked for more.`;

/** The node's thread id, or null before its first question. */
export const threadFor = query({
  args: { nodeId: v.id('nodes') },
  handler: async (ctx, { nodeId }) => {
    const row = await threadRow(ctx, nodeId);
    return row?.threadId ?? null;
  },
});

/** A thread's messages, plus live deltas of any reply still streaming (for useUIMessages). */
export const messages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator, streamArgs: vStreamArgs },
  handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
    const paginated = await listUIMessages(ctx, components.agent, { threadId, paginationOpts });
    const streams = await syncStreams(ctx, components.agent, { threadId, streamArgs });
    return { ...paginated, streams };
  },
});

/** Asks a question at a node: saves it to the node's thread (creating it) and starts the reply. */
export const send = mutation({
  args: { nodeId: v.id('nodes'), prompt: v.string() },
  handler: async (ctx, { nodeId, prompt }) => {
    const question = prompt.trim();
    if (!question) throw new ConvexError('Ask a question first.');
    if (question.length > MAX_QUESTION) throw new ConvexError(`Questions are limited to ${MAX_QUESTION} characters.`);

    const node = await ctx.db.get('nodes', nodeId);
    if (!node) throw new ConvexError('That position no longer exists.');
    const game = await ctx.db.get('games', node.gameId);
    if (game?.status !== 'ready') throw new ConvexError('Chat opens once the game is analyzed.');

    let threadId = (await threadRow(ctx, nodeId))?.threadId;
    if (!threadId) {
      threadId = await createThread(ctx, components.agent, { title: `${game.white} – ${game.black}, ply ${node.ply}` });
      await ctx.db.insert('threads', { nodeId, threadId });
    }

    const { messageId } = await saveMessage(ctx, components.agent, { threadId, prompt: question });
    await ctx.scheduler.runAfter(0, internal.chat.respond, { nodeId, threadId, promptMessageId: messageId });
    return threadId;
  },
});

/** Streams the reply to one question. Failures mark the reply failed, which the chat shows. */
export const respond = internalAction({
  args: { nodeId: v.id('nodes'), threadId: v.string(), promptMessageId: v.string() },
  handler: async (ctx, { nodeId, threadId, promptMessageId }) => {
    const sheet: FactSheet | null = await ctx.runQuery(internal.chat.factSheet, { nodeId });
    if (!sheet) return;
    const agent = new Agent(components.agent, {
      name: 'coach',
      ...chatModelConfig(),
      tools: chatTools,
      stopWhen: stepCountIs(6),
      contextOptions: { recentMessages: 20 },
    });
    try {
      const result = await agent.streamText(
        ctx,
        { threadId },
        {
          promptMessageId,
          system: buildSystemPrompt(sheet),
          // A stalled provider would otherwise leave the reply pending until the action times out.
          abortSignal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
        },
        { saveStreamDeltas: true },
      );
      await result.consumeStream();
    } catch (err) {
      // The agent has already marked the reply failed; keep the cause in the logs.
      console.error('chat.respond failed', err);
    }
  },
});

/** Everything verified about a node's position, for the prompt. */
export const factSheet = internalQuery({
  args: { nodeId: v.id('nodes') },
  handler: async (ctx, { nodeId }): Promise<FactSheet | null> => {
    const node = await ctx.db.get('nodes', nodeId);
    if (!node) return null;

    const path: Doc<'nodes'>[] = [];
    let root = node;
    while (root.parentId) {
      path.push(root);
      const parent = await ctx.db.get('nodes', root.parentId);
      if (!parent) break;
      root = parent;
    }
    path.reverse();

    const analysis = await cachedAnalysisFor(ctx, node.positionKey);
    const sheet: FactSheet = {
      fen: node.fen,
      startFen: root.fen,
      path: path.map((n) => n.moveSan!),
      source: node.source,
      board: boardFacts(node.fen),
      ...(analysis?.terminal && { terminal: analysis.terminal }),
      ...(analysis && !analysis.terminal && { analysis: { depth: analysis.depth, lines: analysis.lines.map(({ score, san }) => ({ score, san })) } }),
    };

    const parent = node.parentId ? await ctx.db.get('nodes', node.parentId) : null;
    if (parent && node.moveSan) {
      const before = await cachedAnalysisFor(ctx, parent.positionKey);
      const best = before?.lines[0];
      sheet.lastMove = {
        san: node.moveSan,
        fenBefore: parent.fen,
        by: sideToMove(parent.fen),
        ...(node.classification && { classification: node.classification }),
        ...(node.winPercentLoss !== undefined && { winPercentLoss: node.winPercentLoss }),
        ...(node.onlyMove && { onlyMove: true }),
        ...(node.keyMoment && { keyMoment: true }),
        ...(best && best.pv[0] !== node.moveUci && { enginePreferred: { san: best.san, score: best.score } }),
      };
    }

    if (node.source === 'game') {
      const san: string[] = [];
      const evals: (Score | null)[] = [];
      const verdicts: (Classification | null)[] = [];
      let at = node;
      while (san.length < CONTINUATION_PLIES) {
        const children = await ctx.db
          .query('nodes')
          .withIndex('by_parentId', (q) => q.eq('parentId', at._id))
          .take(20);
        const next = children.find((c) => c.source === 'game');
        if (!next?.moveSan) break;
        const a = await cachedAnalysisFor(ctx, next.positionKey);
        san.push(next.moveSan);
        evals.push(a && scoreOfAnalysis(a));
        verdicts.push(next.classification ?? null);
        at = next;
      }
      if (san.length) sheet.continuation = { san, evals, verdicts };
    }
    return sheet;
  },
});

/** The system prompt a reply at this node gets. `npx convex run chat:systemPrompt '{"nodeId": "…"}'` */
export const systemPrompt = internalQuery({
  args: { nodeId: v.id('nodes') },
  handler: async (ctx, { nodeId }): Promise<string | null> => {
    const sheet: FactSheet | null = await ctx.runQuery(internal.chat.factSheet, { nodeId });
    return sheet && buildSystemPrompt(sheet);
  },
});

function buildSystemPrompt(sheet: FactSheet) {
  return `${INSTRUCTIONS}\n\nFact sheet for this position:\n${renderFactSheet(sheet)}`;
}

export const cachedAnalysis = internalQuery({
  args: { positionKey: v.string() },
  handler: (ctx, { positionKey }) => cachedAnalysisFor(ctx, positionKey),
});

function cachedAnalysisFor(ctx: QueryCtx, positionKey: string) {
  return ctx.db
    .query('analyses')
    .withIndex('by_positionKey', (q) => q.eq('positionKey', positionKey))
    .first();
}

function threadRow(ctx: QueryCtx, nodeId: Id<'nodes'>) {
  return ctx.db
    .query('threads')
    .withIndex('by_nodeId', (q) => q.eq('nodeId', nodeId))
    .first();
}
