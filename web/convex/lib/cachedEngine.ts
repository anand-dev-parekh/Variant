import { positionKey, terminalScore, type Score } from '@variant/chess-core';
import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import { ANALYSIS_DEPTH, ANALYSIS_MULTIPV } from '../games';
import { ENGINE_NAME, analyzeRemote, remoteEngineConfig } from './remoteEngine';

export type CachedAnalysis = Pick<Doc<'analyses'>, 'fen' | 'depth' | 'terminal' | 'lines'>;

/**
 * A position's analysis from the shared cache, or from the engine service (then saved). Same
 * engine and settings as the game pass, so cached results stay interchangeable.
 */
export async function analyzeCached(ctx: ActionCtx, fen: string): Promise<CachedAnalysis> {
  const key = positionKey(fen);
  const cached: CachedAnalysis | null = await ctx.runQuery(internal.chat.cachedAnalysis, { positionKey: key });
  if (cached) return cached;
  const fresh = await analyzeRemote(remoteEngineConfig(), fen, { depth: ANALYSIS_DEPTH, multiPv: ANALYSIS_MULTIPV });
  await ctx.runMutation(internal.pipeline.saveAnalysis, {
    positionKey: key,
    fen,
    engine: ENGINE_NAME,
    multiPv: ANALYSIS_MULTIPV,
    ...fresh,
  });
  return { fen, ...fresh };
}

/** White-POV score of an analysis: the best line, or the fixed result of a finished game. */
export function scoreOfAnalysis(analysis: CachedAnalysis): Score | null {
  if (analysis.terminal) return terminalScore(analysis.fen, analysis.terminal);
  return analysis.lines[0]?.score ?? null;
}
