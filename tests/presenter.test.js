import test from 'node:test';
import assert from 'node:assert/strict';
import { DESTINATIONS, createGame, classifyTicket, getCheckpointDistrict, submitChoice } from '../src/game.js';
import { toViewModel } from '../src/presenter.js';

function startGame(seed) {
  return { ...createGame(seed), status: 'playing' };
}

function expectedDestination(state) {
  return classifyTicket(state.tickets[state.cursor], getCheckpointDistrict(state.cursor)).destination;
}

function wrongDestination(state) {
  const expected = expectedDestination(state);
  return [DESTINATIONS.EXPRESS, DESTINATIONS.REVIEW, DESTINATIONS.REGULAR]
    .find((destination) => destination !== expected);
}

test('playing view uses the current ticket and switches checkpoint at cursor six', () => {
  let game = startGame(21);
  for (let index = 0; index < 6; index += 1) {
    game = submitChoice(game, index === 5 ? wrongDestination(game) : expectedDestination(game));
  }
  const view = toViewModel(game, { bestScore: 700, shiftsCompleted: 3 });
  assert.equal(view.ticket.id, game.tickets[6].id);
  assert.equal(view.checkpointDistrict, '霧ヶ丘');
  assert.equal(view.progressText, '6 / 18通');
  assert.equal(view.controlsDisabled, false);
});

test('playing view starts progress at zero processed tickets', () => {
  const view = toViewModel(startGame(20), { bestScore: 0, shiftsCompleted: 0 });
  assert.equal(view.progressText, '0 / 18通');
});

test('feedback and result text explain the outcome without relying on color', () => {
  let game = startGame(22);
  for (let index = 0; index < 17; index += 1) {
    game = submitChoice(game, index < 2 ? wrongDestination(game) : expectedDestination(game));
  }
  game = submitChoice(game, wrongDestination(game));
  const view = toViewModel(game, { bestScore: game.score, shiftsCompleted: 1 });
  assert.match(view.feedbackText, /誤配/);
  assert.match(view.feedbackText, /正しくは/);
  assert.match(view.resultText, /誤配が3回/);
  assert.equal(view.controlsDisabled, true);
});

test('feedback view model gives correct and incorrect outcomes distinct tones', () => {
  const ready = { ...createGame(23), status: 'playing' };
  const expected = classifyTicket(ready.tickets[0], getCheckpointDistrict(0)).destination;
  const success = toViewModel(submitChoice(ready, expected), { bestScore: 0, shiftsCompleted: 0 });
  assert.equal(success.feedbackTone, 'success');

  const wrong = ['express', 'review', 'regular'].find((value) => value !== expected);
  const error = toViewModel(submitChoice(ready, wrong), { bestScore: 0, shiftsCompleted: 0 });
  assert.equal(error.feedbackTone, 'error');
});
