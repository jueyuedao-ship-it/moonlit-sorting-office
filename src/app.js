import {
  GENERATOR_CATALOG,
  UPGRADE_CATALOG,
  advance,
  buyGenerator,
  buyUpgrade,
  canPrestige,
  click,
  createGame,
  prestige
} from './game.js';
import { loadSave, saveState } from './storage.js';
import { toViewModel } from './presenter.js';
import { presentHeaderStatus } from './header-status.js';
import { registerPwa } from './pwa.js';

const PERIODIC_SAVE_MS = 10_000;
const MOON_GENERATOR_IDS = Object.freeze(['lantern', 'observatory', 'moonring', 'garden']);
const STAR_GENERATOR_IDS = Object.freeze(['starCondenser']);

function getBrowserStorage() {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function requiredElement(documentRef, id) {
  const element = documentRef.getElementById(id);
  if (!element) throw new Error(`Required idle game element is missing: #${id}`);
  return element;
}

function createTextElement(documentRef, tagName, className, text) {
  const element = documentRef.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function makeGainMessage(moonlight, stars) {
  if (moonlight <= 0 && stars <= 0) return '';
  const summaryState = {
    ...createGame(0),
    moonlight,
    stars,
    runMoonEarned: moonlight,
    runStarsEarned: stars
  };
  const summary = toViewModel(summaryState);
  const gains = [];
  if (moonlight > 0) gains.push(`月光を${summary.resources.moonlight.text}`);
  if (stars > 0) gains.push(`星屑を${summary.resources.stars.text}`);
  return `放置中に${gains.join('、')}獲得しました。`;
}

function gainsBetween(previous, next) {
  return {
    moonlight: Math.max(0, next.moonlight - previous.moonlight),
    stars: Math.max(0, next.stars - previous.stars)
  };
}

function createPurchaseCard(documentRef, { id, name, description }, action, onPurchase) {
  const card = documentRef.createElement('article');
  card.className = 'purchase-card';
  card.dataset.cardId = id;

  const heading = createTextElement(documentRef, 'h3', 'purchase-card__title', name);
  const detail = createTextElement(documentRef, 'p', 'purchase-card__description', description);
  const owned = createTextElement(documentRef, 'p', 'purchase-card__owned', '');
  const production = createTextElement(documentRef, 'p', 'purchase-card__production', '');
  const cost = createTextElement(documentRef, 'p', 'purchase-card__cost', '');
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'purchase-card__button';
  button.dataset.action = action;
  button.dataset.id = id;
  button.textContent = `${name}を購入`;
  button.setAttribute('aria-label', `${name}を購入`);
  button.addEventListener('click', onPurchase);

  card.append(heading, detail, owned, production, cost, button);

  return {
    card,
    update(item) {
      card.hidden = !item.visible;
      owned.textContent = item.owned === undefined
        ? (item.purchased ? '購入済み' : '未購入')
        : `所持 ${item.owned.toLocaleString('ja-JP')}台`;
      production.textContent = item.productionText ?? '';
      cost.textContent = item.costText ? `価格 ${item.costText}` : '';
      button.disabled = item.buyDisabled;
      button.textContent = item.purchased
        ? `${item.name}・購入済み`
        : `${item.name}を購入 (${item.costText})`;
      button.setAttribute('aria-label', item.purchased
        ? `${item.name}、購入済み`
        : `${item.name}を購入、価格 ${item.costText}`);
    }
  };
}

export function mountIdleGame({
  documentRef = globalThis.document,
  storage = getBrowserStorage(),
  now = () => Date.now(),
  setIntervalFn = (callback, milliseconds) => globalThis.setInterval(callback, milliseconds),
  clearIntervalFn = (timer) => globalThis.clearInterval(timer),
  registerPwaFn = registerPwa
} = {}) {
  if (!documentRef) throw new Error('A document is required to mount the idle game');

  const elements = Object.fromEntries([
    'game-status', 'save-status', 'pwa-status', 'activity-status',
    'moonlight-value', 'moonlight-rate', 'click-rate', 'run-moonlight',
    'collect-button', 'generator-list', 'upgrade-list', 'stars-section',
    'stars-value', 'stars-rate', 'star-generator-list', 'memory-count',
    'permanent-multiplier', 'prestige-section', 'prestige-requirements',
    'prestige-gain', 'prestige-loss', 'prestige-button', 'prestige-dialog',
    'dialog-gain', 'dialog-loss', 'cancel-prestige', 'confirm-prestige'
  ].map((id) => [id.replaceAll('-', ''), requiredElement(documentRef, id)]));

  const loaded = loadSave(storage);
  let save = loaded.value;
  let saveMessage = loaded.error === 'load-unavailable'
    ? 'この端末では保存できません'
    : loaded.error === 'invalid-save'
      ? '保存データを初期化しました'
      : '端末内に自動保存';
  let pwaMessage = '';
  let activityMessage = '';
  let lastPersistAt = now();
  let wasHidden = Boolean(documentRef.hidden);
  let starsWereVisible = toViewModel(save.game).starsVisible;

  function persist() {
    const result = saveState(storage, save);
    save = result.value;
    if (result.error === 'invalid-save') {
      saveMessage = '保存データに問題があり、保存できません';
    } else if (result.error === 'save-unavailable') {
      saveMessage = 'この端末では保存できません';
    } else if (result.error === null) {
      saveMessage = '端末内に自動保存';
    } else {
      saveMessage = '保存に失敗しました';
    }
    lastPersistAt = now();
  }

  function settleAt(timestamp, { summarize = false } = {}) {
    const previous = save.game;
    const next = advance(previous, timestamp);
    if (next === previous) return false;
    save = { ...save, game: next };
    if (summarize) {
      const gains = gainsBetween(previous, next);
      activityMessage = makeGainMessage(gains.moonlight, gains.stars);
    }
    return true;
  }

  function render() {
    const view = toViewModel(save.game);
    if (view.starsVisible && !starsWereVisible) {
      const unlockMessage = '星屑と星屑凝縮器が解放されました。';
      activityMessage = activityMessage ? `${activityMessage} ${unlockMessage}` : unlockMessage;
    }
    starsWereVisible = view.starsVisible;
    const status = presentHeaderStatus({
      saveMessage,
      pwaMessage,
      gameStatus: view.prestige.ready ? 'prestige-ready' : 'gathering'
    });

    elements.gamestatus.textContent = status.gameStatusLabel;
    elements.savestatus.textContent = status.saveStatus;
    elements.pwastatus.textContent = status.pwaStatus;
    elements.activitystatus.textContent = activityMessage;
    elements.moonlightvalue.textContent = view.resources.moonlight.text;
    elements.moonlightrate.textContent = view.production.moonlightPerSecondText;
    elements.clickrate.textContent = view.production.clickAmountText;
    elements.runmoonlight.textContent = view.resources.runMoonEarned.text;
    elements.starssection.hidden = !view.starsVisible;
    elements.starsvalue.textContent = view.resources.stars.text;
    elements.starsrate.textContent = view.production.starsPerSecondText;
    elements.memorycount.textContent = save.game.lifetime.memories.toLocaleString('ja-JP');
    elements.permanentmultiplier.textContent = view.production.permanentMultiplierText;

    for (const id of MOON_GENERATOR_IDS) generatorCards[id].update(view.generators[id]);
    for (const id of STAR_GENERATOR_IDS) starGeneratorCards[id].update(view.generators[id]);
    for (const id of Object.keys(UPGRADE_CATALOG)) upgradeCards[id].update(view.upgrades[id]);

    elements.prestigesection.hidden = !view.prestige.visible;
    elements.prestigerequirements.textContent = `${view.prestige.requirements.moonlightText} ・ ${view.prestige.requirements.starsText}`;
    elements.prestigegain.textContent = view.prestige.gainText;
    elements.prestigeloss.textContent = view.prestige.lossText;
    elements.prestigebutton.disabled = !view.prestige.ready;
    elements.dialoggain.textContent = view.prestige.gainText;
    elements.dialogloss.textContent = view.prestige.lossText;
    elements.collectbutton.setAttribute('aria-label', `月光を集める。${view.production.clickAmountText}`);
  }

  function performAction(transition, message = '') {
    const previous = save.game;
    const settled = advance(previous, now());
    const next = transition(settled);
    if (next === previous && settled === previous) return false;
    save = { ...save, game: next };
    if (message && next !== settled) activityMessage = message;
    else if (next !== settled) activityMessage = '';
    persist();
    render();
    return true;
  }

  const generatorCards = Object.fromEntries(MOON_GENERATOR_IDS.map((id) => {
    const generator = GENERATOR_CATALOG[id];
    const card = createPurchaseCard(documentRef, generator, 'buy-generator', () => {
      performAction((game) => buyGenerator(game, id), `${generator.name}を購入しました。`);
    });
    elements.generatorlist.append(card.card);
    return [id, card];
  }));

  const starGeneratorCards = Object.fromEntries(STAR_GENERATOR_IDS.map((id) => {
    const generator = GENERATOR_CATALOG[id];
    const card = createPurchaseCard(documentRef, generator, 'buy-generator', () => {
      performAction((game) => buyGenerator(game, id), `${generator.name}を購入しました。`);
    });
    elements.stargeneratorlist.append(card.card);
    return [id, card];
  }));

  const upgradeCards = Object.fromEntries(Object.entries(UPGRADE_CATALOG).map(([id, upgrade]) => {
    const card = createPurchaseCard(documentRef, upgrade, 'buy-upgrade', () => {
      performAction((game) => buyUpgrade(game, id), `${upgrade.name}を購入しました。`);
    });
    elements.upgradelist.append(card.card);
    return [id, card];
  }));

  const startupTime = now();
  const startedWithSavedGame = loaded.error === null;
  if (settleAt(startupTime, { summarize: startedWithSavedGame })) persist();

  function onCollect() {
    performAction(click);
  }

  function requestPrestige() {
    const changed = settleAt(now());
    if (changed) persist();
    render();
    if (!canPrestige(save.game)) {
      return;
    }
    const dialog = elements.prestigedialog;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  }

  function closePrestigeDialog() {
    const dialog = elements.prestigedialog;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
  }

  function confirmPrestige() {
    const previous = save.game;
    const settled = advance(previous, now());
    const next = prestige(settled);
    if (next === settled) {
      if (settled !== previous) {
        save = { ...save, game: settled };
        persist();
      }
      closePrestigeDialog();
      render();
      return;
    }
    save = { ...save, game: next };
    activityMessage = `転生しました。記憶${next.lifetime.memories.toLocaleString('ja-JP')}個の力で、次の周回を始めます。`;
    persist();
    closePrestigeDialog();
    render();
  }

  function onVisibilityChange() {
    if (documentRef.hidden) {
      wasHidden = true;
      settleAt(now());
      persist();
      return;
    }
    if (wasHidden) {
      wasHidden = false;
      settleAt(now(), { summarize: true });
      persist();
      render();
    }
  }

  function onPageHide() {
    settleAt(now());
    persist();
  }

  function onTick() {
    if (documentRef.hidden) return;
    const timestamp = now();
    settleAt(timestamp);
    if (timestamp - lastPersistAt >= PERIODIC_SAVE_MS) persist();
    render();
  }

  elements.collectbutton.addEventListener('click', onCollect);
  elements.prestigebutton.addEventListener('click', requestPrestige);
  elements.cancelprestige.addEventListener('click', closePrestigeDialog);
  elements.confirmprestige.addEventListener('click', confirmPrestige);
  documentRef.addEventListener('visibilitychange', onVisibilityChange);

  const lifecycleTarget = documentRef.defaultView ?? globalThis.window;
  lifecycleTarget?.addEventListener?.('pagehide', onPageHide);

  render();
  const timer = setIntervalFn(onTick, 1_000);
  registerPwaFn((message) => {
    pwaMessage = message;
    render();
  });

  return {
    getState: () => save.game,
    render,
    destroy() {
      clearIntervalFn(timer);
      documentRef.removeEventListener?.('visibilitychange', onVisibilityChange);
      lifecycleTarget?.removeEventListener?.('pagehide', onPageHide);
    }
  };
}

if (typeof globalThis.document !== 'undefined' && globalThis.document.getElementById('collect-button')) {
  mountIdleGame({ documentRef: globalThis.document });
}
