import { createGame, isGameState } from './game.js';

const SAVE_VERSION = 1;
export const STORAGE_KEY = 'moonlight-idle:v1';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidSave(value) {
  return isRecord(value)
    && Object.keys(value).length === 2
    && Object.hasOwn(value, 'version')
    && Object.hasOwn(value, 'game')
    && value.version === SAVE_VERSION
    && isGameState(value.game);
}

export function createDefaultSave(now = Date.now()) {
  return {
    version: SAVE_VERSION,
    game: createGame(now)
  };
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
  if (!isValidSave(save)) {
    return { value: save, error: 'invalid-save' };
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return { value: save, error: null };
  } catch {
    return { value: save, error: 'save-unavailable' };
  }
}
