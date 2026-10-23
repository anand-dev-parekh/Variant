import type { Color } from './game';

/**
 * A numbered run of moves found in prose, e.g. "12…Nh7 13. Qxd8 Rxd8 14. Nb5". `start`/`end`
 * index the text; `number` and `side` say where the first move belongs. The moves are only
 * shaped like SAN: whether they're legal depends on the position, which the caller picks.
 */
export type MoveRun = { start: number; end: number; number: number; side: Color; san: string[] };

const NUMBER = /(\d+)(\.\.\.|…|\.)\s*/y;
const SAN = /(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=?[QRBN])?)[+#]?[!?]{0,2}/y;
const SPACE = /[ \t]+/y;

/** Every numbered move run in `text`, in order. A run must start with a move number. */
export function findMoveRuns(text: string): MoveRun[] {
  const runs: MoveRun[] = [];
  let i = 0;
  while (i < text.length) {
    const found = runAt(text, i);
    if (found) {
      runs.push(found);
      i = found.end;
    } else i++;
  }
  return runs;
}

function runAt(text: string, start: number): MoveRun | null {
  // A number glued to a word or another number ("a12.", "1.5") isn't a move number.
  if (start > 0 && /[\w.]/.test(text[start - 1]!)) return null;
  const first = numberAt(text, start);
  if (!first) return null;

  const san: string[] = [];
  let side = first.side;
  let number = first.number;
  let at = first.end;
  let end = start;
  for (;;) {
    const move = sanAt(text, at);
    if (!move) break;
    san.push(move.san);
    end = move.end;
    if (side === 'w') side = 'b';
    else {
      side = 'w';
      number++;
    }
    // The next move follows a space, after a move number that fits the sequence when it's White's
    // turn (Black's may be numbered too, "13...Rxd8").
    const gap = spaceAt(text, end);
    if (gap === null) break;
    const next = numberAt(text, gap);
    if (next) {
      if (next.number !== number || next.side !== side) break;
      at = next.end;
    } else if (side === 'w') break;
    else at = gap;
  }
  return san.length ? { start, end, number: first.number, side: first.side, san } : null;
}

function numberAt(text: string, at: number) {
  NUMBER.lastIndex = at;
  const m = NUMBER.exec(text);
  return m ? { number: Number(m[1]), side: (m[2] === '.' ? 'w' : 'b') as Color, end: NUMBER.lastIndex } : null;
}

function sanAt(text: string, at: number) {
  SAN.lastIndex = at;
  const m = SAN.exec(text);
  // A move ends at a word boundary: "Nb5," and "Nb5." count, "Nb5x" doesn't.
  if (!m || /\w/.test(text[SAN.lastIndex] ?? '')) return null;
  return { san: m[0].replace(/[!?]+$/, ''), end: SAN.lastIndex };
}

function spaceAt(text: string, at: number) {
  SPACE.lastIndex = at;
  return SPACE.exec(text) ? SPACE.lastIndex : null;
}
