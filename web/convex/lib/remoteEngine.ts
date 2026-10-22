import { sideToMove, terminalState, toWhitePov, uciLineToSan, type Score, type Terminal } from '@variant/chess-core';
import { env } from '../_generated/server';

/** Recorded on every saved analysis, so results from different engines are never mixed up. */
export const ENGINE_NAME = 'stockfish-19';

export type ServerAnalysis = {
  depth: number;
  terminal?: Terminal;
  /** Best first, White POV. */
  lines: { score: Score; pv: string[]; san: string[] }[];
};

type ServiceResponse = {
  depth: number;
  lines: { multipv: number; depth: number; score: Score; pv: string[] }[];
};

/** The native engine service (engine/server.mjs), from ENGINE_URL and ENGINE_TOKEN. */
export function remoteEngineConfig(): { url: string; token: string } {
  const url = env.ENGINE_URL;
  const token = env.ENGINE_TOKEN;
  if (!url || !token) {
    throw new Error('Engine service not configured: set ENGINE_URL and ENGINE_TOKEN (see docs/engines.md)');
  }
  // Accept a bare host ("variant-engine.fly.dev") as well as a full URL.
  const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return { url: withScheme.replace(/\/$/, ''), token };
}

/** Analyzes one position on the engine service. Retries briefly: the machine may be waking up. */
export async function analyzeRemote(
  config: { url: string; token: string },
  fen: string,
  opts: { depth: number; multiPv: number },
): Promise<ServerAnalysis> {
  const terminal = terminalState(fen);
  if (terminal) return { depth: opts.depth, terminal, lines: [] };

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    let res: Response;
    try {
      res = await fetch(`${config.url}/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ fen, depth: opts.depth, multiPv: opts.multiPv }),
      });
    } catch (err) {
      lastError = err;
      continue;
    }
    if (res.status === 502 || res.status === 503) {
      lastError = new Error(`engine service ${res.status}`);
      continue;
    }
    if (!res.ok) throw new Error(`engine service ${res.status}: ${await res.text()}`);

    const body = (await res.json()) as ServiceResponse;
    return {
      depth: body.depth,
      lines: body.lines.map((l) => ({
        score: toWhitePov(l.score, sideToMove(fen)),
        pv: l.pv,
        san: uciLineToSan(fen, l.pv),
      })),
    };
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
