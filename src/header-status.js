const SHIFT_STATUS_LABELS = Object.freeze({
  ready: '勤務前',
  playing: '勤務中',
  won: '勤務終了',
  failed: '勤務終了'
});

export function presentHeaderStatus({
  saveMessage = '端末内に自動保存',
  pwaMessage = '',
  gameStatus = 'ready'
} = {}) {
  return {
    saveStatus: saveMessage,
    pwaStatus: pwaMessage,
    shiftStatus: SHIFT_STATUS_LABELS[gameStatus] ?? SHIFT_STATUS_LABELS.ready
  };
}
