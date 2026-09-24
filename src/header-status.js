const GAME_STATUS_LABELS = Object.freeze({
  gathering: '月光を集めています',
  'prestige-ready': '転生の準備が整いました'
});

export function presentHeaderStatus({
  saveMessage = '端末内に自動保存',
  pwaMessage = '',
  gameStatus = 'gathering'
} = {}) {
  return {
    saveStatus: saveMessage,
    pwaStatus: pwaMessage,
    gameStatusLabel: GAME_STATUS_LABELS[gameStatus] ?? GAME_STATUS_LABELS.gathering
  };
}
