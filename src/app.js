import { createGame, getCheckpointDistrict, submitChoice } from './game.js';
import { loadSave, recordFinishedShift, saveState } from './storage.js';
import { DESTINATION_LABELS, SEAL_LABELS, WEIGHT_LABELS, toViewModel } from './presenter.js';

const TERMINAL_STATUSES = new Set(['won', 'failed']);

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getBrowserStorage();
const loaded = loadSave(storage);
let save = loaded.value;
let saveMessage = loaded.error === 'load-unavailable'
  ? 'この端末では保存できません'
  : loaded.error === 'invalid-save'
    ? '保存データを初期化しました'
    : '端末内に自動保存';
let sectionNotice = '';
let focusTicketAfterRender = false;

const elements = {
  saveStatus: document.querySelector('#save-status'),
  introPanel: document.querySelector('#intro-panel'),
  gamePanel: document.querySelector('#game-panel'),
  resultPanel: document.querySelector('#result-panel'),
  statusStrip: document.querySelector('#status-strip'),
  rulebook: document.querySelector('#rulebook'),
  ticketCard: document.querySelector('#ticket-card'),
  sortingControls: document.querySelector('#sorting-controls'),
  feedback: document.querySelector('#feedback')
};

function persist(nextSave) {
  const result = saveState(storage, nextSave);
  save = result.value;
  if (result.error === 'save-unavailable' || loaded.error === 'load-unavailable') {
    saveMessage = 'この端末では保存できません';
  } else if (!result.error) {
    saveMessage = '端末内に自動保存';
  }
}

function renderIntro(view) {
  elements.introPanel.innerHTML = `
    <p class="eyebrow">勤務前案内</p>
    <h2 id="intro-title">航路郵便を仕分ける</h2>
    <p>票の印章・地区・重量を規則帳で確認し、3つの行き先へ送ってください。18通を処理するか、3回誤配すると勤務終了です。</p>
    <div class="intro-stats" aria-label="勤務統計">
      <span>最高得点 ${save.stats.bestScore}</span><span>累計勤務 ${save.stats.shiftsCompleted}回</span>
    </div>
    <button id="start-button" class="primary-button" type="button">勤務を開始</button>
  `;
  const startButton = elements.introPanel.querySelector('#start-button');
  startButton.addEventListener('click', startShift);
}

function renderStatus(view) {
  const notice = sectionNotice ? `<p class="section-notice">${sectionNotice}</p>` : '';
  elements.statusStrip.innerHTML = `
    <span>${view.scoreText}</span>
    <span>${view.progressText}</span>
    <span>${view.mistakesText}</span>
    <span>${view.streakText}</span>
    ${notice}
  `;
}

function renderRules(view) {
  elements.rulebook.innerHTML = `
    <p class="eyebrow">規則帳</p>
    <h2 id="rules-title">優先順位</h2>
    <ol>
      <li><strong>赤印</strong>なら特急便</li>
      <li><strong>${view.checkpointDistrict}</strong>または重量なら確認台</li>
      <li>それ以外は通常便</li>
    </ol>
    <p class="rule-note">現在の要確認地区: <strong>${view.checkpointDistrict}</strong></p>
  `;
}

function renderTicket(view) {
  const ticket = view.ticket;
  if (!ticket) {
    elements.ticketCard.innerHTML = '<h2 id="ticket-title">勤務終了</h2>';
    return;
  }
  elements.ticketCard.innerHTML = `
    <p class="eyebrow">航路郵便票</p>
    <h2 id="ticket-title">${view.ticket.id}</h2>
    <dl class="ticket-facts">
      <div><dt>印章</dt><dd>${SEAL_LABELS[ticket.seal] ?? ticket.seal}</dd></div>
      <div><dt>地区</dt><dd>${ticket.district}</dd></div>
      <div><dt>重量</dt><dd>${WEIGHT_LABELS[ticket.weight] ?? ticket.weight}</dd></div>
    </dl>
  `;
}

function renderControls(view) {
  for (const button of elements.sortingControls.querySelectorAll('button[data-destination]')) {
    button.disabled = view.controlsDisabled;
    const destination = button.dataset.destination;
    button.setAttribute('aria-label', `${DESTINATION_LABELS[destination]}へ仕分け`);
  }
}

function renderGame(view) {
  renderStatus(view);
  renderRules(view);
  renderTicket(view);
  renderControls(view);
  elements.feedback.textContent = view.feedbackText;
}

function renderResult(view) {
  elements.resultPanel.innerHTML = `
    <p class="eyebrow">勤務結果</p>
    <h2 id="result-title">${view.resultText}</h2>
    <p class="result-score">${view.scoreText}</p>
    <p>正解 ${save.activeGame?.correct ?? 0}通 / 誤配 ${save.activeGame?.mistakes ?? 0}回 / 最大連続正解 ${save.activeGame?.bestStreak ?? 0}通</p>
    <p>最高得点 ${save.stats.bestScore} ・ 累計勤務 ${save.stats.shiftsCompleted}回</p>
    <button id="restart-button" class="primary-button" type="button">もう一度勤務</button>
  `;
  elements.resultPanel.querySelector('#restart-button').addEventListener('click', startShift);
}

function render() {
  const game = save.activeGame;
  const view = toViewModel(game, save.stats);
  elements.saveStatus.textContent = saveMessage;
  const showingGame = game?.status === 'playing';
  const showingResult = TERMINAL_STATUSES.has(game?.status);
  elements.introPanel.hidden = showingGame || showingResult;
  elements.gamePanel.hidden = !showingGame;
  elements.resultPanel.hidden = !showingResult;

  if (!showingGame && !showingResult) {
    renderIntro(view);
  } else if (showingGame) {
    renderGame(view);
  } else if (showingResult) {
    renderResult(view);
  }

  if (focusTicketAfterRender && !elements.gamePanel.hidden) {
    elements.ticketCard.focus();
    focusTicketAfterRender = false;
  }
}

function startShift() {
  const freshGame = { ...createGame(Date.now() >>> 0), status: 'playing' };
  sectionNotice = '';
  focusTicketAfterRender = true;
  persist({ ...save, activeGame: freshGame });
  render();
}

function chooseDestination(destination) {
  const game = save.activeGame;
  if (!game || game.status !== 'playing') return;

  const oldCheckpoint = getCheckpointDistrict(game.cursor);
  const nextGame = submitChoice(game, destination);
  if (nextGame === game) return;

  const nextCheckpoint = getCheckpointDistrict(nextGame.cursor);
  sectionNotice = oldCheckpoint !== nextCheckpoint
    ? `区間変更。要確認地区は${nextCheckpoint}です。`
    : '';
  focusTicketAfterRender = nextGame.status === 'playing' && oldCheckpoint !== nextCheckpoint;

  let nextSave = { ...save, activeGame: nextGame };
  if (!TERMINAL_STATUSES.has(game.status) && TERMINAL_STATUSES.has(nextGame.status)) {
    nextSave = recordFinishedShift(save, nextGame);
  }
  persist(nextSave);
  render();
}

for (const button of document.querySelectorAll('#sorting-controls button[data-destination]')) {
  button.addEventListener('click', () => chooseDestination(button.dataset.destination));
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
    || target.isContentEditable
  )) return;
  const destination = { '1': 'express', '2': 'review', '3': 'regular' }[event.key];
  if (!destination || !save.activeGame || save.activeGame.status !== 'playing') return;
  event.preventDefault();
  chooseDestination(destination);
});

render();
