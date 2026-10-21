import { formatScore, winPercent, type Score } from '@variant/chess-core';

type Props = {
  score: Score | null;
  orientation: 'white' | 'black';
};

export function EvalBar({ score, orientation }: Props) {
  const white = score ? winPercent(score) : 50;
  const label = score ? formatScore(score).replace(/^\+/, '') : '';
  const whiteAhead = white >= 50;

  return (
    <div className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`} aria-label={`Evaluation ${label}`}>
      <div className="eval-bar-white" style={{ height: `${white}%` }} />
      <span className={`eval-bar-label ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>
    </div>
  );
}
