import { DESTINATIONS, getCheckpointDistrict } from './game.js';

const DESTINATION_LABELS = Object.freeze({
  [DESTINATIONS.EXPRESS]: '特急便',
  [DESTINATIONS.REVIEW]: '確認台',
  [DESTINATIONS.REGULAR]: '通常便'
});

const SEAL_LABELS = Object.freeze({ red: '赤印', blue: '青印', none: '印なし' });
const WEIGHT_LABELS = Object.freeze({ light: '軽便', heavy: '重量' });

function destinationLabel(destination) {
  return DESTINATION_LABELS[destination] ?? destination;
}

function feedbackText(feedback) {
  if (!feedback) return '';
  const prefix = feedback.correct ? '✓ 正解' : '× 誤配';
  if (feedback.correct) {
    return `${prefix}: ${destinationLabel(feedback.expected)}。${feedback.reason}`;
  }
  return `${prefix}。正しくは${destinationLabel(feedback.expected)}です。${feedback.reason}`;
}

export function toViewModel(game, stats = {}) {
  const playing = game?.status === 'playing';
  const cursor = Number.isInteger(game?.cursor) ? game.cursor : 0;
  const ticket = playing && Array.isArray(game.tickets) ? game.tickets[cursor] ?? null : null;
  const processed = Math.min(Math.max(cursor, 0), 18);
  const resultText = game?.status === 'won'
    ? '18通の仕分け完了'
    : game?.status === 'failed'
      ? '誤配が3回に達したため勤務終了'
      : '';

  return {
    mode: game?.status ?? 'ready',
    ticket,
    checkpointDistrict: getCheckpointDistrict(cursor),
    progressText: playing ? `${cursor + 1} / 18通` : `${processed} / 18通`,
    scoreText: `得点 ${game?.score ?? 0}`,
    mistakesText: `誤配 ${game?.mistakes ?? 0} / 3`,
    streakText: `連続正解 ${game?.streak ?? 0}`,
    feedbackText: feedbackText(game?.lastFeedback),
    resultText,
    controlsDisabled: !playing
  };
}

export { DESTINATION_LABELS, SEAL_LABELS, WEIGHT_LABELS, destinationLabel };
