import {
  Agent,
  createThread,
  listMessages,
  listUIMessages,
  saveMessage,
  stepCountIs,
  syncStreams,
  vStreamArgs,
} from '@convex-dev/agent';
import { boardFacts, renderFactSheet, sideToMove, type Classification, type FactSheet, type Score } from '@variant/chess-core';
import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { api, components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx, type QueryCtx } from './_generated/server';
import { scoreOfAnalysis } from './lib/cachedEngine';
import { chatTools } from './lib/chatTools';
import { chatModelConfig } from './lib/llm';

/** Longest question accepted, in characters. */
const MAX_QUESTION = 1000;

/** Moves of the game shown after the position, with their evaluations. */
const CONTINUATION_PLIES = 6;

/** Earlier exchanges (question and answer) from the line's other chats given to the model. */
const EARLIER_EXCHANGES = 8;

/** Earlier answers are cut to this many characters in the prompt. */
const EARLIER_ANSWER_CHARS = 1200;

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
- When the player asks to see, show or play a line, add it to the tree with add_branch (after checking it with play_moves), and tell them it's in the tree.
- The earlier conversation (if any) happened at other positions on this line. Use it to follow the player's train of thought, but don't carry its claims over to this position: check them against the fact sheet and the tools.

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

type EarlierThread = { nodeId: Id<'nodes'>; threadId: string; label: string };

/** Chats at the moves leading to a node (not the node's own), oldest first. */
export const earlierThreads = query({
  args: { nodeId: v.id('nodes') },
  handler: (ctx, { nodeId }) => earlierThreadsOf(ctx, nodeId),
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
      await ctx.db.insert('threads', { nodeId, threadId, gameId: node.gameId });
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
    const threads: EarlierThread[] = await ctx.runQuery(api.chat.earlierThreads, { nodeId });
    const earlier = await earlierConversation(ctx, threads);
    const agent = new Agent(components.agent, {
      name: 'coach',
      ...chatModelConfig(),
      tools: chatTools({ nodeId, fen: sheet.fen }),
      stopWhen: stepCountIs(6),
      contextOptions: { recentMessages: 20 },
    });
    try {
      const result = await agent.streamText(
        ctx,
        { threadId },
        {
          promptMessageId,
          system: buildSystemPrompt(sheet, earlier),
          // A stalled provider would otherwise leave the reply pending until the action times out.
          abortSignal: AbortSignal.timeout(REPLY_TIMEOUT_MS),
        },
        { saveStreamDeltas: true },
      );
      await result.consumeStream();
    } catch (err) {
      console.error('chat.respond failed', err);
      // A request rejected before streaming can leave the reply pending, which would lock the
      // chat on "Thinking…". Mark anything still pending as failed so the player can ask again.
      const pending = await listMessages(ctx, components.agent, {
        threadId,
        paginationOpts: { cursor: null, numItems: 10 },
        statuses: ['pending'],
      });
      const error = err instanceof Error ? err.message : String(err);
      for (const message of pending.page) {
        await ctx.runMutation(components.agent.messages.finalizeMessage, {
          messageId: message._id,
          result: { status: 'failed', error },
        });
      }
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
    return sheet && buildSystemPrompt(sheet, await earlierConversation(ctx, await earlierThreadsOf(ctx, nodeId)));
  },
});

function buildSystemPrompt(sheet: FactSheet, earlier: string) {
  const prompt = `${INSTRUCTIONS}\n\nFact sheet for this position:\n${renderFactSheet(sheet)}`;
  return earlier ? `${prompt}\n\nEarlier conversation on this line, at other positions:\n${earlier}` : prompt;
}

async function earlierThreadsOf(ctx: QueryCtx, nodeId: Id<'nodes'>): Promise<EarlierThread[]> {
  const node = await ctx.db.get('nodes', nodeId);
  if (!node) return [];
  const rows = await ctx.db
    .query('threads')
    .withIndex('by_gameId', (q) => q.eq('gameId', node.gameId))
    .take(500);
  const threadOf = new Map(rows.map((r) => [r.nodeId, r.threadId]));
  threadOf.delete(nodeId);
  if (threadOf.size === 0) return [];

  const out: EarlierThread[] = [];
  for (let at = node; at.parentId; ) {
    const parent = await ctx.db.get('nodes', at.parentId);
    if (!parent) break;
    const threadId = threadOf.get(parent._id);
    if (threadId) out.push({ nodeId: parent._id, threadId, label: moveLabel(parent) });
    at = parent;
  }
  return out.reverse();
}

/**
 * The questions and final answers from chats at earlier moves on the line, newest last, as
 * prompt text: "At 10. Bd5:\n  Player: …\n  Coach: …". Only the most recent exchanges are kept.
 */
async function earlierConversation(ctx: QueryCtx | ActionCtx, threads: EarlierThread[]): Promise<string> {
  const sections: { label: string; exchanges: string[] }[] = [];
  let kept = 0;
  // Newest threads first, so the limit drops the oldest exchanges.
  for (const thread of [...threads].reverse()) {
    if (kept >= EARLIER_EXCHANGES) break;
    const { page } = await listMessages(ctx, components.agent, {
      threadId: thread.threadId,
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 100 },
    });
    const byOrder = new Map<number, { question?: string; answer?: string; step: number }>();
    for (const m of page) {
      const text = m.text?.trim();
      if (!text || m.status !== 'success') continue;
      const entry = byOrder.get(m.order) ?? { step: -1 };
      if (m.message?.role === 'user') entry.question = text;
      // The last text step is the answer; earlier ones are the model's working between tool calls.
      else if (m.message?.role === 'assistant' && m.stepOrder > entry.step) {
        entry.answer = text;
        entry.step = m.stepOrder;
      }
      byOrder.set(m.order, entry);
    }
    const exchanges = [...byOrder.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, e]) => (e.question && e.answer ? [`  Player: ${e.question}\n  Coach: ${clip(e.answer)}`] : []))
      .slice(-(EARLIER_EXCHANGES - kept));
    if (!exchanges.length) continue;
    kept += exchanges.length;
    sections.unshift({ label: thread.label, exchanges });
  }
  return sections.map((s) => `At ${s.label}:\n${s.exchanges.join('\n')}`).join('\n');
}

function clip(text: string) {
  return text.length > EARLIER_ANSWER_CHARS ? `${text.slice(0, EARLIER_ANSWER_CHARS)}…` : text;
}

/** "10. Bd5" or "9… Na5" for the move into a node; "the starting position" at the root. */
function moveLabel(node: Doc<'nodes'>) {
  if (!node.moveSan) return 'the starting position';
  const [, turn, , , , fullmove] = node.fen.split(' ');
  const whiteMoved = turn === 'b';
  return `${whiteMoved ? Number(fullmove) : Number(fullmove) - 1}${whiteMoved ? '.' : '…'} ${node.moveSan}`;
}

/** One-off: fills in `gameId` on threads created before it existed. `npx convex run chat:backfillThreadGames` */
export const backfillThreadGames = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const thread of await ctx.db.query('threads').take(1000)) {
      if (thread.gameId) continue;
      const node = await ctx.db.get('nodes', thread.nodeId);
      if (node) {
        await ctx.db.patch('threads', thread._id, { gameId: node.gameId });
        updated++;
      }
    }
    return updated;
  },
});

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
