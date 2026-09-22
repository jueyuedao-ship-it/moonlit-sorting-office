import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, classifyTicket, getCheckpointDistrict, submitChoice } from '../src/game.js';
import { toViewModel } from '../src/presenter.js';

test('playing view uses the current ticket and switches checkpoint at cursor six', () => {
  const game = { ...createGame(21), status: 'playing', cursor: 6, score: 450, mistakes: 1, streak: 2 };
  const view = toViewModel(game, { bestScore: 700, shiftsCompleted: 3 });
  assert.equal(view.ticket.id, game.tickets[6].id);
  assert.equal(view.checkpointDistrict, '霧ヶ丘');
  assert.equal(view.progressText, '7 / 18通');
  assert.equal(view.controlsDisabled, false);
});

test('feedback and result text explain the outcome without relying on color', () => {
  let game = { ...createGame(22), status: 'playing', cursor: 17, mistakes: 2 };
  const expected = classifyTicket(game.tickets[17], getCheckpointDistrict(17)).destination;
  const wrong = ['express', 'review', 'regular'].find((value) => value !== expected);
  game = submitChoice(game, wrong);
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
