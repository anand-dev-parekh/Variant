# Move classification

How a played move gets its label and when it counts as a critical moment. Code:
`packages/chess-core/src/classify.ts` (`judgeMove`, `THRESHOLDS`) and `score.ts` (`winPercent`).
Tests: `classify.test.ts`.

## Win %

Centipawns overstate small differences in decided positions (losing 150 cp at +900 changes
nothing), so moves are judged in **win %**: Lichess's fitted curve

```
winPercent(cp) = 50 + 50 · (2 / (1 + e^(−0.00368208 · cp)) − 1)      cp clamped to ±1000
```

Mate scores map to 100 (or 0). `winPercentFor(score, color)` gives it from the mover's side.

## Judging one move

Inputs: the engine lines for the position **before** the move (best first) and the evaluation of
the position **after** it.

```
winPercentLoss = max(0, win%(best line) − win%(after the played move))
```

| Classification | Rule |
| --- | --- |
| `best` | The played move is the engine's first choice |
| `good` | Lost < 10 points |
| `inaccuracy` | Lost ≥ 10 |
| `mistake` | Lost ≥ 20 |
| `blunder` | Lost ≥ 30 |

These are Lichess's cutoffs (`THRESHOLDS` in `classify.ts`).

### Mate rules

Win % alone undersells mates, so Lichess's mate rules can make the verdict worse, never better:

- **Walking into a forced mate** is a blunder; only a mistake if the mover was already below
  −7.00, and only an inaccuracy if below −9.99.
- **Letting a forced mate slip** is a blunder; only a mistake if still above +7.00, and only an
  inaccuracy if still above +9.99.

## Only move and critical moments

- **Only move:** the best line is ≥ 20 win-% points better than the second best. The position
  demanded one specific move, whether or not it was found.
- **Critical (a turning point):** the move was a mistake or a blunder. An only move that was
  found is *not* critical on its own: in real games almost all of them are obvious recaptures,
  and branching losing alternatives off a recapture is noise. `onlyMove` is still stored for the
  detectors (M6), which can call out a genuinely hard only move.

Critical moves are where the tree branches: one engine line, the move that should have been
played, five plies long (see [analysis pipeline](analysis-pipeline.md)). In the tree they're the
cards with a mini board.

## Tuning

All numbers are in `THRESHOLDS`. After changing them, run the tests, then reclassify a few real
games (`pipeline:reclassify`) and look at where the tree branches. Branching too often makes
the tree noisy; too rarely hides the story of the game.

## Where this is going

Milestone 6 adds **detectors**: deterministic checks (hanging pieces, missed forks, and so on)
that produce a per-node fact sheet for the LLM to explain from. The design is open; the fact sheet
is meant to be pluggable so detectors can be added one at a time.
