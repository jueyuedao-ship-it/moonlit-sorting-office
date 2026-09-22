import { isGameState } from './game.js';

const SAVE_VERSION = 1;
export const STORAGE_KEY = 'moonlit-sorting-office:v1';

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    activeGame: null,
    stats: {
      bestScore: 0,
      shiftsCompleted: 0
    }
  };
}

function isValidSave(value) {
  const terminalGame = value?.activeGame?.status === 'won' || value?.activeGame?.status === 'failed';
  return value !== null
    && typeof value === 'object'
    && value.version === SAVE_VERSION
    && (value.activeGame === null || isGameState(value.activeGame))
    && value.stats !== null
    && typeof value.stats === 'object'
    && Number.isInteger(value.stats.bestScore)
    && value.stats.bestScore >= 0
    && Number.isInteger(value.stats.shiftsCompleted)
    && value.stats.shiftsCompleted >= 0
    && (!terminalGame || (
      value.stats.shiftsCompleted >= 1
      && value.stats.bestScore >= value.activeGame.score
    ));
}

export function loadSave(storage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { value: createDefaultSave(), error: 'load-unavailable' };
  }

  if (raw === null) {
    return { value: createDefaultSave(), error: null };
  }

  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { value: createDefaultSave(), error: 'invalid-save' };
  }

  if (!isValidSave(value)) {
    return { value: createDefaultSave(), error: 'invalid-save' };
  }
  return { value, error: null };
}

export function saveState(storage, save) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return { value: save, error: null };
  } catch {
    return { value: save, error: 'save-unavailable' };
  }
}

export function recordFinishedShift(save, game) {
  if (!isGameState(game) || (game.status !== 'won' && game.status !== 'failed')) {
    return save;
  }
  if (save.activeGame === game) {
    return save;
  }
  return {
    ...save,
    activeGame: game,
    stats: {
      ...save.stats,
      bestScore: Math.max(save.stats.bestScore, game.score),
      shiftsCompleted: save.stats.shiftsCompleted + 1
    }
  };
}
