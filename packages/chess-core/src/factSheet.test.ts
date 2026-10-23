import { describe, expect, it } from 'vitest';
import { boardFacts } from './board';
import { renderFactSheet, type FactSheet } from './factSheet';
import { parseGame } from './game';
import { OPERA_GAME_PGN } from './samples';

const game = parseGame(OPERA_GAME_PGN);

describe('renderFactSheet', () => {
  it('describes a judged move with the engine alternative and lines', () => {
    const ply = game.plies[3]!; // 2… d6
    const sheet: FactSheet = {
      fen: ply.fenAfter,
      startFen: game.startFen,
      path: game.plies.slice(0, 4).map((p) => p.san),
      source: 'game',
      board: boardFacts(ply.fenAfter),
      lastMove: {
        san: ply.san,
        fenBefore: ply.fenBefore,
        by: ply.color,
        classification: 'inaccuracy',
        winPercentLoss: 12.34,
        enginePreferred: { san: ['Nf6', 'dxe5'], score: { cp: 40 } },
      },
      analysis: { depth: 18, lines: [{ score: { cp: 95 }, san: ['dxe5', 'Bxf3'] }] },
    };
    const text = renderFactSheet(sheet);
    expect(text).toContain('Side to move: White');
    expect(text).toContain('Moves so far: 1. e4 e5 2. Nf3 d6');
    expect(text).toContain('Last move: 2… d6 by Black, judged inaccuracy, lost 12.3 win-% points');
    expect(text).toContain('Engine preferred instead: 2… Nf6 3. dxe5 (+0.40)');
    expect(text).toContain('Evaluation (depth 18): +0.95');
    expect(text).toContain('1. 3. dxe5 Bxf3 (+0.95)');
  });

  it('marks the starting position and missing analysis', () => {
    const text = renderFactSheet({
      fen: game.startFen,
      startFen: game.startFen,
      path: [],
      source: 'game',
      board: boardFacts(game.startFen),
    });
    expect(text).toContain('Moves so far: (starting position)');
    expect(text).toContain('White: King e1; Queen d1; Rooks a1 h1; Bishops c1 f1; Knights b1 g1; Pawns a2 b2');
    expect(text).toContain('Material: White 39, Black 39 in pawn units (P1 N3 B3 R5 Q9): level');
    expect(text).toContain('White pawns: 1 island; no passed pawns');
    expect(text).toContain('No saved engine analysis');
    expect(text).not.toContain('Last move');
  });

  it('reports a finished game instead of lines', () => {
    const last = game.plies.at(-1)!;
    const text = renderFactSheet({
      fen: last.fenAfter,
      startFen: game.startFen,
      path: game.plies.map((p) => p.san),
      source: 'game',
      board: boardFacts(last.fenAfter),
      lastMove: { san: last.san, fenBefore: last.fenBefore, by: last.color },
      terminal: 'checkmate',
    });
    expect(text).toContain('Last move: 17. Rd8# by White');
    expect(text).toContain('The game is over: checkmate.');
  });

  it('puts the evaluation and verdict after each move of the game continuation', () => {
    const ply = game.plies[3]!;
    const text = renderFactSheet({
      fen: ply.fenAfter,
      startFen: game.startFen,
      path: game.plies.slice(0, 4).map((p) => p.san),
      source: 'game',
      board: boardFacts(ply.fenAfter),
      continuation: { san: ['d4', 'Bg4', 'dxe5'], evals: [{ cp: 60 }, { cp: 120 }, null], verdicts: [null, 'mistake', 'best'] },
    });
    expect(text).toContain('(evaluation after each move): 3. d4 [+0.60] Bg4 [+1.20, mistake] 4. dxe5');
  });
});
